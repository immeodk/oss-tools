import {
  validateBasicGitState,
  fetchLatestChanges,
  getCurrentBranch as getCurrentBranchFromGit,
  getCurrentCommit as getCurrentCommitFromGit,
  checkBranchUpToDate,
  executeGitCommand,
} from '@immeodk/git-utils';
import { createLogger, Logger } from './logger.js';
import { describeError } from './error-message.js';

export interface GitOperationsOptions {
  verbose?: boolean;
}

export interface GitOperations {
  readonly logger: Logger;
  validateGitState(): Promise<void>;
  validateBranchAgainstDefault(): Promise<void>;
  checkGitStateWithWarnings(): Promise<string[]>;
  getGitUsername(): Promise<string>;
  getRepositoryName(): Promise<string>;
  getCurrentBranch(): Promise<string>;
  getCurrentCommit(): Promise<string>;
  getDefaultBranch(): Promise<string>;
}

/**
 * Detect the repository's default branch.
 *
 * Resolution order:
 *   1. `origin/HEAD` symbolic ref (set by `git remote set-head` or `git clone`)
 *   2. Common candidates on origin: `main`, then `master`
 *   3. Same candidates locally
 *
 * Throws with an actionable hint if none resolves.
 */
async function resolveDefaultBranch(verbose: boolean): Promise<string> {
  try {
    const ref = await executeGitCommand(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
      verbose,
    });
    if (ref?.startsWith('origin/')) {
      return ref.substring('origin/'.length);
    }
  } catch {
    // origin/HEAD not set — fall through to candidates
  }

  const candidates = ['main', 'master'];

  for (const candidate of candidates) {
    try {
      await executeGitCommand(
        ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${candidate}`],
        { verbose },
      );
      return candidate;
    } catch {
      // try next candidate
    }
  }

  for (const candidate of candidates) {
    try {
      await executeGitCommand(['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`], {
        verbose,
      });
      return candidate;
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    'Could not determine the repository default branch. ' +
      'Set it explicitly with `git remote set-head origin --auto` or pass the branch flag.',
  );
}

/**
 * Create a git operations service
 */
export function createGitOperations(options: GitOperationsOptions = {}): GitOperations {
  const logger = createLogger(options.verbose || false);
  const verbose = options.verbose || false;

  return {
    logger,

    /**
     * Validate git state for signoff - strict validation required
     */
    async validateGitState(): Promise<void> {
      logger.verboseLog('Validating git state for signoff (strict mode)');

      // Strict validation - no dirty working directory allowed
      await validateBasicGitState({
        allowDirty: false,
        verbose,
      });

      // Fetch latest changes
      await fetchLatestChanges('origin', { verbose });

      // Always check if branch is up-to-date with remote
      const currentBranch = await getCurrentBranchFromGit({ verbose });
      await checkBranchUpToDate(currentBranch, 'origin', { verbose });
    },

    /**
     * Validate branch is up-to-date with the repository's default branch
     * (typically `main` or `master`, detected from the remote).
     */
    async validateBranchAgainstDefault(): Promise<void> {
      const defaultBranch = await resolveDefaultBranch(verbose);
      const currentBranch = await getCurrentBranchFromGit({ verbose });

      // Skip validation if we're already on the default branch
      if (currentBranch === defaultBranch) {
        return;
      }

      // Fetch latest changes for the default branch
      await executeGitCommand(['fetch', 'origin', `${defaultBranch}:${defaultBranch}`], {
        verbose,
      });

      try {
        const mergeBase = await executeGitCommand(['merge-base', 'HEAD', defaultBranch], {
          verbose,
        });
        const defaultBranchCommit = await executeGitCommand(['rev-parse', defaultBranch], {
          verbose,
        });

        // If merge base is not the same as the default branch's HEAD,
        // the default branch has new commits not in this branch.
        if (mergeBase !== defaultBranchCommit) {
          throw new Error(
            `Your branch is not up-to-date with ${defaultBranch}. ` +
              `Please merge the latest changes from ${defaultBranch} into your branch first.`,
          );
        }
      } catch (error: unknown) {
        const message = describeError(error);
        if (message.includes('not up-to-date with')) {
          throw error;
        }
        throw new Error(`Failed to validate branch against ${defaultBranch}: ${message}`, {
          cause: error,
        });
      }
    },

    /**
     * Get the repository's default branch (main, master, or whatever origin/HEAD points to).
     */
    async getDefaultBranch(): Promise<string> {
      return resolveDefaultBranch(verbose);
    },

    /**
     * Get git username
     */
    async getGitUsername(): Promise<string> {
      try {
        const result = await executeGitCommand(['config', 'user.name'], { verbose });
        return result || 'unknown user';
      } catch {
        return 'unknown user';
      }
    },

    /**
     * Get repository name from git remote URL
     */
    async getRepositoryName(): Promise<string> {
      try {
        const remoteUrl =
          (await executeGitCommand(['remote', 'get-url', 'origin'], { verbose })) || '';
        // Handle Azure DevOps URLs which have format: https://org@dev.azure.com/org/project/_git/repo
        const azureMatch = remoteUrl.match(/\/_git\/([^/]+)$/);
        if (azureMatch?.[1]) {
          return azureMatch[1];
        }
        // Fallback to standard git URL format
        const standardMatch = remoteUrl.match(/\/([^/]+)\.git$/);
        if (standardMatch?.[1]) {
          return standardMatch[1];
        }
        throw new Error('Could not determine repository name from git remote URL');
      } catch (error: unknown) {
        throw new Error(`Failed to get repository name: ${describeError(error)}`, { cause: error });
      }
    },

    /**
     * Get current branch name
     */
    async getCurrentBranch(): Promise<string> {
      return (await getCurrentBranchFromGit({ verbose })) || 'unknown';
    },

    /**
     * Get current commit hash
     */
    async getCurrentCommit(): Promise<string> {
      return (await getCurrentCommitFromGit(false, { verbose })) || 'unknown';
    },

    /**
     * Check git state and show warnings without failing
     */
    async checkGitStateWithWarnings(): Promise<string[]> {
      const warnings = [];

      try {
        // Check for uncommitted changes
        await validateBasicGitState({ allowDirty: false, verbose });
      } catch (error: unknown) {
        const message = describeError(error);
        if (message.includes('uncommitted changes') || message.includes('unstaged changes')) {
          warnings.push('⚠️  Working directory has uncommitted changes');
        }
      }

      try {
        // Check if branch is up-to-date with remote
        await fetchLatestChanges('origin', { verbose });
        const currentBranch = await getCurrentBranchFromGit({ verbose });
        await checkBranchUpToDate(currentBranch, 'origin', { verbose });
      } catch (error: unknown) {
        const message = describeError(error);
        if (message.includes('behind') || message.includes('outdated')) {
          warnings.push('⚠️  Branch is not up-to-date with remote');
        }
      }

      try {
        // Check if branch is up-to-date with the repository's default branch
        await this.validateBranchAgainstDefault();
      } catch (error: unknown) {
        const message = describeError(error);
        if (message.includes('not up-to-date with')) {
          warnings.push(`⚠️  ${message}`);
        }
      }

      return warnings;
    },
  };
}
