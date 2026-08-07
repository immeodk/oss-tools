import { createLogger } from '../core/logger.js';
import { createCommandExecutor } from '../core/command-executor.js';
import { isAzureDevOpsPipeline } from '../config/env.js';
import type { PrSignoffConfig } from '../config/config.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';
import type {
  Repository,
  PullRequest,
  StatusCheck,
  PullRequestCreateOptions,
  PullRequestLabel,
} from '../platform/types.js';
import type { AzureContext } from './operations/context.js';
import { getAzureDevOpsToken } from './operations/auth.js';
import { getRepositoryInfo } from './operations/repos.js';
import { getPullRequestLabels, updatePullRequestLabels } from './operations/labels.js';
import {
  findPullRequestId,
  getPrDetails,
  getPrChanges,
  createPullRequest,
} from './operations/pull-requests.js';
import {
  getStatusChecks,
  createCommitStatusCheck,
  createPrStatusCheck,
} from './operations/statuses.js';

// Re-export neutral types so existing imports of these symbols keep working.
export type { Repository, PullRequest, StatusCheck, PullRequestCreateOptions, PullRequestLabel };

/**
 * Check if running in Azure DevOps pipeline.
 *
 * @deprecated Prefer `adapter.isRunningInCi()` on the active PlatformAdapter,
 *   or `isAzureDevOpsPipeline()` from `lib/config/env`. Kept as a re-export so
 *   the orchestrator and tests that import the function form keep working.
 */
export function isRunningInAzureDevOpsPipeline(): boolean {
  return isAzureDevOpsPipeline();
}

export interface AzureDevOpsClientOptions {
  verbose?: boolean;
}

/**
 * Azure DevOps implementation of {@link PlatformAdapter}.
 *
 * `getAzureDevOpsToken` is preserved as a deprecated alias for `getToken` so
 * older call sites keep compiling.
 */
export interface AzureDevOpsClient extends PlatformAdapter {
  /**
   * @deprecated Use `getToken()` instead.
   */
  getAzureDevOpsToken(): Promise<string>;
}

/**
 * Compose the per-concern operation functions (auth, repos, pull-requests,
 * statuses, labels) into a single `PlatformAdapter`. Each operation lives in
 * its own module under `operations/` and receives the shared {@link AzureContext}.
 */
export function createAzureDevOpsClient(
  organization: string,
  project: string,
  config: PrSignoffConfig,
  options: AzureDevOpsClientOptions = {},
): AzureDevOpsClient {
  const verbose = options.verbose || false;
  const ctx: AzureContext = {
    organization,
    project,
    config,
    logger: createLogger(verbose),
    commandExecutor: createCommandExecutor(options),
    verbose,
  };

  return {
    logger: ctx.logger,

    // AzDO commit statuses and PR-iteration statuses are distinct objects.
    hasSeparateCommitStatus: true,

    isRunningInCi: () => isAzureDevOpsPipeline(),

    getAzureDevOpsToken: () => getAzureDevOpsToken(ctx),
    getToken: () => getAzureDevOpsToken(ctx),

    getRepositoryInfo: (token, repoName) => getRepositoryInfo(ctx, token, repoName),
    findPullRequestId: (token, repo) => findPullRequestId(ctx, token, repo),
    getPrDetails: (token, repo, prId) => getPrDetails(ctx, token, repo, prId),
    getPrChanges: (token, repo, prId) => getPrChanges(ctx, token, repo, prId),
    createPullRequest: (token, repo, createOptions) =>
      createPullRequest(ctx, token, repo, createOptions),

    getStatusChecks: (token, repo, prId) => getStatusChecks(ctx, token, repo, prId),
    createCommitStatusCheck: (token, repo, commitHash, message, contextName, prId) =>
      createCommitStatusCheck(ctx, token, repo, commitHash, message, contextName, prId),
    createPrStatusCheck: (token, repo, prId, message, commitHash, contextName) =>
      createPrStatusCheck(ctx, token, repo, prId, message, commitHash, contextName),

    getPullRequestLabels: (token, repo, prId) => getPullRequestLabels(ctx, token, repo, prId),
    updatePullRequestLabels: (token, repo, prId, labels) =>
      updatePullRequestLabels(ctx, token, repo, prId, labels),
  };
}
