import { describeError } from '../../core/error-message.js';
import { httpJson } from '../../platform/http.js';
import { parseAzurePullRequest, parseAzureLabelsList } from '../schemas.js';
import { authHeaders, jsonHeaders, type AzureContext } from './context.js';
import type { Repository, PullRequest, PullRequestLabel } from '../../platform/types.js';

function labelsUrl(ctx: AzureContext, repo: Repository, prId: number): string {
  return `https://dev.azure.com/${ctx.organization}/${ctx.project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/labels?api-version=7.1`;
}

export async function getPullRequestLabels(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
): Promise<PullRequestLabel[]> {
  const response = await fetch(labelsUrl(ctx, repo, prId), { headers: authHeaders(token) });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`Failed to get PR labels: ${response.statusText}`);
  }

  return parseAzureLabelsList(await response.json());
}

export async function updatePullRequestLabels(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
  labels: PullRequestLabel[],
): Promise<PullRequest> {
  const { organization, project, logger } = ctx;

  // First, get current labels (tolerate failure → treat as no labels)
  let currentLabels: PullRequestLabel[] = [];
  try {
    currentLabels = await getPullRequestLabels(ctx, token, repo, prId);
  } catch (error: unknown) {
    logger.verboseLog(`Could not read current labels: ${describeError(error)}`);
  }

  // Delete all existing labels
  for (const label of currentLabels) {
    const deleteResponse = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/labels/${encodeURIComponent(label.name)}?api-version=7.1`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorBody = await deleteResponse.text().catch(() => '');
      const errorDetails = errorBody
        ? `${deleteResponse.statusText} - ${errorBody}`
        : deleteResponse.statusText;
      logger.verboseLog(`Failed to delete label ${label.name}: ${errorDetails}`);
    }
  }

  // Add new labels
  for (const label of labels) {
    const createResponse = await fetch(labelsUrl(ctx, repo, prId), {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({ name: label.name }),
    });

    if (!createResponse.ok) {
      const errorBody = await createResponse.text().catch(() => '');
      const errorDetails = errorBody
        ? `${createResponse.statusText} - ${errorBody}`
        : createResponse.statusText;
      logger.verboseLog(`Failed to add label ${label.name}: ${errorDetails}`);
    }
  }

  // Return updated PR details
  const pr = await httpJson(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}?api-version=7.2-preview.2`,
    parseAzurePullRequest,
    { headers: authHeaders(token) },
  );

  pr.labels = labels;
  return pr;
}
