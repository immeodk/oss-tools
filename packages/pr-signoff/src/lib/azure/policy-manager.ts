import { createLogger } from '../core/logger.js';
import { STATUS_CHECK_GENRE } from '../core/configuration-manager.js';
import { httpJson } from '../platform/http.js';
import { parseAzureBranchPolicies, parseAzurePolicyConfig } from './schemas.js';
import type { PolicyAdapter } from '../platform/platform-adapter.js';
import type { Repository, PolicyCreationResult } from '../platform/types.js';

// Re-export neutral type so existing call sites keep working.
export type { PolicyCreationResult };

export interface PolicyManagerOptions {
  verbose?: boolean;
}

export interface BranchPolicy {
  id: number;
  type: { displayName: string };
  settings: { statusName?: string };
  isEnabled: boolean;
  isBlocking: boolean;
}

/**
 * Azure DevOps implementation of {@link PolicyAdapter}.
 *
 * The adapter contract requires only `setupPolicy`; the additional methods
 * (`getBranchPolicies`, `createSignoffPolicy`, `updateSignoffPolicy`) are
 * AzDO-specific implementation seams retained for backwards compatibility
 * with the existing test surface.
 */
export interface PolicyManager extends PolicyAdapter {
  getBranchPolicies(token: string, repo: Repository, branchName: string): Promise<BranchPolicy[]>;
  createSignoffPolicy(
    token: string,
    repo: Repository,
    branchName: string,
    required: boolean,
    contextName: string,
    scopedFolder?: string,
  ): Promise<{ id: number }>;
  updateSignoffPolicy(
    token: string,
    repo: Repository,
    branchName: string,
    required: boolean,
    policyId: number,
    contextName: string,
    scopedFolder?: string,
  ): Promise<{ id: number }>;
}

export function createPolicyManager(
  organization: string,
  project: string,
  options: PolicyManagerOptions = {},
): PolicyManager {
  const logger = createLogger(options.verbose || false);

  return {
    logger,

    /**
     * Setup branch policy to require signoff status check
     */
    async setupPolicy(
      token: string,
      repo: Repository,
      contextName: string,
      options: {
        targetBranch: string;
        required?: boolean;
        scopedFolder?: string;
      },
    ): Promise<PolicyCreationResult> {
      const { targetBranch, required = true, scopedFolder } = options;

      // Check existing policies
      const existingPolicies = await this.getBranchPolicies(token, repo, targetBranch);
      const existingSignoffPolicy = existingPolicies.find(
        (policy) =>
          policy.type?.displayName === 'Status' && policy.settings?.statusName === contextName,
      );

      if (existingSignoffPolicy) {
        logger.verboseLog(`Found existing signoff policy (ID: ${existingSignoffPolicy.id})`);

        // Update the existing policy
        const updatedPolicy = await this.updateSignoffPolicy(
          token,
          repo,
          targetBranch,
          required,
          existingSignoffPolicy.id,
          contextName,
          scopedFolder,
        );

        return {
          action: 'updated',
          policyId: updatedPolicy.id,
          repository: repo.name,
          targetBranch,
          required,
        };
      }

      // Create the branch policy
      const policy = await this.createSignoffPolicy(
        token,
        repo,
        targetBranch,
        required,
        contextName,
        scopedFolder,
      );

      return {
        action: 'created',
        policyId: policy.id,
        repository: repo.name,
        targetBranch,
        required,
      };
    },

    /**
     * Get branch policies for a repository
     */
    async getBranchPolicies(
      token: string,
      repo: Repository,
      branchName: string,
    ): Promise<BranchPolicy[]> {
      return httpJson(
        `https://dev.azure.com/${organization}/${project}/_apis/policy/configurations?repositoryId=${repo.id}&refName=refs/heads/${branchName}&api-version=7.2-preview.1`,
        parseAzureBranchPolicies,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
      );
    },

    /**
     * Create a signoff status check policy
     */
    async createSignoffPolicy(
      token: string,
      repo: Repository,
      branchName: string,
      required: boolean,
      contextName: string,
      scopedFolder?: string,
    ): Promise<{ id: number }> {
      let policyConfig;

      if (scopedFolder) {
        // For scoped policies, use path-based approach
        const pathPattern = scopedFolder.endsWith('/')
          ? scopedFolder.slice(0, -1) // Remove trailing slash
          : scopedFolder;

        // Ensure leading slash for Azure DevOps path filter
        const azurePathFilter = pathPattern.startsWith('/')
          ? `${pathPattern}/*`
          : `/${pathPattern}/*`;

        logger.verboseLog(`Creating scoped policy with path filter: ${azurePathFilter}`);

        policyConfig = {
          isEnabled: true,
          isBlocking: required,
          type: {
            id: 'cbdc66da-9728-4af8-aada-9a5a32e4a226', // Status check policy type ID
          },
          settings: {
            statusName: contextName,
            statusGenre: STATUS_CHECK_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            filenamePatterns: [azurePathFilter],
            scope: [
              {
                repositoryId: repo.id,
                refName: `refs/heads/${branchName}`,
                matchKind: 'exact',
              },
            ],
          },
        };
      } else {
        // For non-scoped policies, use standard configuration
        policyConfig = {
          isEnabled: true,
          isBlocking: required,
          type: {
            id: 'cbdc66da-9728-4af8-aada-9a5a32e4a226', // Status check policy type ID
          },
          settings: {
            statusName: contextName,
            statusGenre: STATUS_CHECK_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            scope: [
              {
                repositoryId: repo.id,
                refName: `refs/heads/${branchName}`,
                matchKind: 'exact',
              },
            ],
          },
        };
      }

      logger.verboseLog('Creating policy with configuration:', policyConfig);

      return httpJson(
        `https://dev.azure.com/${organization}/${project}/_apis/policy/configurations?api-version=7.2-preview.1`,
        parseAzurePolicyConfig,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(policyConfig),
        },
      );
    },

    /**
     * Update an existing signoff status check policy
     */
    async updateSignoffPolicy(
      token: string,
      repo: Repository,
      branchName: string,
      required: boolean,
      policyId: number,
      contextName: string,
      scopedFolder?: string,
    ): Promise<{ id: number }> {
      let policyConfig;

      if (scopedFolder) {
        // For scoped policies, use path-based approach
        const pathPattern = scopedFolder.endsWith('/')
          ? scopedFolder.slice(0, -1) // Remove trailing slash
          : scopedFolder;

        // Ensure leading slash for Azure DevOps path filter
        const azurePathFilter = pathPattern.startsWith('/')
          ? `${pathPattern}/*`
          : `/${pathPattern}/*`;

        logger.verboseLog(`Updating scoped policy with path filter: ${azurePathFilter}`);

        policyConfig = {
          isEnabled: true,
          isBlocking: required,
          type: {
            id: 'cbdc66da-9728-4af8-aada-9a5a32e4a226', // Status check policy type ID
          },
          settings: {
            statusName: contextName,
            statusGenre: STATUS_CHECK_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            filenamePatterns: [azurePathFilter],
            scope: [
              {
                repositoryId: repo.id,
                refName: `refs/heads/${branchName}`,
                matchKind: 'exact',
              },
            ],
          },
        };
      } else {
        // For non-scoped policies, use standard configuration
        policyConfig = {
          isEnabled: true,
          isBlocking: required,
          type: {
            id: 'cbdc66da-9728-4af8-aada-9a5a32e4a226', // Status check policy type ID
          },
          settings: {
            statusName: contextName,
            statusGenre: STATUS_CHECK_GENRE,
            authorId: null,
            invalidateOnSourceUpdate: true,
            scope: [
              {
                repositoryId: repo.id,
                refName: `refs/heads/${branchName}`,
                matchKind: 'exact',
              },
            ],
          },
        };
      }

      logger.verboseLog('Updating policy with configuration:', policyConfig);

      return httpJson(
        `https://dev.azure.com/${organization}/${project}/_apis/policy/configurations/${policyId}?api-version=7.2-preview.1`,
        parseAzurePolicyConfig,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(policyConfig),
        },
      );
    },
  };
}
