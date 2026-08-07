import { createLogger, Logger } from '../core/logger.js';
import type { PrSignoffConfig } from '../config/config.js';
import { createGitOperations } from '../core/git-operations.js';
import { createPlatformAdapter } from '../platform/create-platform-adapter.js';
import type { Spinner } from '../core/spinner.js';
import type {
  PullRequest,
  PullRequestUser,
  PullRequestLabel,
  StatusCheck,
} from '../platform/types.js';

export interface PrManagerOptions {
  verbose?: boolean;
}

export interface PullRequestCreateOptions {
  title?: string;
  description?: string;
  targetBranch: string;
  validationMode: 'local' | 'pipeline';
  isDraft: boolean;
  autoComplete: boolean;
}

export interface PullRequestUpdateValidationModeOptions {
  prId?: number;
  validationMode: 'local' | 'pipeline';
}

export interface PullRequestCreateResult {
  pullRequestId: number;
  title: string;
  url: string;
  labels: PullRequestLabel[];
}

export interface PullRequestDetails {
  pullRequestId: number;
  title: string | undefined;
  createdBy: PullRequestUser | undefined;
  status: string | undefined;
  sourceRefName: string | undefined;
  targetRefName: string | undefined;
  labels: PullRequestLabel[] | undefined;
}

export interface PrStatusResult {
  pr: PullRequest;
  statusChecks: StatusCheck[];
  currentCommit: string;
  currentBranch: string;
  repository: string;
}

export interface PrManager {
  readonly logger: Logger;
  createPullRequest(
    options: PullRequestCreateOptions,
    spinner: Spinner,
  ): Promise<PullRequestCreateResult>;
  updatePullRequestValidationMode(
    options: PullRequestUpdateValidationModeOptions,
    spinner: Spinner,
  ): Promise<PullRequest>;
  getPrStatus(prId: number | null, spinner: Spinner): Promise<PrStatusResult>;
  getPullRequestDetails(prId: number | null, spinner: Spinner): Promise<PullRequestDetails>;
}

export function createPrManager(
  config: PrSignoffConfig,
  options: PrManagerOptions = {},
): PrManager {
  const logger = createLogger(options.verbose || false);
  const gitOps = createGitOperations(options);

  // Platform adapter is resolved lazily; the factory is async (GitHub may
  // shell out to git for owner/repo auto-detect).
  let cached: Awaited<ReturnType<typeof createPlatformAdapter>> | null = null;
  const getAdapter = async () => {
    if (!cached) cached = await createPlatformAdapter(config, options);
    return cached;
  };

  return {
    logger,

    /**
     * Create a new pull request with validation mode tags
     */
    async createPullRequest(
      options: PullRequestCreateOptions,
      spinner: Spinner,
    ): Promise<PullRequestCreateResult> {
      const adapter = await getAdapter();

      // Get current branch
      spinner.start('Getting current branch');
      const sourceBranch = await gitOps.getCurrentBranch();
      spinner.succeed(`Source branch: ${sourceBranch}`);

      // Title should be provided by the command (which handles prompting)
      const title = options.title;
      if (!title) {
        throw new Error('PR title is required');
      }

      // Debug description
      logger.verboseLog(
        `Description received: '${options.description}' (length: ${options.description?.length || 0})`,
      );
      if (options.description) {
        logger.verboseLog(`First 100 chars: '${options.description.substring(0, 100)}'`);
      }

      // Get Azure DevOps token
      const token = await adapter.getToken();

      // Get repository information
      spinner.start('Getting repository information');
      const repoName = await gitOps.getRepositoryName();
      const repo = await adapter.getRepositoryInfo(token, repoName);
      spinner.succeed(`Repository: ${repo.name}`);

      // Set signoff strategy tag
      const labels = [`signoff-method-${options.validationMode || 'local'}`];

      // Create the PR
      spinner.start('Creating pull request');
      const pr = await adapter.createPullRequest(token, repo, {
        title,
        description: options.description,
        sourceBranch,
        targetBranch: options.targetBranch,
        isDraft: options.isDraft,
        autoComplete: options.autoComplete,
        labels,
      });
      spinner.succeed(`Pull request #${pr.pullRequestId} created`);

      return {
        pullRequestId: pr.pullRequestId,
        title: pr.title ?? '',
        url: pr.url ?? '',
        labels: pr.labels || [],
      };
    },

    /**
     * Update pull request validation mode
     */
    async updatePullRequestValidationMode(
      options: PullRequestUpdateValidationModeOptions,
      spinner: Spinner,
    ): Promise<PullRequest> {
      const adapter = await getAdapter();
      const token = await adapter.getToken();

      // Get repository information
      spinner.start('Getting repository information');
      const repoName = await gitOps.getRepositoryName();
      const repo = await adapter.getRepositoryInfo(token, repoName);
      spinner.succeed(`Repository: ${repo.name}`);

      // Find PR ID if not provided
      let prId: number | undefined = options.prId;
      if (!prId) {
        spinner.start('Finding pull request for current branch');
        const found = await adapter.findPullRequestId(token, repo);
        if (!found) {
          throw new Error(
            'No active pull request found for current branch. Use --id to specify a PR ID.',
          );
        }
        prId = found;
        spinner.succeed(`Found PR #${prId}`);
      }

      // Get current labels
      spinner.start('Getting current PR labels');
      const currentLabels = await adapter.getPullRequestLabels(token, repo, prId);
      logger.verboseLog(`Retrieved labels: ${JSON.stringify(currentLabels.map((l) => l.name))}`);
      const strategyLabel = currentLabels.find((l) => l.name.startsWith('signoff-method-'));
      const currentMode = strategyLabel
        ? strategyLabel.name.substring('signoff-method-'.length)
        : 'none';
      spinner.succeed(`Current validation mode: ${currentMode}`);

      if (currentLabels.length > 0) {
        logger.verboseLog(`All current labels: ${currentLabels.map((l) => l.name).join(', ')}`);
      }

      // Build new label list - keep non-validation labels and add new validation tag
      const removedTags = currentLabels.filter((l) => l.name.startsWith('signoff-method-'));
      const keptLabels = currentLabels.filter((l) => !l.name.startsWith('signoff-method-'));

      if (removedTags.length > 0) {
        logger.verboseLog(
          `Removing old validation tags: ${removedTags.map((l) => l.name).join(', ')}`,
        );
      }

      if (keptLabels.length > 0) {
        logger.verboseLog(`Keeping existing labels: ${keptLabels.map((l) => l.name).join(', ')}`);
      }

      const strategyTag = `signoff-method-${options.validationMode || 'local'}`;
      const finalLabels = [...keptLabels, { name: strategyTag }];
      logger.verboseLog(`Adding new validation tag: ${strategyTag}`);

      // Update PR with all labels (kept + new validation tag)
      spinner.start(`Setting validation mode to ${options.validationMode}`);
      const updatedPr = await adapter.updatePullRequestLabels(token, repo, prId, finalLabels);
      spinner.succeed(`PR #${prId} validation mode updated`);

      return updatedPr;
    },

    /**
     * Get detailed PR status information
     */
    async getPrStatus(prId: number | null, _spinner: Spinner): Promise<PrStatusResult> {
      const adapter = await getAdapter();
      // Quick silent setup for status checking
      const token = await adapter.getToken();
      const repoName = await gitOps.getRepositoryName();
      const repo = await adapter.getRepositoryInfo(token, repoName);

      if (!prId) {
        prId = await adapter.findPullRequestId(token, repo);
        if (!prId) {
          throw new Error(
            'No active pull request found for current branch. Use --id to specify a PR ID.',
          );
        }
      }

      const prDetails = await adapter.getPrDetails(token, repo, prId);
      const statusChecks = await adapter.getStatusChecks(token, repo, prId);

      // Get current commit info
      const currentCommit = await gitOps.getCurrentCommit();
      const currentBranch = await gitOps.getCurrentBranch();

      return {
        pr: prDetails,
        statusChecks,
        currentCommit: currentCommit.substring(0, 8),
        currentBranch,
        repository: repo.name,
      };
    },

    /**
     * Get pull request details including validation mode
     */
    async getPullRequestDetails(
      prId: number | null,
      _spinner: Spinner,
    ): Promise<PullRequestDetails> {
      const adapter = await getAdapter();
      const token = await adapter.getToken();

      // Get repository information
      const repoName = await gitOps.getRepositoryName();
      const repo = await adapter.getRepositoryInfo(token, repoName);

      // Find PR ID if not provided
      if (!prId) {
        prId = await adapter.findPullRequestId(token, repo);
        if (!prId) {
          throw new Error(
            'No active pull request found for current branch. Use --id to specify a PR ID.',
          );
        }
      }

      // Get PR details
      const pr = await adapter.getPrDetails(token, repo, prId);

      return {
        pullRequestId: pr.pullRequestId,
        title: pr.title,
        createdBy: pr.createdBy,
        status: pr.status,
        sourceRefName: pr.sourceRefName,
        targetRefName: pr.targetRefName,
        labels: pr.labels,
      };
    },
  };
}
