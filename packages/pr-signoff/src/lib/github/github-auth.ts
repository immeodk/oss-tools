import { execa } from 'execa';
import { readEnv, isGitHubActions } from '../config/env.js';
import { AuthError } from '../errors.js';

export interface GitHubAuthOptions {
  verbose?: boolean;
}

/**
 * Resolve a GitHub token for REST API access.
 *
 * Resolution order:
 *   1. `$GITHUB_TOKEN` — but only when running inside GitHub Actions
 *      (`$GITHUB_ACTIONS === 'true'`). Outside Actions, the variable is
 *      ignored because it usually carries unrelated credentials.
 *   2. `$GH_TOKEN` — explicit override for CI scripts and developer setups.
 *   3. `gh auth token` — the GitHub CLI's stored credential, mirroring how
 *      the AzDO adapter shells out to `az account get-access-token`.
 *
 * Throws with actionable guidance when none resolves.
 */
export async function getGitHubToken(_options: GitHubAuthOptions = {}): Promise<string> {
  const env = readEnv();

  if (isGitHubActions() && env.GITHUB_TOKEN) {
    return env.GITHUB_TOKEN;
  }

  if (env.GH_TOKEN) {
    return env.GH_TOKEN;
  }

  try {
    const result = await execa('gh', ['auth', 'token']);
    const token = (result.stdout ?? '').trim();
    if (token) {
      return token;
    }
  } catch {
    // fall through to the error below
  }

  throw new AuthError(
    'Could not resolve a GitHub token. ' +
      'Run `gh auth login`, set $GH_TOKEN, or provide $GITHUB_TOKEN when running in GitHub Actions.',
  );
}
