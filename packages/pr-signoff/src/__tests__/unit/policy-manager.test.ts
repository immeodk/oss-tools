import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createPolicyManager } from '../../lib/azure/policy-manager.js';
import type { Repository } from '../../lib/platform/types.js';

function jsonResponse(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200;
  return {
    ok: status < 400,
    status,
    statusText: status < 400 ? 'OK' : 'Error',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const STATUS_POLICY_TYPE = 'cbdc66da-9728-4af8-aada-9a5a32e4a226';
const repo: Repository = { id: 'repo-guid', name: 'my-repo' };

describe('AzureDevOps PolicyManager.setupPolicy', () => {
  const mockFetch = vi.fn();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    globalThis.fetch = mockFetch as any;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test('creates a new status-check policy when none exists', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ value: [] })) // getBranchPolicies
      .mockResolvedValueOnce(jsonResponse({ id: 7 }, { status: 200 })); // create

    const manager = createPolicyManager('org', 'proj');
    const result = await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: true,
    });

    expect(result.action).toBe('created');
    expect(result.policyId).toBe(7);
    expect(result.repository).toBe('my-repo');
    expect(result.targetBranch).toBe('main');

    const createBody = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(createBody.type.id).toBe(STATUS_POLICY_TYPE);
    expect(createBody.isBlocking).toBe(true);
    expect(createBody.settings.statusName).toBe('pr-signoff');
    expect(createBody.settings.scope[0].refName).toBe('refs/heads/main');
  });

  test('updates the existing policy when one matches the context name', async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          value: [
            { id: 99, type: { displayName: 'Status' }, settings: { statusName: 'pr-signoff' } },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 99 }));

    const manager = createPolicyManager('org', 'proj');
    const result = await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: true,
    });

    expect(result.action).toBe('updated');
    expect(result.policyId).toBe(99);
    expect((mockFetch.mock.calls[1]![1] as any).method).toBe('PUT');
    expect(mockFetch.mock.calls[1]![0]).toContain('/policy/configurations/99');
  });

  test('sets isBlocking=false for an optional policy', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ value: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 1 }));

    const manager = createPolicyManager('org', 'proj');
    await manager.setupPolicy('tok', repo, 'pr-signoff', { targetBranch: 'main', required: false });

    const createBody = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(createBody.isBlocking).toBe(false);
  });

  test('adds a filenamePatterns filter when scopedFolder is provided', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ value: [] }))
      .mockResolvedValueOnce(jsonResponse({ id: 2 }));

    const manager = createPolicyManager('org', 'proj');
    await manager.setupPolicy('tok', repo, 'pr-signoff', {
      targetBranch: 'main',
      required: true,
      scopedFolder: 'tools/pr-signoff/',
    });

    const createBody = JSON.parse((mockFetch.mock.calls[1]![1] as any).body);
    expect(createBody.settings.filenamePatterns).toEqual(['/tools/pr-signoff/*']);
  });

  test('throws when the policy listing request fails', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ message: 'Unauthorized' }, { status: 401 }));

    const manager = createPolicyManager('org', 'proj');
    await expect(
      manager.setupPolicy('tok', repo, 'pr-signoff', { targetBranch: 'main', required: true }),
    ).rejects.toThrow(/GET .*\/policy\/configurations.*→ 401/);
  });
});
