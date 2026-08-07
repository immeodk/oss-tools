/**
 * Parse a git remote origin URL into `{ owner, repo }` for GitHub repos.
 *
 * Handles:
 *   - HTTPS:  https://github.com/owner/repo(.git)?
 *   - SSH:    git@github.com:owner/repo(.git)?
 *
 * Returns `null` for non-GitHub remotes, malformed input, or anything we
 * can't unambiguously parse. Callers fall back to explicit config in that
 * case.
 */
export function parseOriginUrlToOwnerRepo(
  remoteUrl: string,
): { owner: string; repo: string } | null {
  if (!remoteUrl) return null;

  // SSH:  git@github.com:owner/repo(.git)?
  const sshMatch = remoteUrl.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch?.[1] && sshMatch[2]) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  // HTTPS: https://github.com/owner/repo(.git)?
  const httpsMatch = remoteUrl.match(
    /^https?:\/\/(?:[^@]+@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?$/,
  );
  if (httpsMatch?.[1] && httpsMatch[2]) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  return null;
}
