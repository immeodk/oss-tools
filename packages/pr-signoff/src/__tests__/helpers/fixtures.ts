import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load a test fixture file
 */
export const loadFixture = (filename: string): string => {
  const fixturePath = path.join(__dirname, '..', 'fixtures', filename);
  return fs.readFileSync(fixturePath, 'utf8');
};

/**
 * Load a config fixture
 */
export const loadConfigFixture = (configName: string): string => {
  return loadFixture(`configs/${configName}`);
};

/**
 * Get absolute path to a fixture
 */
export const getFixturePath = (filename: string): string => {
  return path.join(__dirname, '..', 'fixtures', filename);
};

export interface TestConfig {
  azureDevOps: {
    organization: string;
    project: string;
    tenantId?: string;
  };
  signoff: {
    policyName?: string;
    scopeToFolder?: boolean;
    commands: string[];
  };
}

export interface MockPullRequest {
  pullRequestId: number;
  title: string;
  description: string;
  createdBy: {
    displayName: string;
    uniqueName: string;
  };
  sourceRefName: string;
  targetRefName: string;
  status: string;
  creationDate: string;
}

export interface MockStatusCheck {
  state: string;
  description: string;
  targetUrl: string;
  context: {
    name: string;
    genre: string;
  };
}

export interface MockRepository {
  id: string;
  name: string;
  project: {
    id: string;
    name: string;
  };
}

/**
 * Common test data
 */
export const testData = {
  validConfig: {
    azureDevOps: {
      organization: 'test-org',
      project: 'test-project',
      tenantId: '12345678-1234-1234-1234-123456789abc',
    },
    signoff: {
      policyName: 'Test Policy',
      scopeToFolder: true,
      commands: ['npm test', 'npm run build'],
    },
  } as TestConfig,

  minimalConfig: {
    azureDevOps: {
      organization: 'test-org',
      project: 'test-project',
    },
    signoff: {
      commands: ['echo "test"'],
    },
  } as TestConfig,

  invalidConfig: {
    azureDevOps: {
      organization: 'test-org',
      // Missing required project field
    },
    signoff: {
      commands: ['npm test'],
    },
  } as Partial<TestConfig>,
};

/**
 * Mock Azure DevOps API responses
 */
export const mockApiResponses = {
  pullRequest: {
    pullRequestId: 123,
    title: 'Test PR',
    description: 'Test pull request',
    createdBy: {
      displayName: 'Test User',
      uniqueName: 'test@example.com',
    },
    sourceRefName: 'refs/heads/feature/test',
    targetRefName: 'refs/heads/main',
    status: 'active',
    creationDate: '2024-01-01T00:00:00Z',
  } as MockPullRequest,

  statusCheck: {
    state: 'succeeded',
    description: 'All checks passed',
    targetUrl: 'https://example.com',
    context: {
      name: 'pr-signoff',
      genre: 'pr-signoff',
    },
  } as MockStatusCheck,

  repository: {
    id: 'repo-id',
    name: 'test-repo',
    project: {
      id: 'project-id',
      name: 'test-project',
    },
  } as MockRepository,
};
