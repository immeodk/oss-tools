import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { createSignoffOrchestrator } from '../../signoff-orchestrator.js';

vi.mock('execa');
vi.mock('@immeodk/git-utils', () => ({
  getCurrentBranch: vi.fn().mockResolvedValue('feature/test'),
  getCurrentCommit: vi.fn().mockResolvedValue('abc123'),
  executeGitCommand: vi.fn(),
  fetchLatestChanges: vi.fn().mockResolvedValue(undefined),
  validateBasicGitState: vi.fn().mockResolvedValue(undefined),
  checkBranchUpToDate: vi.fn().mockResolvedValue(undefined),
}));
// Mock the inner command executor so validate's `commands:` step is a no-op.
vi.mock('../../lib/core/command-executor.js', () => ({
  createCommandExecutor: vi.fn(() => ({
    logger: { isVerbose: false, verboseLog: vi.fn(), error: vi.fn() },
    streamOutput: false,
    executeCommand: vi.fn().mockResolvedValue(''),
    executeCommandWithStream: vi.fn().mockResolvedValue(''),
    executeCommands: vi.fn().mockResolvedValue(undefined),
  })),
}));
vi.mock('../../lib/core/git-operations.js', () => ({
  createGitOperations: vi.fn(() => ({
    logger: { verboseLog: vi.fn() },
    validateGitState: vi.fn().mockResolvedValue(undefined),
    validateBranchAgainstDefault: vi.fn().mockResolvedValue(undefined),
    checkGitStateWithWarnings: vi.fn().mockResolvedValue([]),
    getGitUsername: vi.fn().mockResolvedValue('test-user'),
    getRepositoryName: vi.fn().mockResolvedValue('my-repo'),
    getCurrentBranch: vi.fn().mockResolvedValue('feature/test'),
    getCurrentCommit: vi.fn().mockResolvedValue('abc123'),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
  })),
}));

describe('orchestrator + GitHub adapter end-to-end (mocked fetch)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GH_TOKEN = 'mock-gh-token';
    delete process.env.GITHUB_ACTIONS;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('validate() succeeds end-to-end with a github config (no fetch needed)', async () => {
    const config: any = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };

    const orchestrator = createSignoffOrchestrator(config);
    const spinner = {
      start: vi.fn(),
      succeed: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      fail: vi.fn(),
    };

    const result = await orchestrator.validate(spinner);

    expect(result.valid).toBe(true);
    expect(result.currentBranch).toBe('feature/test');
    expect(result.commitHash).toBe('abc123');
    // No fetch calls expected — validate() doesn't talk to the platform API
    // beyond the adapter's isRunningInCi() check.
  });

  test('orchestrator constructs successfully with github sibling-block config', () => {
    const config: any = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };

    const orchestrator = createSignoffOrchestrator(config);

    expect(orchestrator).toBeDefined();
    expect(typeof orchestrator.validate).toBe('function');
    expect(typeof orchestrator.execute).toBe('function');
  });

  test('execute() posts the status check exactly once on GitHub (no duplicate commit-status POST)', async () => {
    const config: any = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['echo ok'] },
    };

    const statusPosts: string[] = [];
    const jsonResponse = (body: unknown) =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => body,
        text: async () => JSON.stringify(body),
      }) as Response;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn((url: any, init: any) => {
      const u = String(url);
      if (init?.method === 'POST' && u.includes('/statuses/')) {
        statusPosts.push(u);
        return Promise.resolve(jsonResponse({}));
      }
      if (u.includes('/pulls?')) return Promise.resolve(jsonResponse([{ number: 7 }])); // findPullRequestId
      if (u.endsWith('/repos/my-org/my-repo'))
        return Promise.resolve(jsonResponse({ name: 'my-repo', full_name: 'my-org/my-repo' }));
      return Promise.resolve(jsonResponse({}));
    }) as any;

    try {
      const spinner = {
        start: vi.fn(),
        succeed: vi.fn(),
        warn: vi.fn(),
        info: vi.fn(),
        fail: vi.fn(),
        stop: vi.fn(),
      };
      const result = await createSignoffOrchestrator(config).execute(spinner as any);

      expect(result.prId).toBe(7);
      expect(result.prStatusCreated).toBe(true);
      // The fix: GitHub's createPrStatusCheck IS the commit status, so the
      // orchestrator must NOT also call createCommitStatusCheck — exactly one POST.
      expect(statusPosts).toHaveLength(1);
      expect(statusPosts[0]).toContain('/repos/my-org/my-repo/statuses/abc123');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test('setupPipelineBuildPolicy throws clear error on GitHub configs', async () => {
    const config: any = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };

    const orchestrator = createSignoffOrchestrator(config);

    await expect(
      orchestrator.setupPipelineBuildPolicy({ pipelineId: 1, pipelineName: 'test' }),
    ).rejects.toThrow(/build validation policy.*azure devops|github.*ruleset/i);
  });
});
