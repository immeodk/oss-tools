import type { Logger } from '../../core/logger.js';

export const GITHUB_API = 'https://api.github.com';

/**
 * Shared dependencies passed to each GitHub operation function.
 *
 * Mirrors the Azure DevOps `AzureContext`: operations are plain functions
 * taking this context as their first argument, and `createGitHubClient`
 * composes them into a `PlatformAdapter`. GitHub needs no command executor or
 * config block — auth is resolved via `gh`/env in `github-auth`.
 */
export interface GitHubContext {
  owner: string;
  repo: string;
  logger: Logger;
  verbose: boolean;
}

/** Headers for a GET/JSON-reading request. */
export function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/** Headers for a POST/PUT request with a JSON body. */
export function jsonHeaders(token: string): Record<string, string> {
  return { ...authHeaders(token), 'Content-Type': 'application/json' };
}
