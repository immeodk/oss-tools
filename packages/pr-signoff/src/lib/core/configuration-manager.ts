import { PrSignoffConfig } from '../config/config.js';

// Constants
export const AZURE_DEVOPS_RESOURCE_ID = '499b84ac-1321-427f-aa17-267ca6975798';
export const DEFAULT_STATUS_CHECK_CONTEXT_NAME = 'pr-signoff';
export const STATUS_CHECK_GENRE = 'pr-signoff';

export interface ConfigurationManagerOptions {
  verbose?: boolean;
  streamOutput?: boolean;
}

export interface ConfigurationManager {
  readonly config: PrSignoffConfig;
  readonly options: ConfigurationManagerOptions;
  readonly policyName: string | null;
  readonly scopeToFolder: boolean;
  statusCheckContextName: string;
  scopedFolder: string | null;

  updateStatusCheckContextName(folderPath?: string): void;
  getConfig(): PrSignoffConfig;
  getAzureDevOpsConfig(): PrSignoffConfig['azureDevOps'];
  getSignoffConfig(): PrSignoffConfig['signoff'];
  getStatusCheckContextName(): string;
  isScopeToFolder(): boolean;
  getPolicyName(): string | null;
  getScopedFolder(): string | null;
}

/**
 * Create a configuration manager instance
 */
export function createConfigurationManager(
  config: PrSignoffConfig,
  options: ConfigurationManagerOptions = {},
): ConfigurationManager {
  const policyName = config.signoff?.policyName || null;
  const scopeToFolder = config.signoff?.scopeToFolder || false;

  // Build the status check context name
  let statusCheckContextName: string;
  if (policyName) {
    // Use custom policy name with sanitization - no pr-signoff prefix for scoped policies
    const sanitizedName = policyName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    statusCheckContextName = sanitizedName;
  } else if (scopeToFolder) {
    // Auto-generate from folder path if scoping is enabled
    statusCheckContextName = DEFAULT_STATUS_CHECK_CONTEXT_NAME; // Will be updated when folder is detected
  } else {
    statusCheckContextName = DEFAULT_STATUS_CHECK_CONTEXT_NAME;
  }

  const manager: ConfigurationManager = {
    config,
    options,
    policyName,
    scopeToFolder,
    statusCheckContextName,
    scopedFolder: null,

    /**
     * Update the status check context name for scoped folder
     */
    updateStatusCheckContextName(folderPath?: string): void {
      if (manager.scopeToFolder && folderPath) {
        if (manager.policyName) {
          // Use custom policy name with folder suffix
          const sanitizedName = manager.policyName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
          const sanitizedFolder = folderPath.replace(/[^a-z0-9-]/g, '-');
          manager.statusCheckContextName = `${sanitizedName}-${sanitizedFolder}`;
        } else {
          // Auto-generate from folder path
          const sanitizedFolder = folderPath.replace(/[^a-z0-9-]/g, '-');
          manager.statusCheckContextName = `${DEFAULT_STATUS_CHECK_CONTEXT_NAME}-${sanitizedFolder}`;
        }
        manager.scopedFolder = folderPath;
      }
    },

    /**
     * Get configuration values
     */
    getConfig(): PrSignoffConfig {
      return manager.config;
    },

    /**
     * Get Azure DevOps configuration
     */
    getAzureDevOpsConfig(): PrSignoffConfig['azureDevOps'] {
      return manager.config.azureDevOps;
    },

    /**
     * Get signoff configuration
     */
    getSignoffConfig(): PrSignoffConfig['signoff'] {
      return manager.config.signoff;
    },

    /**
     * Get status check context name
     */
    getStatusCheckContextName(): string {
      return manager.statusCheckContextName;
    },

    /**
     * Check if scoping to folder is enabled
     */
    isScopeToFolder(): boolean {
      return manager.scopeToFolder;
    },

    /**
     * Get policy name
     */
    getPolicyName(): string | null {
      return manager.policyName;
    },

    /**
     * Get scoped folder path
     */
    getScopedFolder(): string | null {
      return manager.scopedFolder;
    },
  };

  return manager;
}
