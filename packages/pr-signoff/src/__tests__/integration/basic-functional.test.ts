import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { loadGlobalConfig } from '../../lib/config/config.js';
import { createSignoffOrchestrator } from '../../signoff-orchestrator.js';

// Mock file system and external dependencies
vi.mock('fs');
vi.mock('execa');
vi.mock('@immeodk/git-utils');

// Mock all service modules
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

describe('Basic Functional Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-end Configuration and Initialization', () => {
    test('loads config and creates orchestrator', () => {
      const validConfig = `
azureDevOps:
  organization: test-org
  project: test-project

signoff:
  commands:
    - npm test
`;

      (fs.existsSync as any).mockImplementation((path: string) => path.endsWith('pr-signoff.yml'));
      (fs.readFileSync as any).mockReturnValue(validConfig);

      const config = loadGlobalConfig('/test');
      const orchestrator = createSignoffOrchestrator(config);

      expect(config.azureDevOps.organization).toBe('test-org');
      expect(orchestrator).toBeDefined();
      expect(orchestrator.logger).toBeDefined();
    });

    test('creates orchestrator with options', () => {
      const validConfig = `
azureDevOps:
  organization: test-org
  project: test-project

signoff:
  commands:
    - npm test
`;

      (fs.existsSync as any).mockImplementation((path: string) => path.endsWith('pr-signoff.yml'));
      (fs.readFileSync as any).mockReturnValue(validConfig);

      const config = loadGlobalConfig('/test');
      const orchestrator = createSignoffOrchestrator(config, { verbose: true });

      expect(orchestrator).toBeDefined();
      expect(orchestrator.logger).toBeDefined();
    });
  });
});
