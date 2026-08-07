import { getCurrentBranch } from '@immeodk/git-utils';
import { describeError } from '../../core/error-message.js';
import { isGitHubActions, readEnv } from '../../config/env.js';
import { httpJson } from '../../platform/http.js';
import {
  parseGitHubPullList,
  parseGitHubPullDetail,
  parseGitHubCreatedPull,
  parseGitHubFilesList,
} from '../schemas.js';
import { GITHUB_API, authHeaders, jsonHeaders, type GitHubContext } from './context.js';
import { getPullRequestLabels } from './labels.js';
import type { Repository, PullRequest, PullRequestCreateOptions } from '../../platform/types.js';

export async function findPullRequestId(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
): Promise<number | null> {
  const { owner, repo, logger, verbose } = ctx;
  try {
    const env = readEnv();
    const branchName =
      isGitHubActions() && env.GITHUB_EVENT_NAME === 'pull_request'
        ? env.GITHUB_HEAD_REF || (await getCurrentBranch({ verbose }))
        : await getCurrentBranch({ verbose });

    const head = encodeURIComponent(`${owner}:${branchName}`);
    const url = `${GITHUB_API}/repos/${owner}/${repo}/pulls?head=${head}&state=open`;

    const prs = await httpJson(url, parseGitHubPullList, { headers: authHeaders(token) });
    return prs.length > 0 ? prs[0]!.number : null;
  } catch (error: unknown) {
    logger.verboseLog(`Could not determine pull request ID: ${describeError(error)}`);
    return null;
  }
}

export async function getPrDetails(
  ctx: GitHubContext,
  token: string,
  repo: Repository,
  prId: number,
): Promise<PullRequest> {
  const detail = await httpJson(
    `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/pulls/${prId}`,
    parseGitHubPullDetail,
    { headers: authHeaders(token) },
  );
  const pr: PullRequest = { ...detail.pullRequest };

  try {
    pr.labels = await getPullRequestLabels(ctx, token, repo, prId);
  } catch (error: unknown) {
    ctx.logger.verboseLog(`Could not fetch labels for PR ${prId}: ${describeError(error)}`);
    pr.labels = [];
  }

  return pr;
}

export async function getPrChanges(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  prId: number,
): Promise<string[]> {
  try {
    return await httpJson(
      `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/pulls/${prId}/files?per_page=100`,
      parseGitHubFilesList,
      { headers: authHeaders(token) },
    );
  } catch (error: unknown) {
    ctx.logger.verboseLog(`Error getting PR files: ${describeError(error)}`);
    return [];
  }
}

export async function createPullRequest(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  options: PullRequestCreateOptions,
): Promise<PullRequest> {
  const { owner, repo, logger } = ctx;

  // GitHub has no direct "auto-complete" toggle like AzDO; the closest
  // equivalent is auto-merge (GraphQL `enablePullRequestAutoMerge`). Log and
  // ignore rather than silently doing nothing surprising.
  if (options.autoComplete) {
    logger.verboseLog(
      'autoComplete is not supported on GitHub PRs; ignoring. ' +
        'Enable auto-merge via the GitHub UI or GraphQL API instead.',
    );
  }

  const created = await httpJson(
    `${GITHUB_API}/repos/${owner}/${repo}/pulls`,
    parseGitHubCreatedPull,
    {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        title: options.title,
        body: options.description ?? '',
        head: options.sourceBranch,
        base: options.targetBranch,
        draft: options.isDraft ?? false,
      }),
    },
  );

  const pr: PullRequest = { ...created, labels: [] };

  // Apply labels via the Issues API (PRs are issues on GitHub)
  if (options.labels && options.labels.length > 0) {
    const labelsResponse = await fetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${created.pullRequestId}/labels`,
      {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ labels: options.labels }),
      },
    );

    if (!labelsResponse.ok) {
      logger.verboseLog(`Failed to apply labels: ${labelsResponse.statusText}`);
    } else {
      pr.labels = options.labels.map((name) => ({ name }));
    }
  }

  return pr;
}
