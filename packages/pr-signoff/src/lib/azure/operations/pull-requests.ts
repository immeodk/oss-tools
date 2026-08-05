import { getCurrentBranch } from '@immeodk/git-utils';
import { describeError } from '../../core/error-message.js';
import { readEnv, isAzureDevOpsPipeline } from '../../config/env.js';
import { httpJson } from '../../platform/http.js';
import {
  parseAzurePullRequestList,
  parseAzurePullRequest,
  parseAzureIterations,
  parseAzureChanges,
  parseAzureConnectionData,
} from '../schemas.js';
import { authHeaders, jsonHeaders, type AzureContext } from './context.js';
import { getPullRequestLabels } from './labels.js';
import type { Repository, PullRequest, PullRequestCreateOptions } from '../../platform/types.js';

export async function findPullRequestId(
  ctx: AzureContext,
  token: string,
  repo: Repository,
): Promise<number | null> {
  const { organization, project, logger, verbose } = ctx;
  try {
    const env = readEnv();
    // When running in Azure DevOps pipeline for PR, use the environment variable
    if (isAzureDevOpsPipeline()) {
      const prId = env.SYSTEM_PULLREQUEST_PULLREQUESTID;
      if (prId) {
        const pullRequestId = parseInt(prId, 10);
        logger.verboseLog(`Using PR ID from Azure DevOps pipeline: ${pullRequestId}`);
        return pullRequestId;
      }
    }

    const branchName = isAzureDevOpsPipeline()
      ? env.SYSTEM_PULLREQUEST_SOURCEBRANCHNAME?.replace('refs/heads/', '') || 'unknown'
      : await getCurrentBranch({ verbose });

    const sourceRef = encodeURIComponent(`refs/heads/${branchName}`);
    const pullRequestsUrl = `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullrequests?api-version=7.2-preview.2&searchCriteria.sourceRefName=${sourceRef}&searchCriteria.status=active`;

    const prs = await httpJson(pullRequestsUrl, parseAzurePullRequestList, {
      headers: authHeaders(token),
    });
    return prs.length > 0 ? prs[0]!.pullRequestId : null;
  } catch (error: unknown) {
    logger.verboseLog(`Could not determine pull request ID: ${describeError(error)}`);
    return null;
  }
}

export async function getPrDetails(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
): Promise<PullRequest> {
  const { organization, project, logger } = ctx;
  const pr = await httpJson(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}?api-version=7.2-preview.2`,
    parseAzurePullRequest,
    { headers: authHeaders(token) },
  );

  // Fetch labels separately
  try {
    pr.labels = await getPullRequestLabels(ctx, token, repo, prId);
  } catch (error: unknown) {
    logger.verboseLog(`Could not fetch labels for PR ${prId}: ${describeError(error)}`);
    pr.labels = [];
  }

  return pr;
}

export async function getPrChanges(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
): Promise<string[]> {
  const { organization, project, logger } = ctx;
  try {
    // Get PR iterations, then the changes for the latest iteration
    const iterations = await httpJson(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/iterations?api-version=7.2-preview.2&includeCommits=false`,
      parseAzureIterations,
      { headers: authHeaders(token) },
    );
    const latestIteration = iterations[iterations.length - 1];
    if (!latestIteration) {
      return [];
    }

    return await httpJson(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/iterations/${latestIteration.id}/changes?api-version=7.2-preview.2`,
      parseAzureChanges,
      { headers: authHeaders(token) },
    );
  } catch (error: unknown) {
    logger.verboseLog(`Error getting PR changes: ${describeError(error)}`);
    return [];
  }
}

export async function createPullRequest(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  options: PullRequestCreateOptions,
): Promise<PullRequest> {
  const { organization, project, logger } = ctx;
  const prBody: Record<string, unknown> = {
    sourceRefName: `refs/heads/${options.sourceBranch}`,
    targetRefName: `refs/heads/${options.targetBranch}`,
    title: options.title,
    description: options.description || '',
    isDraft: options.isDraft || false,
  };

  logger.verboseLog(`Creating PR with body: ${JSON.stringify(prBody, null, 2)}`);

  // Add auto-complete options if requested
  if (options.autoComplete) {
    try {
      const { userId } = await httpJson(
        `https://dev.azure.com/${organization}/_apis/connectionData`,
        parseAzureConnectionData,
        { headers: authHeaders(token) },
      );
      prBody.autoCompleteSetBy = { id: userId };
      prBody.completionOptions = {
        deleteSourceBranch: false,
        mergeCommitMessage: `Merged PR ${options.title}`,
        squashMerge: false,
      };
    } catch (error: unknown) {
      logger.verboseLog(
        `Could not resolve current user for auto-complete: ${describeError(error)}`,
      );
    }
  }

  const pr = await httpJson(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullrequests?api-version=7.2-preview.2`,
    parseAzurePullRequest,
    { method: 'POST', headers: jsonHeaders(token), body: JSON.stringify(prBody) },
  );
  pr.url = `https://dev.azure.com/${organization}/${project}/_git/${repo.name}/pullrequest/${pr.pullRequestId}`;

  // Add labels if provided
  if (options.labels && options.labels.length > 0) {
    for (const labelName of options.labels) {
      try {
        await fetch(
          `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${pr.pullRequestId}/labels?api-version=7.1`,
          {
            method: 'POST',
            headers: jsonHeaders(token),
            body: JSON.stringify({ name: labelName }),
          },
        );
      } catch (error: unknown) {
        logger.verboseLog(`Failed to add label ${labelName} to PR: ${describeError(error)}`);
      }
    }
    pr.labels = options.labels.map((name) => ({ name }));
  } else {
    pr.labels = [];
  }

  return pr;
}
