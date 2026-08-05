import { httpJson } from '../../platform/http.js';
import { parseAzureRepo } from '../schemas.js';
import { authHeaders, type AzureContext } from './context.js';
import type { Repository } from '../../platform/types.js';

export async function getRepositoryInfo(
  ctx: AzureContext,
  token: string,
  repoName: string,
): Promise<Repository> {
  return httpJson(
    `https://dev.azure.com/${ctx.organization}/${ctx.project}/_apis/git/repositories/${repoName}?api-version=7.2-preview.2`,
    parseAzureRepo,
    { headers: authHeaders(token) },
  );
}
