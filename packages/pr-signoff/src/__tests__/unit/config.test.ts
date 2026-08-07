import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { loadGlobalConfig, validateConfig } from '../../lib/config/config.js';
import { testData } from '../helpers/fixtures.js';

// Mock fs module
vi.mock('fs');

describe('Configuration Loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadGlobalConfig', () => {
    test('loads valid YAML configuration from .yml file', () => {
      const mockConfig = `
azureDevOps:
  organization: test-org
  project: test-project
  tenantId: 12345678-1234-1234-1234-123456789abc

signoff:
  commands:
    - npm test
    - npm run build
  policyName: Test Policy
  scopeToFolder: true
`;

      (fs.existsSync as any).mockImplementation((filePath: string) => {
        return filePath.endsWith('pr-signoff.yml');
      });

      (fs.readFileSync as any).mockReturnValue(mockConfig);

      const config = loadGlobalConfig('/test/dir');

      expect(config).toEqual({
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
          tenantId: '12345678-1234-1234-1234-123456789abc',
        },
        signoff: {
          commands: ['npm test', 'npm run build'],
          policyName: 'Test Policy',
          scopeToFolder: true,
        },
      });
    });

    test('loads valid YAML configuration from .yaml file if .yml does not exist', () => {
      const mockConfig = `
azureDevOps:
  organization: test-org
  project: test-project

signoff:
  commands:
    - echo "test"
`;

      (fs.existsSync as any).mockImplementation((filePath: string) => {
        return filePath.endsWith('pr-signoff.yaml');
      });

      (fs.readFileSync as any).mockReturnValue(mockConfig);

      const config = loadGlobalConfig('/test/dir');

      expect(config).toEqual({
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
        },
        signoff: {
          commands: ['echo "test"'],
        },
      });
    });

    test('throws error when no config file is found', () => {
      (fs.existsSync as any).mockReturnValue(false);

      expect(() => {
        loadGlobalConfig('/test/dir');
      }).toThrow('pr-signoff.yml or pr-signoff.yaml not found');
    });

    test('throws error when config file is invalid YAML', () => {
      const invalidYaml = `
azureDevOps:
  organization: test-org
  project: test-project
signoff:
  - invalid: yaml: structure
    commands
      - test
`;

      (fs.existsSync as any).mockImplementation((filePath: string) => {
        return filePath.endsWith('pr-signoff.yml');
      });

      (fs.readFileSync as any).mockReturnValue(invalidYaml);

      expect(() => {
        loadGlobalConfig('/test/dir');
      }).toThrow('Invalid YAML format');
    });
  });

  describe('validateConfig', () => {
    test('validates correct configuration', () => {
      expect(() => {
        validateConfig(testData.validConfig);
      }).not.toThrow();
    });

    test('validates minimal configuration', () => {
      expect(() => {
        validateConfig(testData.minimalConfig);
      }).not.toThrow();
    });

    test('throws error when neither azureDevOps nor github section is present', () => {
      const invalidConfig = {
        signoff: {
          commands: ['npm test'],
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow(/exactly one of azureDevOps or github/i);
    });

    test('throws error when organization is missing', () => {
      const invalidConfig = {
        azureDevOps: {
          project: 'test-project',
        },
        signoff: {
          commands: ['npm test'],
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('azureDevOps.organization is required');
    });

    test('throws error when project is missing', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
        },
        signoff: {
          commands: ['npm test'],
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('azureDevOps.project is required');
    });

    test('throws error when signoff section is missing', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('signoff configuration is required');
    });

    test('throws error when commands are missing', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
        },
        signoff: {},
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('signoff.commands is required and must be a non-empty array');
    });

    test('throws error when commands is empty array', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
        },
        signoff: {
          commands: [],
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('signoff.commands is required and must be a non-empty array');
    });

    test('throws error when commands is not an array', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
        },
        signoff: {
          commands: 'not an array',
        },
      };

      expect(() => {
        validateConfig(invalidConfig as any);
      }).toThrow('signoff.commands is required and must be a non-empty array');
    });

    test('throws error when tenant ID is not a string', () => {
      const invalidConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
          tenantId: 12345 as any,
        },
        signoff: {
          commands: ['npm test'],
        },
      };

      expect(() => {
        validateConfig(invalidConfig);
      }).toThrow('azureDevOps.tenantId must be a string if provided');
    });

    test('accepts valid tenant ID format', () => {
      const validConfig = {
        azureDevOps: {
          organization: 'test-org',
          project: 'test-project',
          tenantId: '12345678-1234-1234-1234-123456789abc',
        },
        signoff: {
          commands: ['npm test'],
        },
      };

      expect(() => {
        validateConfig(validConfig);
      }).not.toThrow();
    });
  });

  describe('Configuration file search', () => {
    test('searches for config files in parent directories', () => {
      const mockExistsSync = vi.fn();
      (fs.existsSync as any) = mockExistsSync;
      (fs.readFileSync as any).mockReturnValue(`
azureDevOps:
  organization: test-org
  project: test-project
signoff:
  commands:
    - npm test
`);

      // Simulate finding config in current directory
      mockExistsSync.mockReturnValue(true);

      const config = loadGlobalConfig('/deep/test/dir');

      expect(config.azureDevOps.organization).toBe('test-org');
      expect(mockExistsSync).toHaveBeenCalled();
    });
  });
});
