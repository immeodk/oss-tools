import type {
  Logger,
  Repository,
  PullRequest,
  StatusCheck,
  PullRequestCreateOptions,
  PullRequestLabel,
  PolicyCreationResult,
} from './types.js';

/**
 * Platform-agnostic adapter for PR / status-check / repo operations.
 *
 * Both the Azure DevOps and GitHub implementations conform to this interface.
 * Callers (`signoff-orchestrator`, command handlers) hold a `PlatformAdapter`
 * reference and never reach into platform-specific APIs directly.
 */
export interface PlatformAdapter {
  readonly logger: Logger;

  /**
   * Whether the platform has a commit-level status that is a *distinct* object
   * from the PR-level status check.
   * - Azure DevOps: `true` — a commit status and a PR-iteration status are
   *   separate, so both are worth creating.
   * - GitHub: `false` — the PR check *is* the commit status on the head SHA,
   *   so `createPrStatusCheck` already covers it and a separate
   *   `createCommitStatusCheck` would be a redundant duplicate POST.
   *
   * The orchestrator uses this to avoid posting the same status twice.
   */
  readonly hasSeparateCommitStatus: boolean;

  /**
   * Return an auth token for the platform's REST API.
   * - Azure DevOps: bearer token via `az account get-access-token`
   * - GitHub: PAT via `gh auth token` or env (`$GITHUB_TOKEN`/`$GH_TOKEN`)
   */
  getToken(): Promise<string>;

  /**
   * Look up a repository by name.
   */
  getRepositoryInfo(token: string, repoName: string): Promise<Repository>;

  /**
   * Find the active PR for the current source branch.
   * Returns `null` when no open PR exists.
   */
  findPullRequestId(token: string, repo: Repository): Promise<number | null>;

  /**
   * Get full PR details (with `labels` populated when available).
   */
  getPrDetails(token: string, repo: Repository, prId: number): Promise<PullRequest>;

  /**
   * Get the platform-specific status checks for a PR, normalised to the
   * neutral StatusCheck shape.
   */
  getStatusChecks(token: string, repo: Repository, prId: number): Promise<StatusCheck[]>;

  /**
   * Create a status check on a commit.
   */
  createCommitStatusCheck(
    token: string,
    repo: Repository,
    commitHash: string,
    message: string,
    contextName: string,
    prId?: number,
  ): Promise<Response>;

  /**
   * Create a status check at the PR-iteration level (Azure DevOps semantics).
   * On platforms without that concept (GitHub), this collapses to a
   * commit-level status on the PR head SHA.
   */
  createPrStatusCheck(
    token: string,
    repo: Repository,
    prId: number,
    message: string,
    commitHash: string,
    contextName: string,
  ): Promise<Response>;

  /**
   * Return file paths changed in the PR (used for folder-scope filtering).
   */
  getPrChanges(token: string, repo: Repository, prId: number): Promise<string[]>;

  /**
   * Create a new pull request.
   */
  createPullRequest(
    token: string,
    repo: Repository,
    options: PullRequestCreateOptions,
  ): Promise<PullRequest>;

  /**
   * Replace the full set of labels on a PR with the provided list.
   */
  updatePullRequestLabels(
    token: string,
    repo: Repository,
    prId: number,
    labels: PullRequestLabel[],
  ): Promise<PullRequest>;

  /**
   * Get the current set of labels on a PR.
   */
  getPullRequestLabels(token: string, repo: Repository, prId: number): Promise<PullRequestLabel[]>;

  /**
   * True when the process is running inside the platform's own CI runner.
   * The orchestrator uses this to skip local-only git validations.
   */
  isRunningInCi(): boolean;
}

/**
 * Platform-agnostic branch policy adapter.
 *
 * - Azure DevOps: maps to a branch policy of type Status check.
 * - GitHub: maps to a repository ruleset with a required status check.
 */
export interface PolicyAdapter {
  readonly logger: Logger;

  setupPolicy(
    token: string,
    repo: Repository,
    contextName: string,
    options: {
      targetBranch: string;
      required?: boolean;
      scopedFolder?: string;
    },
  ): Promise<PolicyCreationResult>;
}
