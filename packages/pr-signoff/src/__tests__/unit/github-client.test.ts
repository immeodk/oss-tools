import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGitHubClient } from '../../lib/github/github-client.js';
import type { Repository } from '../../lib/platform/types.js';

vi.mock('execa');
vi.mock('@immeodk/git-utils', () => ({
  getCurrentBranch: vi.fn().mockResolvedValue('feature/test'),
  getCurrentCommit: vi.fn().mockResolvedValue('abc123def456'),
}));

/**
 * Type-narrow mock for the global fetch function. Each test stubs the next
 * call(s) via mockFetch.mockResolvedValueOnce(jsonResponse(...)) so calls and
 * URLs can be asserted later.
 */
function jsonResponse(body: any, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? status < 400;
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('GitHubClient (PlatformAdapter for GitHub)', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const originalEnv = { ...process.env };

  const testRepo: Repository = { id: 'my-org/my-repo', name: 'my-repo' };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
    process.env.GH_TOKEN = 'test-token';
    delete process.env.GITHUB_ACTIONS;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
  });

  describe('getToken', () => {
    test('delegates to github-auth (env precedence)', async () => {
      const client = createGitHubClient('my-org', 'my-repo');
      const token = await client.getToken();
      expect(token).toBe('test-token');
    });
  });

  describe('hasSeparateCommitStatus', () => {
    test('is false (PR check == commit status on GitHub)', () => {
      expect(createGitHubClient('my-org', 'my-repo').hasSeparateCommitStatus).toBe(false);
    });
  });

  describe('isRunningInCi', () => {
    test('returns true when GITHUB_ACTIONS=true', () => {
      process.env.GITHUB_ACTIONS = 'true';
      const client = createGitHubClient('my-org', 'my-repo');
      expect(client.isRunningInCi()).toBe(true);
    });

    test('returns false otherwise', () => {
      const client = createGitHubClient('my-org', 'my-repo');
      expect(client.isRunningInCi()).toBe(false);
    });
  });

  describe('getRepositoryInfo', () => {
    test('GETs /repos/{owner}/{repo} and returns normalised Repository', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ name: 'my-repo', node_id: 'R_xyz', full_name: 'my-org/my-repo' }),
      );

      const client = createGitHubClient('my-org', 'my-repo');
      const repo = await client.getRepositoryInfo('tok', 'my-repo');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer tok',
          }),
        }),
      );
      expect(repo.name).toBe('my-repo');
      // GitHub doesn't have an AzDO-style GUID; we use the owner/repo slug as a stable id
      expect(repo.id).toBe('my-org/my-repo');
    });

    test('throws when GitHub returns 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, { status: 404 }));

      const client = createGitHubClient('my-org', 'my-repo');
      await expect(client.getRepositoryInfo('tok', 'my-repo')).rejects.toThrow(
        /GET .*\/repos\/my-org\/my-repo → 404/,
      );
    });
  });

  describe('findPullRequestId', () => {
    test('queries /pulls with head filter and returns the first open PR number', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([{ number: 42 }, { number: 43 }]));

      const client = createGitHubClient('my-org', 'my-repo');
      const id = await client.findPullRequestId('tok', testRepo);

      expect(id).toBe(42);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          '/repos/my-org/my-repo/pulls?head=my-org%3Afeature%2Ftest&state=open',
        ),
        expect.any(Object),
      );
    });

    test('returns null when no open PR exists for the branch', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse([]));

      const client = createGitHubClient('my-org', 'my-repo');
      const id = await client.findPullRequestId('tok', testRepo);

      expect(id).toBeNull();
    });

    test('uses $GITHUB_REF when running in Actions on a pull_request event', async () => {
      process.env.GITHUB_ACTIONS = 'true';
      process.env.GITHUB_EVENT_NAME = 'pull_request';
      process.env.GITHUB_HEAD_REF = 'pr-branch-name';
      mockFetch.mockResolvedValueOnce(jsonResponse([{ number: 99 }]));

      const client = createGitHubClient('my-org', 'my-repo');
      const id = await client.findPullRequestId('tok', testRepo);

      expect(id).toBe(99);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('head=my-org%3Apr-branch-name'),
        expect.any(Object),
      );
    });
  });

  describe('getPrDetails', () => {
    test('GETs /pulls/{n} and populates labels', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ number: 5, title: 'Test PR', state: 'open', head: { sha: 'abc' } }),
        )
        .mockResolvedValueOnce(jsonResponse([{ name: 'signoff-method-local' }]));

      const client = createGitHubClient('my-org', 'my-repo');
      const pr = await client.getPrDetails('tok', testRepo, 5);

      expect(pr.pullRequestId).toBe(5);
      expect(pr.title).toBe('Test PR');
      expect(pr.labels).toEqual([{ id: undefined, name: 'signoff-method-local', active: true }]);
    });
  });

  describe('createCommitStatusCheck', () => {
    test('POSTs to /statuses/{sha} with translated state and context', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

      const client = createGitHubClient('my-org', 'my-repo');
      await client.createCommitStatusCheck(
        'tok',
        testRepo,
        'deadbeef',
        'Verified by tests',
        'pr-signoff',
        7,
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo/statuses/deadbeef',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"state":"success"'),
        }),
      );
      const body = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
      expect(body.state).toBe('success');
      expect(body.description).toBe('Verified by tests');
      expect(body.context).toBe('pr-signoff');
      // target_url should point at the PR when prId is supplied
      expect(body.target_url).toBe('https://github.com/my-org/my-repo/pull/7');
    });

    test('falls back to commit URL when no prId is provided', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

      const client = createGitHubClient('my-org', 'my-repo');
      await client.createCommitStatusCheck('tok', testRepo, 'cafef00d', 'msg', 'pr-signoff');

      const body = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
      expect(body.target_url).toBe('https://github.com/my-org/my-repo/commit/cafef00d');
    });
  });

  describe('createPrStatusCheck', () => {
    test('collapses to a commit status on the PR head SHA', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 201 }));

      const client = createGitHubClient('my-org', 'my-repo');
      await client.createPrStatusCheck('tok', testRepo, 5, 'msg', 'sha-from-pr', 'pr-signoff');

      // Only one status call (no PR-iteration concept on GitHub)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo/statuses/sha-from-pr',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getPrChanges', () => {
    test('GETs /pulls/{n}/files and returns the filenames', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse([{ filename: 'src/foo.ts' }, { filename: 'README.md' }]),
      );

      const client = createGitHubClient('my-org', 'my-repo');
      const changes = await client.getPrChanges('tok', testRepo, 5);

      expect(changes).toEqual(['src/foo.ts', 'README.md']);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/my-org/my-repo/pulls/5/files?per_page=100',
        expect.any(Object),
      );
    });

    test('returns empty array on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 500 }));

      const client = createGitHubClient('my-org', 'my-repo');
      const changes = await client.getPrChanges('tok', testRepo, 5);

      expect(changes).toEqual([]);
    });
  });

  describe('getStatusChecks', () => {
    test('GETs /commits/{sha}/status, normalises state and returns array', async () => {
      // First fetch resolves PR head SHA
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ number: 5, head: { sha: 'pr-head-sha' } }))
        // Second fetch returns the combined status payload
        .mockResolvedValueOnce(
          jsonResponse({
            statuses: [
              {
                state: 'success',
                description: 'all good',
                context: 'pr-signoff',
                target_url: 'https://example.com',
                created_at: '2026-05-26T12:00:00Z',
              },
              {
                state: 'failure',
                description: 'nope',
                context: 'other-check',
                created_at: '2026-05-26T11:00:00Z',
              },
            ],
          }),
        );

      const client = createGitHubClient('my-org', 'my-repo');
      const checks = await client.getStatusChecks('tok', testRepo, 5);

      expect(checks).toHaveLength(2);
      expect(checks[0].state).toBe('succeeded');
      expect(checks[0].context.name).toBe('pr-signoff');
      expect(checks[1].state).toBe('failed');
    });
  });
});

describe('GitHubClient.createPullRequest', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const testRepo: Repository = { id: 'my-org/my-repo', name: 'my-repo' };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
    process.env.GH_TOKEN = 'test-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('POSTs to /pulls with mapped fields and returns PR with pullRequestId', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        { number: 42, html_url: 'https://github.com/my-org/my-repo/pull/42', title: 'My PR' },
        { status: 201 },
      ),
    );

    const client = createGitHubClient('my-org', 'my-repo');
    const pr = await client.createPullRequest('tok', testRepo, {
      title: 'My PR',
      description: 'body text',
      sourceBranch: 'feature/x',
      targetBranch: 'main',
      isDraft: true,
    });

    expect(pr.pullRequestId).toBe(42);
    expect(pr.title).toBe('My PR');
    expect(pr.url).toBe('https://github.com/my-org/my-repo/pull/42');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/repos/my-org/my-repo/pulls',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
    expect(body.title).toBe('My PR');
    expect(body.body).toBe('body text');
    expect(body.head).toBe('feature/x');
    expect(body.base).toBe('main');
    expect(body.draft).toBe(true);
  });

  test('applies labels via a second POST to /issues/{n}/labels after PR creation', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          { number: 5, html_url: 'https://github.com/my-org/my-repo/pull/5', title: 'PR' },
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(jsonResponse([{ name: 'signoff-method-local' }]));

    const client = createGitHubClient('my-org', 'my-repo');
    await client.createPullRequest('tok', testRepo, {
      title: 'PR',
      sourceBranch: 'a',
      targetBranch: 'b',
      labels: ['signoff-method-local'],
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1]![0]).toBe(
      'https://api.github.com/repos/my-org/my-repo/issues/5/labels',
    );
    const labelBody = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(labelBody.labels).toEqual(['signoff-method-local']);
  });

  test('throws on PR creation failure', async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ message: 'Validation Failed' }, { status: 422 }),
    );

    const client = createGitHubClient('my-org', 'my-repo');
    await expect(
      client.createPullRequest('tok', testRepo, {
        title: 'x',
        sourceBranch: 'a',
        targetBranch: 'b',
      }),
    ).rejects.toThrow(/POST .*\/pulls → 422/);
  });
});

describe('GitHubClient.updatePullRequestLabels', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const testRepo: Repository = { id: 'my-org/my-repo', name: 'my-repo' };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
    process.env.GH_TOKEN = 'test-token';
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('replaces the full label set with a PUT to /issues/{n}/labels', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([{ name: 'kept' }]))
      // PR refresh after label update
      .mockResolvedValueOnce(jsonResponse({ number: 7, title: 'PR' }))
      // Labels re-read inside getPrDetails
      .mockResolvedValueOnce(jsonResponse([{ name: 'kept' }]));

    const client = createGitHubClient('my-org', 'my-repo');
    const pr = await client.updatePullRequestLabels('tok', testRepo, 7, [{ name: 'kept' }]);

    expect(pr.pullRequestId).toBe(7);
    expect(mockFetch.mock.calls[0]![0]).toBe(
      'https://api.github.com/repos/my-org/my-repo/issues/7/labels',
    );
    expect((mockFetch.mock.calls[0]![1] as any).method).toBe('PUT');
    const body = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
    expect(body.labels).toEqual(['kept']);
  });

  test('throws when GitHub returns non-OK', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Forbidden' }, { status: 403 }));

    const client = createGitHubClient('my-org', 'my-repo');
    await expect(
      client.updatePullRequestLabels('tok', testRepo, 7, [{ name: 'x' }]),
    ).rejects.toThrow(/failed to update labels|forbidden/i);
  });
});
