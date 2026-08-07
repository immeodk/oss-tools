import { vi } from 'vitest';
import path from 'path';
import fs from 'fs';

/**
 * Mock the execa command execution
 */
export const mockExeca = () => {
  const execaMock = vi.fn();

  // Default successful execution
  execaMock.mockResolvedValue({
    stdout: '',
    stderr: '',
    exitCode: 0,
  });

  return execaMock;
};

/**
 * Mock git-utils functions
 */
export const mockGitUtils = () => ({
  validateBasicGitState: vi.fn().mockResolvedValue(undefined),
  fetchLatestChanges: vi.fn().mockResolvedValue(undefined),
  getCurrentBranch: vi.fn().mockResolvedValue('main'),
  getCurrentCommit: vi.fn().mockResolvedValue('abc123'),
  checkBranchUpToDate: vi.fn().mockResolvedValue(undefined),
  executeGitCommand: vi.fn().mockResolvedValue('success'),
});

/**
 * Mock file system operations
 */
export const mockFs = () => {
  const fsMock = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
  };

  // Default behavior - config file exists and is readable
  fsMock.existsSync.mockImplementation((filePath: string) => {
    return filePath.includes('pr-signoff.yml');
  });

  fsMock.readFileSync.mockImplementation((filePath: string) => {
    if (filePath.includes('pr-signoff.yml')) {
      return `
azureDevOps:
  organization: test-org
  project: test-project

signoff:
  commands:
    - npm test
`;
    }
    if (filePath.includes('package.json')) {
      return JSON.stringify({ version: '1.0.0' });
    }
    return '';
  });

  return fsMock;
};

/**
 * Mock Azure CLI operations
 */
export const mockAzureCli = () => {
  const execaMock = vi.fn();

  execaMock.mockImplementation((command: string, args: string[]) => {
    if (command === 'az' && args.includes('account')) {
      if (args.includes('show')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            tenantId: '12345678-1234-1234-1234-123456789abc',
          }),
        });
      }
      if (args.includes('get-access-token')) {
        return Promise.resolve({
          stdout: JSON.stringify({
            accessToken: 'mock-access-token',
          }),
        });
      }
    }
    return Promise.resolve({ stdout: '', stderr: '' });
  });

  return execaMock;
};

export interface MockConfigOverrides {
  azureDevOps?: Partial<{
    organization: string;
    project: string;
    tenantId: string;
  }>;
  signoff?: Partial<{
    commands: string[];
    scopeToFolder: boolean;
    policyName: string | null;
  }>;
}

/**
 * Create a mock configuration object
 */
export const createMockConfig = (overrides: MockConfigOverrides = {}) => ({
  azureDevOps: {
    organization: 'test-org',
    project: 'test-project',
    tenantId: '12345678-1234-1234-1234-123456789abc',
    ...overrides.azureDevOps,
  },
  signoff: {
    commands: ['npm test'],
    scopeToFolder: false,
    policyName: null,
    ...overrides.signoff,
  },
});

/**
 * Mock process.cwd to return test directory
 */
export const mockProcessCwd = (testDir: string = '/test/dir') => {
  const originalCwd = process.cwd;
  process.cwd = vi.fn().mockReturnValue(testDir);
  return () => {
    process.cwd = originalCwd;
  };
};

export interface TempConfigFile {
  filepath: string;
  cleanup: () => void;
}

/**
 * Create temporary test files
 */
export const createTempConfigFile = (
  content: string,
  filename: string = 'pr-signoff.yml',
): TempConfigFile => {
  const tempDir = path.join(process.cwd(), '.tmp-test');
  const filepath = path.join(tempDir, filename);

  // Ensure directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  fs.writeFileSync(filepath, content);

  return {
    filepath,
    cleanup: () => {
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
      if (fs.existsSync(tempDir)) {
        fs.rmdirSync(tempDir);
      }
    },
  };
};
