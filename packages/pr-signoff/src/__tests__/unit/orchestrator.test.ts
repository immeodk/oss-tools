import { describe, test, expect, beforeEach, vi } from 'vitest';
import { createSignoffOrchestrator } from '../../signoff-orchestrator.js';
import { createMockConfig } from '../helpers/mocks.js';

// Mock dependencies
vi.mock('execa');
vi.mock('@immeodk/git-utils');

// Mock all the service modules
vi.mock('../../lib/core/logger.js', () => ({
  createLogger: vi.fn(() => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() })),
}));
vi.mock('../../lib/core/command-executor.js', () => ({
  createCommandExecutor: vi.fn(() => ({ execute: vi.fn() })),
}));
vi.mock('../../lib/core/configuration-manager.js', () => ({
  createConfigurationManager: vi.fn(() => ({ getConfig: vi.fn() })),
}));
vi.mock('../../lib/core/git-operations.js', () => ({
  createGitOperations: vi.fn(() => ({
    getCurrentBranch: vi.fn().mockResolvedValue('main'),
    getCurrentCommit: vi.fn().mockResolvedValue('abc123'),
    checkGitStateWithWarnings: vi.fn().mockResolvedValue([]),
  })),
}));
vi.mock('../../lib/azure/azure-devops-client.js', () => ({
  createAzureDevOpsClient: vi.fn(() => ({ getPullRequest: vi.fn() })),
}));
vi.mock('../../lib/azure/policy-manager.js', () => ({
  createPolicyManager: vi.fn(() => ({ setupPolicy: vi.fn() })),
}));
vi.mock('../../lib/core/scope-analyzer.js', () => ({
  createScopeAnalyzer: vi.fn(() => ({ analyzeScope: vi.fn() })),
}));

describe('Signoff Orchestrator', () => {
  let mockConfig: ReturnType<typeof createMockConfig>;

  beforeEach(() => {
    mockConfig = createMockConfig();
    vi.clearAllMocks();
  });

  describe('orchestrator creation', () => {
    test('creates orchestrator with default configuration', () => {
      const orchestrator = createSignoffOrchestrator(mockConfig);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.logger).toBeDefined();
      expect(orchestrator.validate).toBeTypeOf('function');
      expect(orchestrator.execute).toBeTypeOf('function');
      expect(orchestrator.setupPolicy).toBeTypeOf('function');
    });

    test('creates orchestrator with options', () => {
      const options = { verbose: true, streamOutput: true };
      const orchestrator = createSignoffOrchestrator(mockConfig, options);

      expect(orchestrator).toBeDefined();
      expect(orchestrator.logger).toBeDefined();
    });
  });

  describe('functional interface', () => {
    test('all required methods are present', () => {
      const orchestrator = createSignoffOrchestrator(mockConfig);

      // Check that all required methods exist
      expect(orchestrator.validate).toBeTypeOf('function');
      expect(orchestrator.execute).toBeTypeOf('function');
      expect(orchestrator.setupPolicy).toBeTypeOf('function');
    });
  });
});
