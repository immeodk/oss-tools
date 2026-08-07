import { createLogger } from '../core/logger.js';
import { isGitHubActions } from '../config/env.js';
import { getGitHubToken } from './github-auth.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';
import type { GitHubContext } from './operations/context.js';
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

export interface GitHubClientOptions {
  verbose?: boolean;
}

/**
 * GitHub implementation of {@link PlatformAdapter}.
 *
 * Composes the per-concern operation functions (repos, pull-requests,
 * statuses, labels) over a shared {@link GitHubContext} — mirroring the Azure
 * DevOps client structure. Uses `fetch` against the REST v3 API; auth tokens
 * come from {@link getGitHubToken}. Repository identity is the `owner/repo`
 * slug (GitHub has no per-platform GUID and the slug is unambiguous).
 */
export function createGitHubClient(
  owner: string,
  repo: string,
  options: GitHubClientOptions = {},
): PlatformAdapter {
  const verbose = options.verbose || false;
  const ctx: GitHubContext = {
    owner,
    repo,
    logger: createLogger(verbose),
    verbose,
  };

  return {
    logger: ctx.logger,

    // On GitHub the PR check IS the commit status on the head SHA, so
    // createPrStatusCheck already covers it — no separate commit status.
    hasSeparateCommitStatus: false,

    isRunningInCi: () => isGitHubActions(),
    getToken: () => getGitHubToken({ verbose }),

    getRepositoryInfo: (token, repoName) => getRepositoryInfo(ctx, token, repoName),
    findPullRequestId: (token, r) => findPullRequestId(ctx, token, r),
    getPrDetails: (token, r, prId) => getPrDetails(ctx, token, r, prId),
    getPrChanges: (token, r, prId) => getPrChanges(ctx, token, r, prId),
    createPullRequest: (token, r, createOptions) => createPullRequest(ctx, token, r, createOptions),

    getStatusChecks: (token, r, prId) => getStatusChecks(ctx, token, r, prId),
    createCommitStatusCheck: (token, r, commitHash, message, contextName, prId) =>
      createCommitStatusCheck(ctx, token, r, commitHash, message, contextName, prId),
    createPrStatusCheck: (token, r, prId, message, commitHash, contextName) =>
      createPrStatusCheck(ctx, token, r, prId, message, commitHash, contextName),

    getPullRequestLabels: (token, r, prId) => getPullRequestLabels(ctx, token, r, prId),
    updatePullRequestLabels: (token, r, prId, labels) =>
      updatePullRequestLabels(ctx, token, r, prId, labels),
  };
}
