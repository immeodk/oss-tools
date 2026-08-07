import { describeError } from '../../core/error-message.js';
import { httpJson } from '../../platform/http.js';
import { parseGitHubPullDetail, parseGitHubCombinedStatus } from '../schemas.js';
import { GITHUB_API, authHeaders, jsonHeaders, type GitHubContext } from './context.js';
import type { Repository, StatusCheck } from '../../platform/types.js';

/** GitHub state values used by the commit Statuses API. */
type GitHubStatusState = 'success' | 'failure' | 'pending' | 'error';

/**
 * Translate the neutral AzDO-style state vocabulary to GitHub's. `notSet` has
 * no GitHub equivalent and is treated as `pending`.
 */
function toGitHubState(neutralState: string): GitHubStatusState {
  switch (neutralState) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'failure';
    case 'pending':
      return 'pending';
    case 'error':
      return 'error';
    default:
      return 'pending';
  }
}

/** Reverse translation for displaying GitHub statuses through the neutral shape. */
function fromGitHubState(githubState: string): string {
  switch (githubState) {
    case 'success':
      return 'succeeded';
    case 'failure':
      return 'failed';
    case 'pending':
      return 'pending';
    case 'error':
      return 'error';
    default:
      return githubState;
  }
}

export async function getStatusChecks(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  prId: number,
): Promise<StatusCheck[]> {
  const { owner, repo, logger } = ctx;
  try {
    const detail = await httpJson(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls/${prId}`,
      parseGitHubPullDetail,
      { headers: authHeaders(token) },
    );
    if (!detail.headSha) return [];

    const statuses = await httpJson(
      `${GITHUB_API}/repos/${owner}/${repo}/commits/${detail.headSha}/status`,
      parseGitHubCombinedStatus,
      { headers: authHeaders(token) },
    );

    return statuses.map((s) => ({
      state: fromGitHubState(s.state),
      description: s.description,
      context: { name: s.context, genre: 'pr-signoff' },
      creationDate: s.created_at ?? new Date().toISOString(),
      targetUrl: s.target_url,
    }));
  } catch (error: unknown) {
    logger.verboseLog(`Failed to fetch status checks: ${describeError(error)}`);
    return [];
  }
}

export async function createCommitStatusCheck(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  commitHash: string,
  message: string,
  contextName: string,
  prId?: number,
): Promise<Response> {
  const { owner, repo } = ctx;
  const targetUrl = prId
    ? `https://github.com/${owner}/${repo}/pull/${prId}`
    : `https://github.com/${owner}/${repo}/commit/${commitHash}`;

  const response = await fetch(`${GITHUB_API}/repos/${owner}/${repo}/statuses/${commitHash}`, {
    method: 'POST',
    headers: jsonHeaders(token),
    body: JSON.stringify({
      state: toGitHubState('succeeded'),
      description: message,
      context: contextName,
      target_url: targetUrl,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create commit status check: ${response.statusText}`);
  }
  return response;
}

export async function createPrStatusCheck(
  ctx: GitHubContext,
  token: string,
  repo: Repository,
  prId: number,
  message: string,
  commitHash: string,
  contextName: string,
): Promise<Response> {
  // GitHub has no PR-iteration-level status concept. The "PR" status is the
  // same commit status applied to the PR head SHA. The orchestrator already
  // obtains the head SHA via gitOps before calling us.
  return createCommitStatusCheck(ctx, token, repo, commitHash, message, contextName, prId);
}
