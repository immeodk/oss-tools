import { httpJson } from '../../platform/http.js';
import { parseGitHubRepoResponse } from '../schemas.js';
import { GITHUB_API, authHeaders, type GitHubContext } from './context.js';
import type { Repository } from '../../platform/types.js';

export async function getRepositoryInfo(
  ctx: GitHubContext,
  token: string,
  repoName: string,
): Promise<Repository> {
  const data = await httpJson(
    `${GITHUB_API}/repos/${ctx.owner}/${repoName}`,
    parseGitHubRepoResponse,
    { headers: authHeaders(token) },
  );
  return {
    id: data.full_name ?? `${ctx.owner}/${repoName}`,
    name: data.name,
  };
}
