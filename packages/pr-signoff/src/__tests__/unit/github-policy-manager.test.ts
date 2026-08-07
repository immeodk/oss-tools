import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGitHubPolicyManager } from '../../lib/github/github-policy-manager.js';
import type { Repository } from '../../lib/platform/types.js';

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

describe('GitHubPolicyManager.setupPolicy', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;
  const repo: Repository = { id: 'my-org/my-repo', name: 'my-repo' };

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('creates a new ruleset with required status check when none exists', async () => {
    // List call returns empty -> no existing ruleset
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      // Create call returns the new ruleset
      .mockResolvedValueOnce(jsonResponse({ id: 42, name: 'pr-signoff' }, { status: 201 }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    const result = await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: true,
    });

    expect(result.action).toBe('created');
    expect(result.policyId).toBe(42);
    expect(result.repository).toBe('my-repo');
    expect(result.targetBranch).toBe('main');
    expect(result.required).toBe(true);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    // First call: list rulesets
    expect(mockFetch.mock.calls[0]![0]).toBe(
      'https://api.github.com/repos/my-org/my-repo/rulesets',
    );
    // Second call: POST a new ruleset
    const createCall = mockFetch.mock.calls[1]!;
    expect(createCall[0]).toBe('https://api.github.com/repos/my-org/my-repo/rulesets');
    expect((createCall[1] as any).method).toBe('POST');

    const body = JSON.parse((createCall[1] as any).body);
    expect(body.name).toBe('pr-signoff');
    expect(body.target).toBe('branch');
    expect(body.enforcement).toBe('active');
    expect(body.conditions.ref_name.include).toEqual(['refs/heads/main']);
    expect(body.rules).toHaveLength(1);
    expect(body.rules[0].type).toBe('required_status_checks');
    expect(body.rules[0].parameters.required_status_checks).toEqual([{ context: 'pr-signoff' }]);
  });

  test('updates an existing ruleset when one with matching name is found', async () => {
    mockFetch
      // Listing returns an existing ruleset with name matching contextName
      .mockResolvedValueOnce(
        jsonResponse([
          { id: 99, name: 'pr-signoff', enforcement: 'evaluate' },
          { id: 100, name: 'other-rule', enforcement: 'active' },
        ]),
      )
      // PUT response
      .mockResolvedValueOnce(jsonResponse({ id: 99, name: 'pr-signoff' }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    const result = await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: true,
    });

    expect(result.action).toBe('updated');
    expect(result.policyId).toBe(99);
    expect(mockFetch.mock.calls[1]![0]).toBe(
      'https://api.github.com/repos/my-org/my-repo/rulesets/99',
    );
    expect((mockFetch.mock.calls[1]![1] as any).method).toBe('PUT');
  });

  test('sets enforcement to "evaluate" when required is false (optional policy)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 5 }, { status: 201 }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: false,
    });

    const body = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(body.enforcement).toBe('evaluate');
  });

  test('targets the configured branch via refs/heads/{branch}', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ id: 5 }, { status: 201 }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'develop',
      required: true,
    });

    const body = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(body.conditions.ref_name.include).toEqual(['refs/heads/develop']);
  });

  test('throws actionable error when GitHub returns 403 (plan does not include rulesets)', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse({ message: 'Upgrade required' }, { status: 403 }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    await expect(
      manager.setupPolicy('tok', repo, 'pr-signoff', {
        targetBranch: 'main',
        required: true,
      }),
    ).rejects.toThrow(/POST .*\/rulesets → 403/);
  });

  test('throws when list call fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, { status: 401 }));

    const manager = createGitHubPolicyManager('my-org', 'my-repo');
    await expect(
      manager.setupPolicy('tok', repo, 'pr-signoff', {
        targetBranch: 'main',
        required: true,
      }),
    ).rejects.toThrow(/GET .*\/rulesets → 401|Bad credentials/i);
  });
});
