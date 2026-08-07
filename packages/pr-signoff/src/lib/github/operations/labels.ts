import { httpJson } from '../../platform/http.js';
import { parseGitHubLabelsList, parseGitHubPullDetail } from '../schemas.js';
import { GITHUB_API, authHeaders, jsonHeaders, type GitHubContext } from './context.js';
import type { Repository, PullRequest, PullRequestLabel } from '../../platform/types.js';

export async function getPullRequestLabels(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  prId: number,
): Promise<PullRequestLabel[]> {
  const response = await fetch(
    `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/issues/${prId}/labels`,
    { headers: authHeaders(token) },
  );
  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to get PR labels: ${response.statusText}`);
  }
  const parsed = parseGitHubLabelsList(await response.json());
  return parsed.map((l) => ({ id: l.nodeId, name: l.name, active: true }));
}

export async function updatePullRequestLabels(
  ctx: GitHubContext,
  token: string,
  _repo: Repository,
  prId: number,
  labels: PullRequestLabel[],
): Promise<PullRequest> {
  // PUT replaces the entire label set in one call (vs AzDO which loops
  // through delete-then-create for each label).
  const labelNames = labels.map((l) => l.name);
  const response = await fetch(
    `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/issues/${prId}/labels`,
    { method: 'PUT', headers: jsonHeaders(token), body: JSON.stringify({ labels: labelNames }) },
  );
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update labels on PR ${prId}: ${response.statusText} - ${text}`);
  }

  // Return refreshed PR details with the labels we just set (authoritative,
  // since the PUT above replaced the full set). Mirrors the AzDO adapter.
  const detail = await httpJson(
    `${GITHUB_API}/repos/${ctx.owner}/${ctx.repo}/pulls/${prId}`,
    parseGitHubPullDetail,
    { headers: authHeaders(token) },
  );
  return { ...detail.pullRequest, labels };
}
