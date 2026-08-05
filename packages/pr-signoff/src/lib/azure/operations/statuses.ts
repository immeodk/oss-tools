import { getCurrentCommit } from '@immeodk/git-utils';
import { describeError } from '../../core/error-message.js';
import { STATUS_CHECK_GENRE } from '../../core/configuration-manager.js';
import { readEnv, isAzureDevOpsPipeline } from '../../config/env.js';
import { httpJson } from '../../platform/http.js';
import {
  parseAzureProject,
  parseAzurePolicyEvaluations,
  parseAzureStatusList,
  parseAzureIterations,
} from '../schemas.js';
import { authHeaders, jsonHeaders, type AzureContext } from './context.js';
import type { Repository, StatusCheck } from '../../platform/types.js';

/** Map an Azure DevOps policy-evaluation status to a neutral state + description. */
function mapPolicyStatus(policyStatus: string | undefined): { state: string; description: string } {
  switch (policyStatus) {
    case 'approved':
      return { state: 'succeeded', description: 'Policy requirements met' };
    case 'rejected':
      return { state: 'failed', description: 'Policy requirements not met' };
    case 'queued':
    case 'running':
      return { state: 'pending', description: 'Policy evaluation in progress' };
    case 'notApplicable':
      return { state: 'notSet', description: 'Policy not applicable' };
    case 'broken':
      return { state: 'error', description: 'Policy evaluation failed' };
    default:
      return { state: 'pending', description: 'Waiting for signoff' };
  }
}

export async function getStatusChecks(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
): Promise<StatusCheck[]> {
  const { organization, project, logger, verbose } = ctx;
  const headers = authHeaders(token);
  try {
    // Get project details to get the project GUID
    const { id: projectId } = await httpJson(
      `https://dev.azure.com/${organization}/_apis/projects/${project}?api-version=7.1`,
      parseAzureProject,
      { headers },
    );
    logger.verboseLog(`Project ${project} has ID: ${projectId}`);

    // Get policy evaluations using correct vstfs artifact ID format with project GUID
    const artifactId = `vstfs:///CodeReview/CodeReviewId/${projectId}/${prId}`;
    logger.verboseLog(`Using artifact ID: ${artifactId}`);

    const evaluations = await httpJson(
      `https://dev.azure.com/${organization}/${project}/_apis/policy/evaluations?artifactId=${encodeURIComponent(artifactId)}&api-version=7.1-preview.1`,
      parseAzurePolicyEvaluations,
      { headers },
    );

    const statusPolicyEvaluations = evaluations.filter(
      (e) => e.displayName === 'Status' && e.statusName,
    );

    if (statusPolicyEvaluations.length === 0) {
      logger.verboseLog('No status check policy evaluations found, using fallback');
      throw new Error('No status policy evaluations');
    }

    logger.verboseLog(`Found ${statusPolicyEvaluations.length} status check policy evaluations`);

    const policyStatuses: StatusCheck[] = statusPolicyEvaluations.map((evaluation) => {
      const statusName = evaluation.statusName ?? 'Unknown';
      const { state, description } = mapPolicyStatus(evaluation.status);
      logger.verboseLog(`Policy ${statusName}: ${evaluation.status} -> ${state} (${description})`);
      return {
        state,
        description,
        context: { name: statusName, genre: 'pr-signoff' },
        creationDate: evaluation.startedDate || new Date().toISOString(),
      };
    });

    logger.verboseLog(`Returning ${policyStatuses.length} policy status entries from evaluations`);
    return policyStatuses;
  } catch (error: unknown) {
    logger.verboseLog(`Branch policy lookup failed: ${describeError(error)}, using fallback`);

    // Fallback: get all status checks and filter properly
    let allStatusChecks: Awaited<ReturnType<typeof parseAzureStatusList>>;
    try {
      allStatusChecks = await httpJson(
        `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/statuses?api-version=7.2-preview.2`,
        parseAzureStatusList,
        { headers },
      );
    } catch {
      logger.verboseLog('Fallback status check retrieval also failed');
      return [];
    }

    const currentCommit = isAzureDevOpsPipeline()
      ? readEnv().BUILD_SOURCEVERSION || 'unknown'
      : await getCurrentCommit(false, { verbose });

    logger.verboseLog(
      `Fallback: Retrieved ${allStatusChecks.length} status checks, filtering for current commit ${currentCommit.substring(0, 8)}`,
    );

    // Filter to current commit
    const currentShort = currentCommit.substring(0, 8).toLowerCase();
    const currentCommitStatuses = allStatusChecks.filter((status) => {
      if (!status.targetUrl) return false;
      const commitMatch = status.targetUrl.match(/\/commit\/([a-f0-9]+)/i);
      if (!commitMatch?.[1]) return false;
      return currentShort === commitMatch[1].substring(0, 8).toLowerCase();
    });

    // Deduplicate by context name, keeping latest
    const latestByContext = new Map<string, (typeof currentCommitStatuses)[number]>();
    for (const status of currentCommitStatuses) {
      const contextName = status.contextName || 'Unknown';
      const existing = latestByContext.get(contextName);
      if (!existing || new Date(status.creationDate ?? 0) > new Date(existing.creationDate ?? 0)) {
        latestByContext.set(contextName, status);
      }
    }

    const uniqueStatuses: StatusCheck[] = Array.from(latestByContext.values()).map((s) => ({
      state: s.state ?? 'pending',
      description: s.description ?? '',
      context: { name: s.contextName ?? 'Unknown', genre: 'pr-signoff' },
      creationDate: s.creationDate ?? new Date().toISOString(),
      targetUrl: s.targetUrl,
    }));

    logger.verboseLog(
      `Fallback: Found ${currentCommitStatuses.length} for current commit, ${uniqueStatuses.length} unique contexts`,
    );
    return uniqueStatuses;
  }
}

export async function createCommitStatusCheck(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  commitHash: string,
  message: string,
  contextName: string,
  prId?: number,
): Promise<Response> {
  const { organization, project } = ctx;
  const statusResponse = await fetch(
    `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/commits/${commitHash}/statuses?api-version=7.2-preview.2`,
    {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify({
        state: 'succeeded',
        description: message,
        context: { name: contextName, genre: STATUS_CHECK_GENRE },
        targetUrl: prId
          ? `https://dev.azure.com/${organization}/${project}/_git/${repo.name}/pullrequest/${prId}`
          : `https://dev.azure.com/${organization}/${project}/_git/${repo.name}/commit/${commitHash}`,
      }),
    },
  );

  if (!statusResponse.ok) {
    throw new Error(`Failed to create status check: ${statusResponse.statusText}`);
  }

  return statusResponse;
}

export async function createPrStatusCheck(
  ctx: AzureContext,
  token: string,
  repo: Repository,
  prId: number,
  message: string,
  commitHash: string,
  contextName: string,
): Promise<Response> {
  const { organization, project, logger } = ctx;
  try {
    // Find the iteration that matches our current commit
    const iterations = await httpJson(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/iterations?api-version=7.2-preview.2`,
      parseAzureIterations,
      { headers: authHeaders(token) },
    );
    logger.verboseLog(`Found ${iterations.length} iterations in the PR`);

    const commit = commitHash.toLowerCase();
    let currentIteration = iterations.find((iteration) => {
      const iterationCommitId = (iteration.commitId ?? '').toLowerCase();
      return (
        iterationCommitId === commit ||
        iterationCommitId.startsWith(commit) ||
        commit.startsWith(iterationCommitId)
      );
    });

    if (!currentIteration) {
      logger.verboseLog(
        `Could not find iteration for current commit ${commitHash}. Using latest iteration.`,
      );
      currentIteration = iterations[iterations.length - 1];
    }

    if (!currentIteration) {
      throw new Error('No PR iterations found to attach the status to.');
    }

    const iterationId = currentIteration.id;
    logger.verboseLog(`Using iteration ID: ${iterationId} that matches commit ${commitHash}`);

    const prStatusResponse = await fetch(
      `https://dev.azure.com/${organization}/${project}/_apis/git/repositories/${repo.id}/pullRequests/${prId}/statuses?api-version=7.2-preview.2`,
      {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({
          state: 'succeeded',
          description: message,
          context: { name: contextName, genre: STATUS_CHECK_GENRE },
          iterationId,
        }),
      },
    );

    if (!prStatusResponse.ok) {
      const errorText = await prStatusResponse.text();
      throw new Error(
        `Failed to create pull request status check - Status: ${prStatusResponse.status}, Error: ${errorText}`,
      );
    }

    return prStatusResponse;
  } catch (error: unknown) {
    throw new Error(`Failed to create pull request status check: ${describeError(error)}`, {
      cause: error,
    });
  }
}
