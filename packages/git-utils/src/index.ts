import { execa } from 'execa';

/**
 * Git validation utilities for platform engineering tools
 * Contains common git operations that work with any git repository
 */

export interface GitUtilsOptions {
  verbose?: boolean;
}

export interface GitValidationOptions extends GitUtilsOptions {
  allowDirty?: boolean;
  allowOutdated?: boolean;
  remote?: string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function hasExitCode(error: unknown, code: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'exitCode' in error &&
    (error as { exitCode: unknown }).exitCode === code
  );
}

/**
 * Execute git command with proper error handling
 */
export async function executeGitCommand(
  args: string[],
  options: GitUtilsOptions = {},
): Promise<string> {
  const { verbose = false } = options;

  if (verbose) {
    console.log(`[GIT] Executing: git ${args.join(' ')}`);
  }

  try {
    const result = await execa('git', args);
    const output = result.stdout?.trim() ?? '';

    if (verbose && output) {
      console.log(`[GIT] Output: ${output}`);
    }

    return output;
  } catch (error: unknown) {
    if (verbose) {
      console.log(`[GIT] Command failed: ${getErrorMessage(error)}`);
    }
    throw error;
  }
}

/**
 * Check for unstaged changes in the working directory
 * @param options - Options object
 * @throws {Error} If unstaged changes are found
 */
export async function checkUnstagedChanges(options: GitUtilsOptions = {}): Promise<void> {
  try {
    await executeGitCommand(['diff', '--exit-code'], options);
  } catch (error: unknown) {
    if (hasExitCode(error, 1)) {
      throw new Error('You have unstaged changes. Please commit or stash them first.', {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Check for uncommitted (staged) changes
 * @param options - Options object
 * @throws {Error} If uncommitted changes are found
 */
export async function checkUncommittedChanges(options: GitUtilsOptions = {}): Promise<void> {
  try {
    await executeGitCommand(['diff', '--cached', '--exit-code'], options);
  } catch (error: unknown) {
    if (hasExitCode(error, 1)) {
      throw new Error('You have uncommitted changes. Please commit or stash them first.', {
        cause: error,
      });
    }
    throw error;
  }
}

/**
 * Check for untracked files in the working directory
 * @param options - Options object
 * @throws {Error} If untracked files are found
 */
export async function checkUntrackedFiles(options: GitUtilsOptions = {}): Promise<void> {
  const untrackedFiles = await executeGitCommand(
    ['ls-files', '--others', '--exclude-standard'],
    options,
  );

  if (untrackedFiles) {
    const fileList = untrackedFiles
      .split('\n')
      .filter((file) => file.trim())
      .join('\n  ');
    throw new Error(
      `You have untracked files. Please add, commit, or ignore them first:\n  ${fileList}`,
    );
  }
}

/**
 * Fetch latest changes from remote
 * @param remote - Remote name (default: 'origin')
 * @param options - Options object
 */
export async function fetchLatestChanges(
  remote: string = 'origin',
  options: GitUtilsOptions = {},
): Promise<void> {
  await executeGitCommand(['fetch', remote], options);
}

/**
 * Get current branch name
 * @param options - Options object
 * @returns Current branch name
 */
export async function getCurrentBranch(options: GitUtilsOptions = {}): Promise<string> {
  return await executeGitCommand(['rev-parse', '--abbrev-ref', 'HEAD'], options);
}

/**
 * Get current commit hash
 * @param short - Return short hash (default: false)
 * @param options - Options object
 * @returns Current commit hash
 */
export async function getCurrentCommit(
  short: boolean = false,
  options: GitUtilsOptions = {},
): Promise<string> {
  const args = short ? ['rev-parse', '--short', 'HEAD'] : ['rev-parse', 'HEAD'];
  return await executeGitCommand(args, options);
}

/**
 * Check if local branch is up-to-date with remote branch
 * @param branch - Branch name to check
 * @param remote - Remote name (default: 'origin')
 * @param options - Options object
 * @throws {Error} If branch is not up-to-date
 */
export async function checkBranchUpToDate(
  branch: string,
  remote: string = 'origin',
  options: GitUtilsOptions = {},
): Promise<void> {
  // Skip check in Azure DevOps context - there can't be unpushed commits in CI
  if (process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI || process.env.BUILD_BUILDID) {
    if (options.verbose) {
      console.log('Skipping branch up-to-date check in Azure DevOps pipeline context');
    }
    return;
  }

  const localCommit = await executeGitCommand(['rev-parse', 'HEAD'], options);

  let remoteCommit: string;
  try {
    remoteCommit = await executeGitCommand(['rev-parse', `${remote}/${branch}`], options);
  } catch (error: unknown) {
    throw new Error(
      `Remote branch '${remote}/${branch}' not found. Please push your branch to remote first.`,
      { cause: error },
    );
  }

  if (localCommit !== remoteCommit) {
    throw new Error(
      `Local branch is not up to date with ${remote}/${branch}.\n` +
        `Local commit:  ${localCommit.substring(0, 8)}\n` +
        `Remote commit: ${remoteCommit.substring(0, 8)}`,
    );
  }
}

/**
 * Validate basic git state (unstaged, uncommitted, and untracked changes)
 * @param options - Options object
 */
export async function validateBasicGitState(
  options: Partial<GitValidationOptions> = {},
): Promise<void> {
  const { allowDirty = false, verbose = false } = options;

  if (!allowDirty) {
    await checkUnstagedChanges({ verbose });
    await checkUncommittedChanges({ verbose });
    await checkUntrackedFiles({ verbose });
  }
}

/**
 * Validate git state including remote synchronization
 * @param options - Options object
 */
export async function validateGitState(options: GitValidationOptions = {}): Promise<void> {
  const { allowDirty = false, allowOutdated = false, remote = 'origin', verbose = false } = options;

  // Check for local changes
  await validateBasicGitState({ allowDirty, verbose });

  // Fetch latest changes
  await fetchLatestChanges(remote, { verbose });

  // Check if branch is up-to-date
  if (!allowOutdated) {
    const currentBranch = await getCurrentBranch({ verbose });
    await checkBranchUpToDate(currentBranch, remote, { verbose });
  }
}
