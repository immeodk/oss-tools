/**
 * zod schemas + parsers for the GitHub REST API response shapes this tool
 * consumes. Each parser narrows `unknown` to exactly the fields the client
 * reads; `.passthrough()` keeps unknown extra fields so we only assert what we
 * depend on. See the `runtime-safety` skill.
 *
 * Parsers throw `ZodError` on mismatch; `httpJson` wraps that with the request
 * context (cause chain preserved).
 */
import { z } from 'zod';
import type { components } from '@octokit/openapi-types';
import type { PullRequest } from '../platform/types.js';

/**
 * Compile-time conformance anchors against GitHub's official OpenAPI types.
 *
 * The zod schemas below do the *runtime* validation (types are erased at
 * runtime). These aliases add a *compile-time* check that every field our
 * parsers read actually exists on GitHub's published schema. They emit no
 * runtime code. If GitHub renames or removes a field, bumping
 * `@octokit/openapi-types` makes the corresponding line below fail to compile —
 * surfacing the drift here rather than at runtime in production.
 *
 * Keep these in sync with the fields referenced in the parsers in this file.
 */
type GhPull = components['schemas']['pull-request'];
type GhPullSimple = components['schemas']['pull-request-simple'];
type GhRepo = components['schemas']['full-repository'];
type GhCombinedStatus = components['schemas']['combined-commit-status'];
type GhSimpleStatus = components['schemas']['simple-commit-status'];
type GhDiffEntry = components['schemas']['diff-entry'];
type GhRuleset = components['schemas']['repository-ruleset'];

// Each property references a field path our parsers depend on; the value type
// is irrelevant — only that the path resolves on the official schema. Exported
// so the strict `noUnusedLocals` check treats it as used (type-only, no runtime).
export type GitHubFieldConformance = {
  pullNumber: GhPull['number'];
  pullTitle: GhPull['title'];
  pullBody: GhPull['body'];
  pullState: GhPull['state'];
  pullHtmlUrl: GhPull['html_url'];
  pullDraft: GhPull['draft'];
  pullCreatedAt: GhPull['created_at'];
  pullClosedAt: GhPull['closed_at'];
  pullHeadRef: GhPull['head']['ref'];
  pullHeadSha: GhPull['head']['sha'];
  pullBaseRef: GhPull['base']['ref'];
  pullUserLogin: NonNullable<GhPull['user']>['login'];
  pullSimpleNumber: GhPullSimple['number'];
  repoName: GhRepo['name'];
  repoFullName: GhRepo['full_name'];
  combinedStatuses: GhCombinedStatus['statuses'];
  statusState: GhSimpleStatus['state'];
  statusDescription: GhSimpleStatus['description'];
  statusContext: GhSimpleStatus['context'];
  statusTargetUrl: GhSimpleStatus['target_url'];
  statusCreatedAt: GhSimpleStatus['created_at'];
  fileFilename: GhDiffEntry['filename'];
  rulesetId: GhRuleset['id'];
  rulesetName: GhRuleset['name'];
};

const RepoResponseSchema = z
  .object({
    name: z.string(),
    full_name: z.string().optional(),
  })
  .passthrough();

export interface GitHubRepoResponse {
  name: string;
  full_name: string | undefined;
}

export function parseGitHubRepoResponse(raw: unknown): GitHubRepoResponse {
  const r = RepoResponseSchema.parse(raw);
  return { name: r.name, full_name: r.full_name };
}

const PullListSchema = z.array(z.object({ number: z.number() }).passthrough());

export interface GitHubPullRef {
  number: number;
}

export function parseGitHubPullList(raw: unknown): GitHubPullRef[] {
  return PullListSchema.parse(raw).map((p) => ({ number: p.number }));
}

const PullDetailSchema = z
  .object({
    number: z.number(),
    title: z.string().nullish(),
    body: z.string().nullish(),
    state: z.string().nullish(),
    html_url: z.string().nullish(),
    draft: z.boolean().nullish(),
    created_at: z.string().nullish(),
    closed_at: z.string().nullish(),
    head: z
      .object({ sha: z.string().optional(), ref: z.string().optional() })
      .passthrough()
      .optional(),
    base: z.object({ ref: z.string().optional() }).passthrough().optional(),
    user: z.object({ login: z.string().optional() }).passthrough().nullish(),
  })
  .passthrough();

/** Map a validated GitHub PR payload onto the neutral PullRequest shape. */
function toNeutralPull(r: z.infer<typeof PullDetailSchema>): PullRequest {
  return {
    pullRequestId: r.number,
    title: r.title ?? undefined,
    description: r.body ?? undefined,
    status: r.state ?? undefined,
    url: r.html_url ?? undefined,
    sourceRefName: r.head?.ref,
    targetRefName: r.base?.ref,
    creationDate: r.created_at ?? undefined,
    closedDate: r.closed_at ?? undefined,
    isDraft: r.draft ?? undefined,
    createdBy: r.user?.login ? { displayName: r.user.login, uniqueName: r.user.login } : undefined,
  };
}

export interface GitHubPullDetail {
  pullRequest: PullRequest;
  headSha: string | undefined;
}

export function parseGitHubPullDetail(raw: unknown): GitHubPullDetail {
  const r = PullDetailSchema.parse(raw);
  return { pullRequest: toNeutralPull(r), headSha: r.head?.sha };
}

export function parseGitHubCreatedPull(raw: unknown): PullRequest {
  return toNeutralPull(PullDetailSchema.parse(raw));
}

const CombinedStatusSchema = z
  .object({
    statuses: z
      .array(
        z
          .object({
            state: z.string(),
            description: z.string().nullish(),
            context: z.string().nullish(),
            target_url: z.string().nullish(),
            created_at: z.string().nullish(),
          })
          .passthrough(),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export interface GitHubStatus {
  state: string;
  description: string;
  context: string;
  target_url: string | undefined;
  created_at: string | undefined;
}

export function parseGitHubCombinedStatus(raw: unknown): GitHubStatus[] {
  const r = CombinedStatusSchema.parse(raw);
  return r.statuses.map((s) => ({
    state: s.state,
    description: s.description ?? '',
    context: s.context ?? 'unknown',
    target_url: s.target_url ?? undefined,
    created_at: s.created_at ?? undefined,
  }));
}

const FilesListSchema = z.array(z.object({ filename: z.string().optional() }).passthrough());

export function parseGitHubFilesList(raw: unknown): string[] {
  return FilesListSchema.parse(raw)
    .map((f) => f.filename)
    .filter((name): name is string => Boolean(name));
}

const LabelsListSchema = z.array(
  z.object({ name: z.string(), node_id: z.string().optional() }).passthrough(),
);

export interface GitHubLabel {
  name: string;
  nodeId: string | undefined;
}

export function parseGitHubLabelsList(raw: unknown): GitHubLabel[] {
  return LabelsListSchema.parse(raw).map((l) => ({ name: l.name, nodeId: l.node_id }));
}

const RulesetSchema = z.object({ id: z.number(), name: z.string().optional() }).passthrough();
const RulesetListSchema = z.array(z.object({ id: z.number(), name: z.string() }).passthrough());

export interface GitHubRuleset {
  id: number;
  name: string;
}

export function parseGitHubRulesetList(raw: unknown): GitHubRuleset[] {
  return RulesetListSchema.parse(raw).map((r) => ({ id: r.id, name: r.name }));
}

export function parseGitHubRuleset(raw: unknown): GitHubRuleset {
  const r = RulesetSchema.parse(raw);
  return { id: r.id, name: r.name ?? '' };
}
