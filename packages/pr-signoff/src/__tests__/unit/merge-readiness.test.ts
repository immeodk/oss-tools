import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock chalk to return plain text for testing
vi.mock('chalk', () => ({
  default: {
    green: vi.fn((text: string) => text),
    yellow: vi.fn((text: string) => text),
    red: vi.fn((text: string) => text),
    dim: vi.fn((text: string) => text),
    bold: vi.fn((text: string) => text),
  },
}));

// Mock console.log to capture output
const mockConsoleLog = vi.fn();
console.log = mockConsoleLog;

interface StatusCheck {
  state: 'succeeded' | 'failed' | 'error' | 'pending';
  context: {
    name: string;
  };
}

interface MergeReadinessResult {
  status: 'ready' | 'failed' | 'pending' | 'no-checks' | 'pr-inactive' | 'unclear';
  message: string;
}

// Since the logic is inline in index.js, let's test it by simulating the logic
describe('PR Merge Readiness Logic', () => {
  beforeEach(() => {
    mockConsoleLog.mockClear();
  });

  // Helper function to simulate the merge readiness logic from index.js
  const checkMergeReadiness = (
    statusChecks: StatusCheck[],
    prStatus: string = 'active',
  ): MergeReadinessResult => {
    const succeededChecks = statusChecks.filter((check) => check.state === 'succeeded');
    const failedChecks = statusChecks.filter(
      (check) => check.state === 'failed' || check.state === 'error',
    );
    const pendingChecks = statusChecks.filter((check) => check.state === 'pending');

    if (statusChecks.length === 0) {
      return {
        status: 'no-checks',
        message: '⏳ PR requires signoff before merge (no status checks for current commit)',
      };
    } else if (prStatus !== 'active') {
      return { status: 'pr-inactive', message: `⚠️  PR is ${prStatus}` };
    } else if (failedChecks.length > 0) {
      return { status: 'failed', message: `❌ ${failedChecks.length} policy check(s) failed` };
    } else if (pendingChecks.length > 0) {
      return {
        status: 'pending',
        message: `⏳ Waiting for ${pendingChecks.length} policy check(s) to complete`,
      };
    } else if (succeededChecks.length === statusChecks.length) {
      return {
        status: 'ready',
        message: '✅ All policy checks passed - PR ready for review/merge',
      };
    } else {
      return { status: 'unclear', message: '⚠️  PR status unclear' };
    }
  };

  it('should show ready for merge when all checks succeeded', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
      { state: 'succeeded', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('ready');
    expect(result.message).toContain('All policy checks passed - PR ready for review/merge');
  });

  it('should show waiting when some checks are pending', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
      { state: 'pending', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('pending');
    expect(result.message).toContain('Waiting for 1 policy check(s) to complete');
  });

  it('should show failed when any check failed', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
      { state: 'failed', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('1 policy check(s) failed');
  });

  it('should show failed over pending when both exist', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'failed', context: { name: 'pr-signoff-tool' } },
      { state: 'pending', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('1 policy check(s) failed');
  });

  it('should show requires signoff when no checks exist', () => {
    const statusChecks: StatusCheck[] = [];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('no-checks');
    expect(result.message).toContain('PR requires signoff before merge');
  });

  it('should show PR inactive when PR is not active', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
    ];

    const result = checkMergeReadiness(statusChecks, 'completed');

    expect(result.status).toBe('pr-inactive');
    expect(result.message).toContain('PR is completed');
  });

  it('should prioritize PR status over check status', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
      { state: 'succeeded', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks, 'abandoned');

    expect(result.status).toBe('pr-inactive');
    expect(result.message).toContain('PR is abandoned');
  });

  it('should handle multiple pending checks', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'pending', context: { name: 'pr-signoff-tool' } },
      { state: 'pending', context: { name: 'web-app-template' } },
      { state: 'pending', context: { name: 'another-check' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('pending');
    expect(result.message).toContain('Waiting for 3 policy check(s) to complete');
  });

  it('should handle error state as failed', () => {
    const statusChecks: StatusCheck[] = [
      { state: 'succeeded', context: { name: 'pr-signoff-tool' } },
      { state: 'error', context: { name: 'web-app-template' } },
    ];

    const result = checkMergeReadiness(statusChecks);

    expect(result.status).toBe('failed');
    expect(result.message).toContain('1 policy check(s) failed');
  });
});
