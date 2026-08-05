/**
 * Platform-neutral domain types.
 *
 * These shapes intentionally avoid platform-specific fields. Each adapter
 * normalises its platform's response into these neutral types, so consumers
 * never read platform-specific field names.
 */

import type { Logger } from '../core/logger.js';

export type { Logger };

export interface Repository {
  /**
   * Stable identifier for the repository.
   * - Azure DevOps: repo GUID
   * - GitHub: `owner/repo` slug (or `node_id` when available)
   */
  id: string;

  /**
   * Display name of the repository.
   */
  name: string;
}

export interface PullRequestUser {
  displayName?: string;
  uniqueName?: string;
}

/**
 * Platform-neutral pull request. Both adapters normalise their platform's
 * field names into this shape (e.g. GitHub `html_url` → `url`, `state` →
 * `status`, `user.login` → `createdBy.displayName`) so consumers never read
 * platform-specific fields.
 */
export interface PullRequest {
  pullRequestId: number;
  title?: string;
  description?: string;
  status?: string;
  url?: string;
  sourceRefName?: string;
  targetRefName?: string;
  creationDate?: string;
  closedDate?: string;
  createdBy?: PullRequestUser;
  isDraft?: boolean;
  labels?: PullRequestLabel[];
}

export interface StatusCheck {
  state: string;
  description: string;
  context: {
    name: string;
    genre: string;
  };
  creationDate: string;
  targetUrl?: string;
}

export interface PullRequestCreateOptions {
  title: string;
  description?: string;
  sourceBranch: string;
  targetBranch: string;
  isDraft?: boolean;
  autoComplete?: boolean;
  labels?: string[];
}

export interface PullRequestLabel {
  id?: string;
  name: string;
  active?: boolean;
}

export interface PolicyCreationResult {
  action: 'created' | 'updated';
  policyId: number;
  repository: string;
  targetBranch: string;
  required: boolean;
}
