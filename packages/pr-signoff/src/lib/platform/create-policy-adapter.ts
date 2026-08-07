import type { PrSignoffConfig } from '../config/config.js';
import { createPolicyManager } from '../azure/policy-manager.js';
import { createGitHubPolicyManager } from '../github/github-policy-manager.js';
import { resolveGitHubOwnerRepo } from '../github/resolve-repo.js';
import type { PolicyAdapter } from './platform-adapter.js';

export interface CreatePolicyAdapterOptions {
  verbose?: boolean;
}

/**
 * Pick the right {@link PolicyAdapter} implementation for the given config.
 * Mirrors `createPlatformAdapter` but for the branch-policy surface.
 *
 * Async because GitHub repo auto-detect may shell out to git.
 */
export async function createPolicyAdapter(
  config: PrSignoffConfig,
  options: CreatePolicyAdapterOptions = {},
): Promise<PolicyAdapter> {
  if (config.github) {
    const { owner, repo } = await resolveGitHubOwnerRepo(config.github, options);
    return createGitHubPolicyManager(owner, repo, options);
  }

  if (config.azureDevOps) {
    return createPolicyManager(
      config.azureDevOps.organization,
      config.azureDevOps.project,
      options,
    );
  }

  throw new Error('pr-signoff config requires either an azureDevOps or github block.');
}
