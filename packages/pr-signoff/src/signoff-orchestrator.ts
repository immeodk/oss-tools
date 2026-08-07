import chalk from 'chalk';
import { createLogger, Logger } from './lib/core/logger.js';
import { createCommandExecutor } from './lib/core/command-executor.js';
import { createConfigurationManager } from './lib/core/configuration-manager.js';
import { createGitOperations } from './lib/core/git-operations.js';
import { createPlatformAdapter } from './lib/platform/create-platform-adapter.js';
import { createPolicyAdapter } from './lib/platform/create-policy-adapter.js';
import { httpJson } from './lib/platform/http.js';
import { parseAzurePolicyConfig } from './lib/azure/schemas.js';
import { describeError } from './lib/core/error-message.js';
import type { Spinner } from './lib/core/spinner.js';
import type { PullRequest, StatusCheck } from './lib/platform/types.js';
import { createScopeAnalyzer } from './lib/core/scope-analyzer.js';
import type { PrSignoffConfig } from './lib/config/config.js';

export interface SignoffOrchestratorOptions {
  id?: number;
  verbose?: boolean;
  streamOutput?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  message: string;
  commitHash: string;
  currentBranch: string;
  warnings: string[];
}

export interface SignoffResult {
  organization: string;
  project: string;
  prId?: number;
  message: string;
  commitHash: string;
  prStatusCreated?: boolean;
  commitStatusCreated: boolean;
  type: 'full-signoff' | 'commit-only';
  skipped?: boolean;
}

export interface PrStatusResult {
  pr: PullRequest;
  statusChecks: StatusCheck[];
  currentCommit: string;
  currentBranch: string;
  repository: string;
}

export interface PolicySetupResult {
  action: 'created' | 'updated';
  policyId: number;
  repository: string;
  targetBranch: string;
  required: boolean;
}

export interface SignoffOrchestrator {
  readonly logger: Logger;
  validate(spinner: Spinner): Promise<ValidationResult>;
  execute(spinner: Spinner): Promise<SignoffResult>;
  setupPolicy(
    options: { targetBranch?: string; required?: boolean },
    spinner: Spinner,
  ): Promise<PolicySetupResult>;
  setupPipelineBuildPolicy(options: {
    pipelineId: number;
    pipelineName: string;
    targetBranch?: string;
    required?: boolean;
  }): Promise<PolicySetupResult>;
}

export function createSignoffOrchestrator(
  config: PrSignoffConfig,
  options: SignoffOrchestratorOptions = {},
): SignoffOrchestrator {
  const logger = createLogger(options.verbose || false, options.streamOutput || false);
  const commandExecutor = createCommandExecutor(options);
  const configManager = createConfigurationManager(config, options);
  const gitOps = createGitOperations(options);
  // The platform adapter is constructed lazily on first use because the
  // factory is async (it may shell out to git for GitHub repo auto-detect).
  // We memoize so subsequent calls within one orchestrator instance share it.
  let cachedAdapter: Awaited<ReturnType<typeof createPlatformAdapter>> | null = null;
  const getPlatformAdapter = async () => {
    if (!cachedAdapter) {
      cachedAdapter = await createPlatformAdapter(config, options);
    }
    return cachedAdapter;
  };
  // PolicyAdapter is resolved lazily on first use (factory is async because
  // GitHub may need to shell out to git for owner/repo resolution).
  let cachedPolicyAdapter: Awaited<ReturnType<typeof createPolicyAdapter>> | null = null;
  const getPolicyAdapter = async () => {
    if (!cachedPolicyAdapter) {
      cachedPolicyAdapter = await createPolicyAdapter(config, options);
    }
    return cachedPolicyAdapter;
  };
  const scopeAnalyzer = createScopeAnalyzer(options);

  // Platform-neutral identity for result objects. On AzDO this is org/project;
  // on GitHub it's owner/<placeholder-until-resolved>.
  const platformIdentity = config.azureDevOps
    ? { organization: config.azureDevOps.organization, project: config.azureDevOps.project }
    : { organization: config.github!.owner, project: config.github!.repo ?? '' };

  return {
    logger,

    /**
     * Validate readiness for signoff with warnings instead of failures
     */
    async validate(spinner: Spinner): Promise<ValidationResult> {
      const platformAdapter = await getPlatformAdapter();
      let warnings: string[] = [];

      // Skip Git validation when running in CI on the active platform
      if (!platformAdapter.isRunningInCi()) {
        // Check git state and collect warnings
        spinner.start('Checking git state');
        warnings = await gitOps.checkGitStateWithWarnings();

        if (warnings.length > 0) {
          spinner.warn('Git state warnings found');
          warnings.forEach((warning) => {
            console.log(chalk.yellow(warning));
          });
          console.log(
            chalk.dim(
              'Note: These issues must be resolved before running signoff. The signoff command requires a clean git state.\n',
            ),
          );
        } else {
          spinner.succeed('Git state looks good');
        }
      } else {
        spinner.info('Running in CI - skipping Git state validation');
      }

      // Execute configured commands
      await commandExecutor.executeCommands(config.signoff?.commands || [], spinner);

      // Get basic info
      const username = platformAdapter.isRunningInCi() ? 'Pipeline' : await gitOps.getGitUsername();
      let currentBranch = 'unknown';
      let commitHash = 'unknown';

      try {
        currentBranch = await gitOps.getCurrentBranch();
        commitHash = await gitOps.getCurrentCommit();
      } catch {
        // Ignore git errors in validate mode
        logger.verboseLog('Could not get git info (this is OK in validate mode)');
      }

      // Build message with policy context if configured
      let message = `Verified by ${username}`;
      const policyName = configManager.getPolicyName();
      const scopeToFolder = configManager.isScopeToFolder();

      if (policyName) {
        message += ` [Policy: ${policyName}]`;
      } else if (scopeToFolder) {
        const scopedFolder = await scopeAnalyzer.detectScopedFolder();
        const folderDisplay = scopedFolder || 'root';
        message += ` [Scope: ${folderDisplay}]`;
      }

      return {
        valid: true,
        message,
        commitHash: commitHash === 'unknown' ? 'unknown' : commitHash.substring(0, 8),
        currentBranch,
        warnings,
      };
    },

    /**
     * Main signoff execution method
     */
    async execute(spinner: Spinner): Promise<SignoffResult> {
      const platformAdapter = await getPlatformAdapter();

      // Setup: scope detection, git validation
      spinner.start('Preparing environment');

      let scopedFolder = '';
      let contextName = configManager.getStatusCheckContextName();

      if (configManager.isScopeToFolder()) {
        scopedFolder = await scopeAnalyzer.detectScopedFolder();
        // Update context name if using auto-generated name
        if (!configManager.getPolicyName() && scopedFolder) {
          contextName = scopeAnalyzer.generateContextName(scopedFolder);
        }
      }

      // Skip Git validation when running in Azure DevOps pipeline
      // Pipeline ensures clean state and automatic merging with target branch
      if (!platformAdapter.isRunningInCi()) {
        await gitOps.validateGitState();
        await gitOps.validateBranchAgainstDefault();
      } else {
        spinner.info('Running in CI - skipping Git state validation');
      }

      const token = await platformAdapter.getToken();
      const repoName = await gitOps.getRepositoryName();
      const repo = await platformAdapter.getRepositoryInfo(token, repoName);

      let prId: number | undefined = options.id;
      if (!prId) {
        prId = (await platformAdapter.findPullRequestId(token, repo)) ?? undefined;
      }

      // Check if we have a PR before continuing
      if (!prId) {
        spinner.fail('No active pull request found for current branch');
        throw new Error(
          'No active pull request found for current branch. ' +
            'Status checks are typically created for pull requests. ' +
            'Either create a pull request for this branch or specify a PR ID with --id option.',
        );
      }

      // Check scope if needed
      if (configManager.isScopeToFolder() && scopedFolder) {
        const hasChanges = await scopeAnalyzer.prHasChangesInScope(
          platformAdapter,
          token,
          repo,
          prId,
          scopedFolder,
        );
        if (!hasChanges) {
          spinner.succeed(`Environment ready - no changes in ${scopedFolder || 'root'} scope`);
          return {
            organization: platformIdentity.organization,
            project: platformIdentity.project,
            prId,
            message: 'No changes in scope - signoff skipped',
            commitHash: 'N/A',
            commitStatusCreated: false,
            type: 'commit-only',
            skipped: true,
          };
        }
      }
      spinner.succeed(`Environment ready - PR ${prId} in ${repo.name}`);

      // Execute configured commands (the main part users care about)
      await commandExecutor.executeCommands(config.signoff?.commands || [], spinner);

      // Create status checks
      spinner.start('Creating status checks');
      const commitHash = await gitOps.getCurrentCommit();
      const username = platformAdapter.isRunningInCi() ? 'Pipeline' : await gitOps.getGitUsername();

      let message = `Verified by ${username}`;
      const policyName = configManager.getPolicyName();
      if (policyName) {
        message += ` [Policy: ${policyName}]`;
      } else if (scopedFolder && configManager.isScopeToFolder()) {
        const folderDisplay = scopedFolder || 'root';
        message += ` [Scope: ${folderDisplay}]`;
      }

      // Create a standalone commit status only when running locally AND the
      // platform's commit status is distinct from the PR status (AzDO). On
      // GitHub the two are the same object, so createPrStatusCheck below covers
      // it and a separate call here would be a redundant duplicate POST.
      if (!platformAdapter.isRunningInCi() && platformAdapter.hasSeparateCommitStatus) {
        await platformAdapter.createCommitStatusCheck(
          token,
          repo,
          commitHash,
          message,
          contextName,
          prId || undefined,
        );
      }

      let prStatusCreated: boolean;
      try {
        await platformAdapter.createPrStatusCheck(
          token,
          repo,
          prId,
          message,
          commitHash,
          contextName,
        );
        prStatusCreated = true;
      } catch (error: unknown) {
        logger.verboseLog(`Failed to create pull request status check: ${describeError(error)}`);
        prStatusCreated = false;
      }

      if (prStatusCreated) {
        spinner.succeed('Status checks created successfully');
      } else {
        spinner.warn('Commit status created, but PR status failed');
      }

      return {
        organization: platformIdentity.organization,
        project: platformIdentity.project,
        prId,
        message,
        commitHash,
        prStatusCreated,
        commitStatusCreated: true, // We always create commit status
        type: prStatusCreated ? 'full-signoff' : 'commit-only',
      };
    },

    /**
     * Setup branch policy to require signoff status check
     */
    async setupPolicy(
      options: { targetBranch?: string; required?: boolean },
      spinner: Spinner,
    ): Promise<PolicySetupResult> {
      const platformAdapter = await getPlatformAdapter();
      const { required = true } = options;
      const targetBranch = options.targetBranch ?? (await gitOps.getDefaultBranch());

      let scopedFolder = '';
      let contextName = configManager.getStatusCheckContextName();

      // Detect scoped folder if enabled to determine the correct context name
      if (configManager.isScopeToFolder()) {
        spinner.start('Detecting scoped folder for policy');
        scopedFolder = await scopeAnalyzer.detectScopedFolder();
        if (scopedFolder !== null) {
          spinner.succeed(`Policy scope: ${scopedFolder || '(repository root)'}`);
          // Update context name if using auto-generated name
          if (!configManager.getPolicyName()) {
            contextName = scopeAnalyzer.generateContextName(scopedFolder);
          }
        } else {
          spinner.warn('Could not detect scoped folder, using default context');
        }
      }

      // Get Azure DevOps token
      const token = await platformAdapter.getToken();

      // Get repository information
      spinner.start('Getting repository information');
      const repoName = await gitOps.getRepositoryName();
      const repo = await platformAdapter.getRepositoryInfo(token, repoName);
      spinner.succeed(`Repository '${repo.name}' found`);

      // Setup the policy
      spinner.start(`${required ? 'Creating required' : 'Creating optional'} signoff policy`);
      const policyAdapter = await getPolicyAdapter();
      const result = await policyAdapter.setupPolicy(token, repo, contextName, {
        targetBranch,
        required,
        scopedFolder,
      });

      if (result.action === 'created') {
        spinner.succeed(`Branch policy created (ID: ${result.policyId})`);
      } else {
        spinner.succeed(`Branch policy updated (ID: ${result.policyId})`);
      }

      return result;
    },

    /**
     * Setup build validation policy for pipeline
     */
    async setupPipelineBuildPolicy(options: {
      pipelineId: number;
      pipelineName: string;
      targetBranch?: string;
      required?: boolean;
    }): Promise<PolicySetupResult> {
      if (!config.azureDevOps) {
        throw new Error(
          'Build validation policy setup is only supported on Azure DevOps. ' +
            'On GitHub, configure the equivalent via a Ruleset with a required workflow check.',
        );
      }
      const platformAdapter = await getPlatformAdapter();
      const { pipelineId, pipelineName, required = true } = options;
      const targetBranch = options.targetBranch ?? (await gitOps.getDefaultBranch());

      // Get Azure DevOps token
      const token = await platformAdapter.getToken();

      // Get repository information
      const repoName = await gitOps.getRepositoryName();
      const repo = await platformAdapter.getRepositoryInfo(token, repoName);

      // Get current repository folder for path filtering
      let pathFilter = undefined;

      try {
        // Use scope analyzer to detect the current folder in the repository
        const scopedFolder = await scopeAnalyzer.detectScopedFolder();

        if (scopedFolder) {
          // Create path filter from current repository location
          const pathPattern = scopedFolder.endsWith('/')
            ? scopedFolder.slice(0, -1) // Remove trailing slash
            : scopedFolder;

          // Ensure leading slash for Azure DevOps path filter
          pathFilter = pathPattern.startsWith('/') ? `${pathPattern}/*` : `/${pathPattern}/*`;

          logger.verboseLog(`Creating build policy with path filter: ${pathFilter}`);
        }
      } catch (error: unknown) {
        logger.verboseLog(`Failed to detect scope for path filtering: ${describeError(error)}`);
        // Continue without path filter if detection fails
      }

      const buildPolicyConfig: {
        isEnabled: boolean;
        isBlocking: boolean;
        type: { id: string };
        settings: {
          buildDefinitionId: number;
          displayName: string;
          validDuration: number;
          queueOnSourceUpdateOnly: boolean;
          manualQueueOnly: boolean;
          scope: { repositoryId: string; refName: string; matchKind: string }[];
          filenamePatterns?: string[];
        };
      } = {
        isEnabled: true,
        isBlocking: required,
        type: {
          id: '0609b952-1397-4640-95ec-e00a01b2c241', // Build policy type ID
        },
        settings: {
          buildDefinitionId: pipelineId,
          displayName: pipelineName,
          validDuration: 0,
          queueOnSourceUpdateOnly: false,
          manualQueueOnly: false,
          scope: [
            {
              repositoryId: repo.id,
              refName: `refs/heads/${targetBranch}`,
              matchKind: 'exact',
            },
          ],
        },
      };

      // Add path filter if configured
      if (pathFilter) {
        buildPolicyConfig.settings.filenamePatterns = [pathFilter];
      }

      logger.verboseLog('Creating build policy with configuration:', buildPolicyConfig);

      const policy = await httpJson(
        `https://dev.azure.com/${config.azureDevOps.organization}/${config.azureDevOps.project}/_apis/policy/configurations?api-version=7.2-preview.1`,
        parseAzurePolicyConfig,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(buildPolicyConfig),
        },
      );

      return {
        action: 'created',
        policyId: policy.id,
        repository: repo.name,
        targetBranch,
        required,
      };
    },
  };
}
