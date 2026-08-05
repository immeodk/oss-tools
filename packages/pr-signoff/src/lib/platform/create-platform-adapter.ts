import type { PrSignoffConfig } from '../config/config.js';
import { createAzureDevOpsClient } from '../azure/azure-devops-client.js';
import { createGitHubClient } from '../github/github-client.js';
import { resolveGitHubOwnerRepo } from '../github/resolve-repo.js';
import type { PlatformAdapter } from './platform-adapter.js';

export interface CreatePlatformAdapterOptions {
  verbose?: boolean;
}

/**
 * Pick the right {@link PlatformAdapter} implementation for the given config.
 *
 * Resolution rules:
 * - If `config.github` is present, return a GitHub adapter. The repo name
 *   comes from `config.github.repo` when set, otherwise from the origin
 *   remote URL.
 * - Else if `config.azureDevOps` is present, return an Azure DevOps adapter.
 * - Else throw — every config must declare exactly one platform.
 *
 * Async because GitHub auto-detection may shell out to `git`.
 */
export async function createPlatformAdapter(
  config: PrSignoffConfig,
  options: CreatePlatformAdapterOptions = {},
): Promise<PlatformAdapter> {
  if (config.github) {
    const { owner, repo } = await resolveGitHubOwnerRepo(config.github, options);
    return createGitHubClient(owner, repo, options);
  }

  if (config.azureDevOps) {
    return createAzureDevOpsClient(
      config.azureDevOps.organization,
      config.azureDevOps.project,
      config,
      options,
    );
  }

  throw new Error('pr-signoff config requires either an azureDevOps or github block.');
}
