import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa } from 'execa';
import { getCurrentBranch, getCurrentCommit } from '@immeodk/git-utils';
import { createAzureDevOpsClient } from '../../lib/azure/azure-devops-client.js';
import { HttpError, AuthError } from '../../lib/errors.js';
import type { Repository } from '../../lib/platform/types.js';

vi.mock('execa', () => ({ execa: vi.fn() }));
vi.mock('@immeodk/git-utils', () => ({
  getCurrentBranch: vi.fn(),
  getCurrentCommit: vi.fn(),
}));

function jsonResponse(body: unknown, init: { status?: number; text?: string } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => init.text ?? JSON.stringify(body),
  } as Response;
}

const config = {
  azureDevOps: { organization: 'org', project: 'proj', tenantId: 'tid' },
  signoff: { commands: ['npm test'] },
} as any;

const repo: Repository = { id: 'repo-guid', name: 'my-repo' };

function makeClient() {
  return createAzureDevOpsClient('org', 'proj', config);
}

describe('AzureDevOpsClient', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const mockExeca = vi.mocked(execa);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
    // Re-establish git-utils mock return values (afterEach's restoreAllMocks clears them).
    vi.mocked(getCurrentBranch).mockResolvedValue('feature/test');
    vi.mocked(getCurrentCommit).mockResolvedValue('abcdef1234567890');
    for (const k of [
      'TF_BUILD',
      'BUILD_REASON',
      'AZURE_DEVOPS_TOKEN',
      'SYSTEM_PULLREQUEST_PULLREQUESTID',
    ]) {
      delete process.env[k];
    }
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('isRunningInCi', () => {
    test('true when TF_BUILD is set', () => {
      process.env.TF_BUILD = 'True';
      expect(makeClient().isRunningInCi()).toBe(true);
    });
    test('false otherwise', () => {
      expect(makeClient().isRunningInCi()).toBe(false);
    });
  });

  describe('getToken', () => {
    test('uses the pipeline token from env when in a pipeline', async () => {
      process.env.TF_BUILD = 'True';
      process.env.AZURE_DEVOPS_TOKEN = 'pipeline-token';
      const token = await makeClient().getToken();
      expect(token).toBe('pipeline-token');
      expect(mockExeca).not.toHaveBeenCalled();
    });

    test('acquires a token via az when logged into the correct tenant', async () => {
      mockExeca.mockImplementation((_cmd: any, args: any) => {
        if (args.includes('show')) return Promise.resolve({ stdout: '{"tenantId":"tid"}' } as any);
        if (args.includes('get-access-token'))
          return Promise.resolve({ stdout: '{"accessToken":"az-token"}' } as any);
        return Promise.resolve({ stdout: '' } as any);
      });
      const token = await makeClient().getToken();
      expect(token).toBe('az-token');
    });

    test('throws AuthError when the token call fails', async () => {
      mockExeca.mockImplementation((_cmd: any, args: any) => {
        if (args.includes('show')) return Promise.resolve({ stdout: '{"tenantId":"tid"}' } as any);
        if (args.includes('get-access-token')) return Promise.reject(new Error('az exploded'));
        return Promise.resolve({ stdout: '' } as any);
      });
      await expect(makeClient().getToken()).rejects.toBeInstanceOf(AuthError);
    });
  });

  describe('getRepositoryInfo', () => {
    test('returns the normalised repository', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ id: 'guid-1', name: 'my-repo' }));
      const result = await makeClient().getRepositoryInfo('tok', 'my-repo');
      expect(result).toEqual({ id: 'guid-1', name: 'my-repo' });
      expect(mockFetch.mock.calls[0]![0]).toContain('/_apis/git/repositories/my-repo');
    });

    test('throws HttpError on a 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'gone' }, { status: 404 }));
      await expect(makeClient().getRepositoryInfo('tok', 'x')).rejects.toBeInstanceOf(HttpError);
    });
  });

  describe('findPullRequestId', () => {
    test('returns the first active PR for the branch', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ value: [{ pullRequestId: 55 }, { pullRequestId: 56 }] }),
      );
      expect(await makeClient().findPullRequestId('tok', repo)).toBe(55);
    });

    test('returns null when there is no active PR', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ value: [] }));
      expect(await makeClient().findPullRequestId('tok', repo)).toBeNull();
    });

    test('uses the pipeline PR id from env when in a pipeline', async () => {
      process.env.TF_BUILD = 'True';
      process.env.SYSTEM_PULLREQUEST_PULLREQUESTID = '321';
      expect(await makeClient().findPullRequestId('tok', repo)).toBe(321);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getPrDetails', () => {
    test('normalises AzDO fields and attaches labels', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({
            pullRequestId: 5,
            title: 'My PR',
            status: 'active',
            sourceRefName: 'refs/heads/feature/x',
            targetRefName: 'refs/heads/main',
            createdBy: { displayName: 'Dev', uniqueName: 'dev@x' },
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({ value: [{ id: 'l1', name: 'signoff-method-local', active: true }] }),
        );

      const pr = await makeClient().getPrDetails('tok', repo, 5);
      expect(pr.pullRequestId).toBe(5);
      expect(pr.title).toBe('My PR');
      expect(pr.status).toBe('active');
      expect(pr.sourceRefName).toBe('refs/heads/feature/x');
      expect(pr.createdBy).toEqual({ displayName: 'Dev', uniqueName: 'dev@x' });
      expect(pr.labels).toEqual([{ id: 'l1', name: 'signoff-method-local', active: true }]);
    });
  });

  describe('getStatusChecks', () => {
    test('maps policy evaluations to status checks (primary path)', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: 'proj-guid' })) // project
        .mockResolvedValueOnce(
          jsonResponse({
            value: [
              {
                configuration: {
                  type: { displayName: 'Status' },
                  settings: { statusName: 'pr-signoff' },
                },
                status: 'approved',
                startedDate: '2026-05-27T00:00:00Z',
              },
            ],
          }),
        );

      const checks = await makeClient().getStatusChecks('tok', repo, 5);
      expect(checks).toHaveLength(1);
      expect(checks[0]!.state).toBe('succeeded');
      expect(checks[0]!.context.name).toBe('pr-signoff');
    });

    test('falls back to the statuses list when there are no policy evaluations', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ id: 'proj-guid' })) // project
        .mockResolvedValueOnce(jsonResponse({ value: [] })) // no policy evaluations → throws internally
        .mockResolvedValueOnce(
          jsonResponse({
            value: [
              {
                state: 'succeeded',
                description: 'ok',
                context: { name: 'pr-signoff' },
                targetUrl: 'https://dev.azure.com/org/proj/_git/my-repo/commit/abcdef1234567890',
                creationDate: '2026-05-27T00:00:00Z',
              },
            ],
          }),
        );

      const checks = await makeClient().getStatusChecks('tok', repo, 5);
      expect(checks).toHaveLength(1);
      expect(checks[0]!.context.name).toBe('pr-signoff');
    });
  });

  describe('createCommitStatusCheck', () => {
    test('POSTs a succeeded status and returns the response', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 200 }));
      const res = await makeClient().createCommitStatusCheck(
        'tok',
        repo,
        'sha',
        'msg',
        'pr-signoff',
        5,
      );
      expect(res.ok).toBe(true);
      const body = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
      expect(body.state).toBe('succeeded');
      expect(body.context.name).toBe('pr-signoff');
    });

    test('throws when the status POST fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 403 }));
      await expect(
        makeClient().createCommitStatusCheck('tok', repo, 'sha', 'msg', 'pr-signoff'),
      ).rejects.toThrow(/failed to create status check/i);
    });
  });

  describe('createPrStatusCheck', () => {
    test('matches the iteration for the commit and POSTs the PR status', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ value: [{ id: 1, sourceRefCommit: { commitId: 'abcdef1234567890' } }] }),
        )
        .mockResolvedValueOnce(jsonResponse({}, { status: 200 }));

      const res = await makeClient().createPrStatusCheck(
        'tok',
        repo,
        5,
        'msg',
        'abcdef1234567890',
        'pr-signoff',
      );
      expect(res.ok).toBe(true);
      const body = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
      expect(body.iterationId).toBe(1);
    });
  });

  describe('getPrChanges', () => {
    test('returns changed file paths from the latest iteration', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ value: [{ id: 1 }, { id: 2 }] })) // iterations
        .mockResolvedValueOnce(
          jsonResponse({
            changeEntries: [{ item: { path: '/src/a.ts' } }, { item: { path: '/README.md' } }],
          }),
        );
      expect(await makeClient().getPrChanges('tok', repo, 5)).toEqual(['src/a.ts', 'README.md']);
    });

    test('returns [] when the iterations call fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 500 }));
      expect(await makeClient().getPrChanges('tok', repo, 5)).toEqual([]);
    });
  });

  describe('createPullRequest', () => {
    test('POSTs the PR and applies labels', async () => {
      mockFetch
        .mockResolvedValueOnce(jsonResponse({ pullRequestId: 9, title: 'New' })) // create
        .mockResolvedValueOnce(jsonResponse({})); // label add

      const pr = await makeClient().createPullRequest('tok', repo, {
        title: 'New',
        sourceBranch: 'feature/x',
        targetBranch: 'main',
        labels: ['signoff-method-local'],
      });

      expect(pr.pullRequestId).toBe(9);
      expect(pr.url).toContain('/pullrequest/9');
      expect(pr.labels).toEqual([{ name: 'signoff-method-local' }]);
      const createBody = JSON.parse((mockFetch.mock.calls[0]![1] as any).body);
      expect(createBody.sourceRefName).toBe('refs/heads/feature/x');
      expect(createBody.targetRefName).toBe('refs/heads/main');
    });
  });

  describe('getPullRequestLabels', () => {
    test('returns normalised labels', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ value: [{ id: 'a', name: 'lbl', active: true }] }),
      );
      expect(await makeClient().getPullRequestLabels('tok', repo, 5)).toEqual([
        { id: 'a', name: 'lbl', active: true },
      ]);
    });

    test('returns [] on a 404', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({}, { status: 404 }));
      expect(await makeClient().getPullRequestLabels('tok', repo, 5)).toEqual([]);
    });
  });

  describe('updatePullRequestLabels', () => {
    test('deletes existing labels, adds new ones, and returns refreshed PR', async () => {
      mockFetch
        .mockResolvedValueOnce(
          jsonResponse({ value: [{ id: 'old', name: 'old-label', active: true }] }),
        ) // current labels
        .mockResolvedValueOnce(jsonResponse({}, { status: 200 })) // delete old-label
        .mockResolvedValueOnce(jsonResponse({}, { status: 200 })) // add new label
        .mockResolvedValueOnce(jsonResponse({ pullRequestId: 5, title: 'PR' })); // refetch

      const pr = await makeClient().updatePullRequestLabels('tok', repo, 5, [
        { name: 'signoff-method-pipeline' },
      ]);
      expect(pr.pullRequestId).toBe(5);
      expect(pr.labels).toEqual([{ name: 'signoff-method-pipeline' }]);

      const deleteCall = mockFetch.mock.calls[1]!;
      expect((deleteCall[1] as any).method).toBe('DELETE');
      const addCall = mockFetch.mock.calls[2]!;
      expect((addCall[1] as any).method).toBe('POST');
    });
  });
});
