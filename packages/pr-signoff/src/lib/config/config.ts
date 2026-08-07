import fs from 'fs';
import path from 'path';
import YAML from 'yaml';
import { fileURLToPath } from 'url';
import { ok, err, unwrap, type Result } from '../core/result.js';
import { ConfigError } from '../errors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GitHub configuration for connecting to the repository.
 *
 * When this block is present, the tool uses the GitHub platform adapter.
 * Exactly one of `github` or `azureDevOps` must be present per config.
 */
export interface GitHubConfig {
  /**
   * GitHub repository owner (user or organization).
   * @example "my-org"
   */
  owner: string;

  /**
   * GitHub repository name.
   * If omitted, the tool auto-detects from the `origin` remote URL.
   * @example "my-repo"
   */
  repo?: string;
}

/**
 * Azure DevOps configuration for connecting to the organization and project
 */
export interface AzureDevOpsConfig {
  /**
   * Azure DevOps organization name
   * @example "mycompany"
   */
  organization: string;

  /**
   * Azure DevOps project name
   * @example "MyProject"
   */
  project: string;

  /**
   * Azure AD tenant ID for authentication (optional)
   * If not provided, will use default Azure CLI authentication
   * @example "12345678-1234-1234-1234-123456789abc"
   */
  tenantId?: string;
}

/**
 * Pipeline signoff method configuration for pipeline-based signoff
 */
export interface PipelineSignoffMethod {
  /**
   * Name of the pipeline in Azure DevOps
   * @example "PR Signoff Pipeline"
   */
  name: string;

  /**
   * Azure DevOps pipeline folder path for organization (empty/undefined = root folder)
   * @example "\\PR Validation"
   */
  azureDevOpsPipelineFolder?: string;

  /**
   * Path where the pipeline definition YAML file should be generated
   * @default ".pipeline/pr-signoff.yml"
   */
  pipelineDefinition?: string;
}

/**
 * Signoff validation and policy configuration
 */
export interface SignoffConfig {
  /**
   * Commands to run for validation (executed in sequence)
   * All commands must pass (exit code 0) for signoff to succeed
   * @example ["npm install", "npm run test", "npm run build"]
   */
  commands: string[];

  /**
   * Scope signoff execution to only the folder containing changes
   * When enabled, signoff only runs if changes are detected in the current directory tree
   * @default false
   */
  scopeToFolder?: boolean;

  /**
   * Custom name for the Azure DevOps branch policy status check
   * If not specified, will use "PR Signoff" as the policy name
   * @example "Frontend Validation"
   */
  policyName?: string;

  /**
   * Default signoff method for new PRs
   * @default "local"
   * @example "pipeline"
   */
  defaultSignoffMethod?: 'local' | 'pipeline';

  /**
   * Pipeline-based signoff configuration
   */
  pipelineSignoff?: PipelineSignoffMethod;
}

/**
 * Complete PR Signoff configuration
 * This is the root configuration interface for pr-signoff.yaml files
 */
export interface PrSignoffConfig {
  /**
   * Minimum pr-signoff tool version required for this configuration
   * Ensures compatibility with configuration features
   * @example "1.3.0"
   */
  minToolVersion?: string;

  /**
   * Azure DevOps connection settings.
   * Exactly one of `azureDevOps` or `github` must be present.
   */
  azureDevOps?: AzureDevOpsConfig;

  /**
   * GitHub connection settings.
   * Exactly one of `azureDevOps` or `github` must be present.
   */
  github?: GitHubConfig;

  /**
   * Signoff validation and execution settings
   */
  signoff: SignoffConfig;
}

/**
 * Get current tool version from package.json
 */
function getCurrentVersion(): string {
  try {
    const packageJsonPath = path.join(__dirname, '..', '..', '..', 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return packageJson.version;
  } catch {
    return '1.0.0'; // Fallback version
  }
}

/**
 * Load configuration from pr-signoff.yml / pr-signoff.yaml as a {@link Result}.
 *
 * Config-load failure (missing file, malformed YAML, schema violation) is an
 * *expected* outcome the caller should branch on — so it's returned as an
 * `err`, not thrown. Callers that simply want to abort can use
 * {@link loadGlobalConfig} (which unwraps this).
 */
export const loadConfig = (baseDir = process.cwd()): Result<PrSignoffConfig, Error> => {
  try {
    const ymlPath = path.join(baseDir, 'pr-signoff.yml');
    const yamlPath = path.join(baseDir, 'pr-signoff.yaml');

    let configPath: string;
    if (fs.existsSync(ymlPath)) {
      configPath = ymlPath;
    } else if (fs.existsSync(yamlPath)) {
      configPath = yamlPath;
    } else {
      return err(
        new ConfigError('pr-signoff.yml or pr-signoff.yaml not found in repository root', baseDir),
      );
    }

    const fileContent = fs.readFileSync(configPath, 'utf8');
    const config = YAML.parse(fileContent) as PrSignoffConfig;

    // Validate configuration with current version
    const currentVersion = getCurrentVersion();
    validateConfig(config, currentVersion);

    return ok(config);
  } catch (error) {
    if (error instanceof Error && error.name === 'YAMLParseError') {
      return err(
        new ConfigError(`Invalid YAML format: ${error.message}`, baseDir, { cause: error }),
      );
    }
    if (error instanceof Error) {
      return err(
        new ConfigError(`Failed to load configuration: ${error.message}`, baseDir, {
          cause: error,
        }),
      );
    }
    return err(new ConfigError(String(error), baseDir));
  }
};

/**
 * Load configuration, throwing on failure. Convenience wrapper over
 * {@link loadConfig} for the common CLI path where a missing/invalid config
 * means "print the error and exit" (handled by the command's outer catch).
 */
export const loadGlobalConfig = (baseDir = process.cwd()): PrSignoffConfig =>
  unwrap(loadConfig(baseDir));

/**
 * Reject identifiers that aren't a plain slug. Used for org/owner/repo, which
 * are interpolated into REST URL *path segments* — disallowing anything but
 * `[A-Za-z0-9._-]` prevents path traversal / URL manipulation (e.g. `../`).
 */
function assertSafeSlug(value: string, field: string): void {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) {
    throw new Error(`${field} may only contain letters, numbers, '.', '_', or '-'`);
  }
}

/**
 * Looser guard for values that legitimately allow spaces (Azure DevOps project
 * names) but must not manipulate the URL path: forbid path separators and
 * traversal sequences.
 */
function assertNoPathChars(value: string, field: string): void {
  if (value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw new Error(`${field} must not contain '/', '\\\\', or '..'`);
  }
}

/**
 * Validate configuration schema and minimum version requirements
 */
export function validateConfig(
  config: unknown,
  currentVersion?: string,
): asserts config is PrSignoffConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Configuration must be an object');
  }

  const configObj = config as Record<string, unknown>;

  // Validate minimum tool version if specified
  if (configObj.minToolVersion && typeof configObj.minToolVersion === 'string' && currentVersion) {
    if (!isVersionSatisfied(currentVersion, configObj.minToolVersion)) {
      throw new Error(
        `Configuration requires pr-signoff version ${configObj.minToolVersion} or higher. ` +
          `Current version: ${currentVersion}. Please update pr-signoff.`,
      );
    }
  }

  // Validate platform configuration: exactly one of azureDevOps or github
  // must be present. Sibling blocks make platform choice explicit in the YAML.
  const hasAzureDevOps = configObj.azureDevOps !== undefined && configObj.azureDevOps !== null;
  const hasGitHub = configObj.github !== undefined && configObj.github !== null;

  if (hasAzureDevOps && hasGitHub) {
    throw new Error(
      'pr-signoff config must declare exactly one of azureDevOps or github (both are present)',
    );
  }
  if (!hasAzureDevOps && !hasGitHub) {
    throw new Error(
      'pr-signoff config must declare exactly one of azureDevOps or github (neither is present)',
    );
  }

  if (hasAzureDevOps) {
    const { azureDevOps } = configObj;
    if (!azureDevOps || typeof azureDevOps !== 'object') {
      throw new Error('azureDevOps configuration must be an object');
    }

    const azureDevOpsObj = azureDevOps as Record<string, unknown>;

    if (!azureDevOpsObj.organization || typeof azureDevOpsObj.organization !== 'string') {
      throw new Error('azureDevOps.organization is required and must be a string');
    }
    assertSafeSlug(azureDevOpsObj.organization, 'azureDevOps.organization');

    if (!azureDevOpsObj.project || typeof azureDevOpsObj.project !== 'string') {
      throw new Error('azureDevOps.project is required and must be a string');
    }
    // Project names may contain spaces, so only forbid path/traversal chars
    // that could manipulate the REST URL path.
    assertNoPathChars(azureDevOpsObj.project, 'azureDevOps.project');

    if (azureDevOpsObj.tenantId && typeof azureDevOpsObj.tenantId !== 'string') {
      throw new Error('azureDevOps.tenantId must be a string if provided');
    }
  }

  if (hasGitHub) {
    const { github } = configObj;
    if (!github || typeof github !== 'object') {
      throw new Error('github configuration must be an object');
    }

    const githubObj = github as Record<string, unknown>;

    if (!githubObj.owner || typeof githubObj.owner !== 'string') {
      throw new Error('github.owner is required and must be a string');
    }
    assertSafeSlug(githubObj.owner, 'github.owner');

    if (githubObj.repo !== undefined && typeof githubObj.repo !== 'string') {
      throw new Error('github.repo must be a string if provided');
    }
    if (githubObj.repo !== undefined) {
      assertSafeSlug(githubObj.repo, 'github.repo');
    }
  }

  // Validate signoff configuration
  const { signoff } = configObj;
  if (!signoff || typeof signoff !== 'object') {
    throw new Error('signoff configuration is required');
  }

  const signoffObj = signoff as Record<string, unknown>;

  if (
    !signoffObj.commands ||
    !Array.isArray(signoffObj.commands) ||
    signoffObj.commands.length === 0
  ) {
    throw new Error('signoff.commands is required and must be a non-empty array');
  }

  if (signoffObj.scopeToFolder !== undefined && typeof signoffObj.scopeToFolder !== 'boolean') {
    throw new Error('signoff.scopeToFolder must be a boolean if provided');
  }

  if (signoffObj.policyName !== undefined && typeof signoffObj.policyName !== 'string') {
    throw new Error('signoff.policyName must be a string if provided');
  }

  // Validate defaultSignoffMethod if provided
  if (signoffObj.defaultSignoffMethod !== undefined) {
    if (
      typeof signoffObj.defaultSignoffMethod !== 'string' ||
      !['local', 'pipeline'].includes(signoffObj.defaultSignoffMethod)
    ) {
      throw new Error('signoff.defaultSignoffMethod must be "local" or "pipeline" if provided');
    }
  }

  // Validate pipelineSignoff if provided
  if (signoffObj.pipelineSignoff !== undefined) {
    if (typeof signoffObj.pipelineSignoff !== 'object') {
      throw new Error('signoff.pipelineSignoff must be an object if provided');
    }

    const pipelineObj = signoffObj.pipelineSignoff as Record<string, unknown>;

    if (!pipelineObj.name || typeof pipelineObj.name !== 'string') {
      throw new Error('signoff.pipelineSignoff.name is required and must be a string');
    }

    if (
      pipelineObj.azureDevOpsPipelineFolder !== undefined &&
      typeof pipelineObj.azureDevOpsPipelineFolder !== 'string'
    ) {
      throw new Error(
        'signoff.pipelineSignoff.azureDevOpsPipelineFolder must be a string if provided',
      );
    }

    if (
      pipelineObj.pipelineDefinition !== undefined &&
      typeof pipelineObj.pipelineDefinition !== 'string'
    ) {
      throw new Error('signoff.pipelineSignoff.pipelineDefinition must be a string if provided');
    }
  }
}

/**
 * Compare two semantic version strings
 * Returns true if current >= required
 */
function isVersionSatisfied(current: string, required: string): boolean {
  const currentParts = current.split('.').map(Number);
  const requiredParts = required.split('.').map(Number);

  // Ensure we have at least 3 parts (major.minor.patch)
  while (currentParts.length < 3) currentParts.push(0);
  while (requiredParts.length < 3) requiredParts.push(0);

  for (let i = 0; i < 3; i++) {
    // Both arrays are padded to length >= 3 above, so these reads are safe.
    const cur = currentParts[i] ?? 0;
    const req = requiredParts[i] ?? 0;
    if (cur > req) {
      return true; // Current is higher
    } else if (cur < req) {
      return false; // Current is lower
    }
    // If equal, continue to next part
  }

  return true; // Versions are equal
}
