/**
 * zod schemas + parsers for the Azure DevOps REST API and `az` CLI output
 * shapes this tool consumes. `.passthrough()` keeps unknown extra fields so we
 * only assert what we read. See the `runtime-safety` skill.
 */
import { z } from 'zod';
import type { PullRequest } from '../platform/types.js';

// --- az CLI JSON output ---

const AzAccountShowSchema = z.object({ tenantId: z.string() }).passthrough();
export function parseAzAccountShow(raw: unknown): { tenantId: string } {
  return { tenantId: AzAccountShowSchema.parse(raw).tenantId };
}

const AzAccessTokenSchema = z.object({ accessToken: z.string() }).passthrough();
export function parseAzAccessToken(raw: unknown): { accessToken: string } {
  return { accessToken: AzAccessTokenSchema.parse(raw).accessToken };
}

// --- Repositories ---

const RepoSchema = z.object({ id: z.string(), name: z.string() }).passthrough();
export interface AzureRepo {
  id: string;
  name: string;
}
export function parseAzureRepo(raw: unknown): AzureRepo {
  const r = RepoSchema.parse(raw);
  return { id: r.id, name: r.name };
}

// --- Pull requests ---

const PullRequestListSchema = z
  .object({ value: z.array(z.object({ pullRequestId: z.number() }).passthrough()).default([]) })
  .passthrough();
export function parseAzurePullRequestList(raw: unknown): { pullRequestId: number }[] {
  return PullRequestListSchema.parse(raw).value.map((p) => ({ pullRequestId: p.pullRequestId }));
}

const PullRequestSchema = z
  .object({
    pullRequestId: z.number(),
    title: z.string().nullish(),
    description: z.string().nullish(),
    status: z.string().nullish(),
    sourceRefName: z.string().nullish(),
    targetRefName: z.string().nullish(),
    creationDate: z.string().nullish(),
    closedDate: z.string().nullish(),
    isDraft: z.boolean().nullish(),
    createdBy: z
      .object({ displayName: z.string().optional(), uniqueName: z.string().optional() })
      .passthrough()
      .nullish(),
  })
  .passthrough();

/** Map a validated Azure DevOps PR payload onto the neutral PullRequest shape. */
export function parseAzurePullRequest(raw: unknown): PullRequest {
  const r = PullRequestSchema.parse(raw);
  return {
    pullRequestId: r.pullRequestId,
    title: r.title ?? undefined,
    description: r.description ?? undefined,
    status: r.status ?? undefined,
    sourceRefName: r.sourceRefName ?? undefined,
    targetRefName: r.targetRefName ?? undefined,
    creationDate: r.creationDate ?? undefined,
    closedDate: r.closedDate ?? undefined,
    isDraft: r.isDraft ?? undefined,
    createdBy: r.createdBy
      ? { displayName: r.createdBy.displayName, uniqueName: r.createdBy.uniqueName }
      : undefined,
  };
}

// --- Project ---

const ProjectSchema = z.object({ id: z.string() }).passthrough();
export function parseAzureProject(raw: unknown): { id: string } {
  return { id: ProjectSchema.parse(raw).id };
}

// --- Policy evaluations ---

const PolicyEvaluationsSchema = z
  .object({
    count: z.number().optional(),
    value: z
      .array(
        z
          .object({
            configuration: z
              .object({
                type: z.object({ displayName: z.string().nullish() }).passthrough().optional(),
                settings: z.object({ statusName: z.string().nullish() }).passthrough().optional(),
              })
              .passthrough()
              .optional(),
            status: z.string().nullish(),
            startedDate: z.string().nullish(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface AzurePolicyEvaluation {
  statusName: string | undefined;
  displayName: string | undefined;
  status: string | undefined;
  startedDate: string | undefined;
}
export function parseAzurePolicyEvaluations(raw: unknown): AzurePolicyEvaluation[] {
  return PolicyEvaluationsSchema.parse(raw).value.map((e) => ({
    statusName: e.configuration?.settings?.statusName ?? undefined,
    displayName: e.configuration?.type?.displayName ?? undefined,
    status: e.status ?? undefined,
    startedDate: e.startedDate ?? undefined,
  }));
}

// --- Commit / PR statuses list (fallback path) ---

const StatusListSchema = z
  .object({
    value: z
      .array(
        z
          .object({
            state: z.string().nullish(),
            description: z.string().nullish(),
            targetUrl: z.string().nullish(),
            creationDate: z.string().nullish(),
            context: z.object({ name: z.string().nullish() }).passthrough().nullish(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface AzureRawStatus {
  state: string | undefined;
  description: string | undefined;
  targetUrl: string | undefined;
  creationDate: string | undefined;
  contextName: string | undefined;
}
export function parseAzureStatusList(raw: unknown): AzureRawStatus[] {
  return StatusListSchema.parse(raw).value.map((s) => ({
    state: s.state ?? undefined,
    description: s.description ?? undefined,
    targetUrl: s.targetUrl ?? undefined,
    creationDate: s.creationDate ?? undefined,
    contextName: s.context?.name ?? undefined,
  }));
}

// --- PR iterations ---

const IterationsSchema = z
  .object({
    count: z.number().optional(),
    value: z
      .array(
        z
          .object({
            id: z.number(),
            sourceRefCommit: z.object({ commitId: z.string() }).passthrough().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface AzureIteration {
  id: number;
  commitId: string | undefined;
}
export function parseAzureIterations(raw: unknown): AzureIteration[] {
  return IterationsSchema.parse(raw).value.map((it) => ({
    id: it.id,
    commitId: it.sourceRefCommit?.commitId,
  }));
}

// --- PR iteration changes ---

const ChangesSchema = z
  .object({
    changeEntries: z
      .array(
        z
          .object({ item: z.object({ path: z.string().nullish() }).passthrough().nullish() })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export function parseAzureChanges(raw: unknown): string[] {
  return ChangesSchema.parse(raw)
    .changeEntries.map((c) => c.item?.path ?? '')
    .map((p) => (p.startsWith('/') ? p.slice(1) : p))
    .filter((p) => p.length > 0);
}

// --- Connection data (current user) ---

const ConnectionDataSchema = z
  .object({ authenticatedUser: z.object({ id: z.string() }).passthrough() })
  .passthrough();
export function parseAzureConnectionData(raw: unknown): { userId: string } {
  return { userId: ConnectionDataSchema.parse(raw).authenticatedUser.id };
}

// --- Labels ---

const LabelsListSchema = z
  .object({
    value: z
      .array(
        z
          .object({ id: z.string().optional(), name: z.string(), active: z.boolean().optional() })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface AzureLabel {
  id: string | undefined;
  name: string;
  active: boolean;
}
export function parseAzureLabelsList(raw: unknown): AzureLabel[] {
  return LabelsListSchema.parse(raw).value.map((l) => ({
    id: l.id,
    name: l.name,
    active: l.active !== false,
  }));
}

// --- Branch policy configurations ---

const BranchPoliciesSchema = z
  .object({
    value: z
      .array(
        z
          .object({
            id: z.number(),
            type: z.object({ displayName: z.string().nullish() }).passthrough().optional(),
            settings: z.object({ statusName: z.string().nullish() }).passthrough().optional(),
            isEnabled: z.boolean().optional(),
            isBlocking: z.boolean().optional(),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface AzureBranchPolicy {
  id: number;
  type: { displayName: string };
  settings: { statusName?: string };
  isEnabled: boolean;
  isBlocking: boolean;
}

export function parseAzureBranchPolicies(raw: unknown): AzureBranchPolicy[] {
  return BranchPoliciesSchema.parse(raw).value.map((p) => ({
    id: p.id,
    type: { displayName: p.type?.displayName ?? '' },
    settings: { statusName: p.settings?.statusName ?? undefined },
    isEnabled: p.isEnabled ?? true,
    isBlocking: p.isBlocking ?? false,
  }));
}

// --- Created policy / build policy ---

const PolicyConfigSchema = z.object({ id: z.number() }).passthrough();
export function parseAzurePolicyConfig(raw: unknown): { id: number } {
  return { id: PolicyConfigSchema.parse(raw).id };
}
