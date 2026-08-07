import { describe, test, expect } from 'vitest';
import { createAzureDevOpsClient } from '../../lib/azure/azure-devops-client.js';
import { createPolicyManager } from '../../lib/azure/policy-manager.js';
import { createPlatformAdapter } from '../../lib/platform/create-platform-adapter.js';
import type { PlatformAdapter, PolicyAdapter } from '../../lib/platform/platform-adapter.js';
import { createMockConfig } from '../helpers/mocks.js';

/**
 * Contract tests for the platform abstraction.
 *
 * These assert the structural compatibility of the existing AzDO adapter
 * with the new PlatformAdapter / PolicyAdapter interfaces. The TypeScript
 * type assignment is itself a compile-time check; the runtime checks below
 * defend against the type system being bypassed.
 */
describe('PlatformAdapter contract — Azure DevOps adapter', () => {
  const config = createMockConfig() as any;
  const client = createAzureDevOpsClient('test-org', 'test-project', config);

  test('createAzureDevOpsClient is assignable to PlatformAdapter', () => {
    // Compile-time check: TypeScript will reject this assignment if the
    // shape doesn't satisfy PlatformAdapter.
    const adapter: PlatformAdapter = client;
    expect(adapter).toBeDefined();
  });

  test.each([
    'getToken',
    'getRepositoryInfo',
    'findPullRequestId',
    'getPrDetails',
    'getStatusChecks',
    'createCommitStatusCheck',
    'createPrStatusCheck',
    'getPrChanges',
    'createPullRequest',
    'updatePullRequestLabels',
    'getPullRequestLabels',
    'isRunningInCi',
  ])('exposes %s as a function', (method) => {
    expect(typeof (client as any)[method]).toBe('function');
  });

  test('exposes hasSeparateCommitStatus as a boolean (true for AzDO)', () => {
    expect(typeof client.hasSeparateCommitStatus).toBe('boolean');
    expect(client.hasSeparateCommitStatus).toBe(true);
  });
});

describe('PolicyAdapter contract — Azure DevOps policy manager', () => {
  const manager = createPolicyManager('test-org', 'test-project');

  test('createPolicyManager is assignable to PolicyAdapter', () => {
    const adapter: PolicyAdapter = manager;
    expect(adapter).toBeDefined();
  });

  test.each(['setupPolicy'])('exposes %s as a function', (method) => {
    expect(typeof (manager as any)[method]).toBe('function');
  });
});

describe('createPlatformAdapter factory', () => {
  test('returns an AzDO adapter when config has azureDevOps block', async () => {
    const config = createMockConfig() as any;
    const adapter = await createPlatformAdapter(config);
    expect(adapter).toBeDefined();
    expect(typeof adapter.getToken).toBe('function');
    expect(typeof adapter.isRunningInCi).toBe('function');
  });

  test('returns a GitHub adapter when config has github block with explicit repo', async () => {
    const config: any = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };
    const adapter = await createPlatformAdapter(config);
    expect(adapter).toBeDefined();
    expect(typeof adapter.getToken).toBe('function');
    expect(typeof adapter.isRunningInCi).toBe('function');
  });

  test('throws when config has neither azureDevOps nor github block', async () => {
    const config: any = { signoff: { commands: ['npm test'] } };
    await expect(createPlatformAdapter(config)).rejects.toThrow(
      /requires either an azureDevOps or github block/i,
    );
  });
});
