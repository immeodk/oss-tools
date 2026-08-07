import { executeGitCommand } from '@immeodk/git-utils';
import { parseOriginUrlToOwnerRepo } from './origin-url.js';
import { describeError } from '../core/error-message.js';
import { ConfigError } from '../errors.js';
import type { GitHubConfig } from '../config/config.js';

export interface ResolveGitHubOwnerRepoOptions {
  verbose?: boolean;
}

/**
 * Resolve the GitHub `owner` + `repo` pair for the active config.
 *
 * Resolution order:
 *   1. Explicit `config.github.repo` — owner+repo come straight from config.
 *   2. Auto-detect from `git remote get-url origin` — parses the URL for the
 *      `owner/repo` slug and verifies the owner matches `config.github.owner`.
 *
 * Throws if auto-detect is needed but the remote isn't a GitHub URL or its
 * owner doesn't match the config.
 */
export async function resolveGitHubOwnerRepo(
  githubConfig: GitHubConfig,
  options: ResolveGitHubOwnerRepoOptions = {},
): Promise<{ owner: string; repo: string }> {
  if (githubConfig.repo) {
    return { owner: githubConfig.owner, repo: githubConfig.repo };
  }

  let remoteUrl: string;
  try {
    remoteUrl = await executeGitCommand(['remote', 'get-url', 'origin'], {
      verbose: options.verbose,
    });
  } catch (error: unknown) {
    throw new ConfigError(
      `github.repo is not set and reading the git remote failed: ${describeError(error)}. ` +
        'Set github.repo explicitly in pr-signoff.yaml or run from a repo with an origin remote.',
      undefined,
      { cause: error },
    );
  }

  const parsed = parseOriginUrlToOwnerRepo(remoteUrl);
  if (!parsed) {
    throw new ConfigError(
      `github.repo is not set and the origin remote '${remoteUrl}' is not a GitHub URL. ` +
        'Set github.repo explicitly in pr-signoff.yaml.',
    );
  }

  if (parsed.owner !== githubConfig.owner) {
    throw new ConfigError(
      `github.owner in config is '${githubConfig.owner}' but origin remote points to '${parsed.owner}/${parsed.repo}'. ` +
        'Set github.repo explicitly, or fix the owner mismatch.',
    );
  }

  return { owner: githubConfig.owner, repo: parsed.repo };
}
