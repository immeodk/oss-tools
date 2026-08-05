/**
 * Comprehensive unit tests for git-utils library
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execa } from 'execa';

// Mock execa
vi.mock('execa');

// Import functions to test
import {
  executeGitCommand,
  checkUnstagedChanges,
  checkUncommittedChanges,
  checkUntrackedFiles,
  fetchLatestChanges,
  getCurrentBranch,
  getCurrentCommit,
  checkBranchUpToDate,
  validateBasicGitState,
  validateGitState,
} from '../index.js';

describe('Git Utils - Core Functions', () => {
  const mockExeca = vi.mocked(execa);

  beforeEach(() => {
    vi.clearAllMocks();

    // Remove Azure DevOps environment variables for testing
    delete process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
    delete process.env.BUILD_BUILDID;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('executeGitCommand', () => {
    it('should execute git command successfully', async () => {
      const mockResult = {
        stdout: 'main',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await executeGitCommand(['branch', '--show-current']);

      expect(mockExeca).toHaveBeenCalledWith('git', ['branch', '--show-current']);
      expect(result).toBe('main');
    });

    it('should handle empty stdout', async () => {
      const mockResult = {
        stdout: undefined,
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await executeGitCommand(['status', '--porcelain']);

      expect(result).toBe('');
    });

    it('should throw error when git command fails', async () => {
      const mockError = new Error('Git command failed');
      mockExeca.mockRejectedValueOnce(mockError);

      await expect(executeGitCommand(['invalid-command'])).rejects.toThrow('Git command failed');
    });

    it('should log output in verbose mode', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockResult = {
        stdout: 'test output',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await executeGitCommand(['status'], { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith('[GIT] Executing: git status');
      expect(consoleSpy).toHaveBeenCalledWith('[GIT] Output: test output');

      consoleSpy.mockRestore();
    });
  });

  describe('checkUnstagedChanges', () => {
    it('should pass when no unstaged changes exist', async () => {
      const mockResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await expect(checkUnstagedChanges()).resolves.not.toThrow();
      expect(mockExeca).toHaveBeenCalledWith('git', ['diff', '--exit-code']);
    });

    it('should throw error when unstaged changes exist', async () => {
      const mockError = { exitCode: 1 } as any;
      mockExeca.mockRejectedValueOnce(mockError);

      await expect(checkUnstagedChanges()).rejects.toThrow(
        'You have unstaged changes. Please commit or stash them first.',
      );
    });

    it('should re-throw non-exit-code-1 errors', async () => {
      const mockError = new Error('Git not found');
      mockExeca.mockRejectedValueOnce(mockError);

      await expect(checkUnstagedChanges()).rejects.toThrow('Git not found');
    });
  });

  describe('checkUncommittedChanges', () => {
    it('should pass when no uncommitted changes exist', async () => {
      const mockResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await expect(checkUncommittedChanges()).resolves.not.toThrow();
      expect(mockExeca).toHaveBeenCalledWith('git', ['diff', '--cached', '--exit-code']);
    });

    it('should throw error when uncommitted changes exist', async () => {
      const mockError = { exitCode: 1 } as any;
      mockExeca.mockRejectedValueOnce(mockError);

      await expect(checkUncommittedChanges()).rejects.toThrow(
        'You have uncommitted changes. Please commit or stash them first.',
      );
    });
  });

  describe('checkUntrackedFiles', () => {
    it('should pass when no untracked files exist', async () => {
      const mockResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await expect(checkUntrackedFiles()).resolves.not.toThrow();
      expect(mockExeca).toHaveBeenCalledWith('git', ['ls-files', '--others', '--exclude-standard']);
    });

    it('should throw error when untracked files exist', async () => {
      const mockResult = {
        stdout: 'file1.txt\nfile2.js\n',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await expect(checkUntrackedFiles()).rejects.toThrow(
        /You have untracked files.*file1\.txt.*file2\.js/s,
      );
    });

    it('should handle empty lines in untracked files output', async () => {
      const mockResult = {
        stdout: 'file1.txt\n\n\nfile2.js\n',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await expect(checkUntrackedFiles()).rejects.toThrow(/file1\.txt.*file2\.js/s);
    });
  });

  describe('fetchLatestChanges', () => {
    it('should fetch from origin by default', async () => {
      const mockResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await fetchLatestChanges();

      expect(mockExeca).toHaveBeenCalledWith('git', ['fetch', 'origin']);
    });

    it('should fetch from specified remote', async () => {
      const mockResult = {
        stdout: '',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      await fetchLatestChanges('upstream');

      expect(mockExeca).toHaveBeenCalledWith('git', ['fetch', 'upstream']);
    });
  });

  describe('getCurrentBranch', () => {
    it('should return current branch name', async () => {
      const mockResult = {
        stdout: 'feature/test-branch',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await getCurrentBranch();

      expect(result).toBe('feature/test-branch');
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    });

    it('should handle detached HEAD state', async () => {
      const mockResult = {
        stdout: 'HEAD',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await getCurrentBranch();

      expect(result).toBe('HEAD');
    });
  });

  describe('getCurrentCommit', () => {
    it('should return full commit hash by default', async () => {
      const mockResult = {
        stdout: 'a1b2c3d4e5f6789012345678901234567890abcd',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await getCurrentCommit();

      expect(result).toBe('a1b2c3d4e5f6789012345678901234567890abcd');
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD']);
    });

    it('should return short commit hash when requested', async () => {
      const mockResult = {
        stdout: 'a1b2c3d',
        stderr: '',
        exitCode: 0,
      } as any;

      mockExeca.mockResolvedValueOnce(mockResult);

      const result = await getCurrentCommit(true);

      expect(result).toBe('a1b2c3d');
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', '--short', 'HEAD']);
    });
  });

  describe('checkBranchUpToDate', () => {
    it('should pass when local and remote commits match', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: commitHash } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash } as any); // remote commit

      await expect(checkBranchUpToDate('main')).resolves.not.toThrow();

      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', 'HEAD']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', 'origin/main']);
    });

    it('should throw error when local and remote commits differ', async () => {
      const localCommit = 'a1b2c3d4e5f6789012345678901234567890abcd';
      const remoteCommit = 'b2c3d4e5f6789012345678901234567890abcdef';

      mockExeca
        .mockResolvedValueOnce({ stdout: localCommit } as any) // local commit
        .mockResolvedValueOnce({ stdout: remoteCommit } as any); // remote commit

      await expect(checkBranchUpToDate('main')).rejects.toThrow(
        /Local branch is not up to date with origin\/main/,
      );
    });

    it('should throw error when remote branch does not exist', async () => {
      const localCommit = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: localCommit } as any) // local commit
        .mockRejectedValueOnce(new Error('Remote branch not found')); // remote commit fails

      await expect(checkBranchUpToDate('main')).rejects.toThrow(
        /Remote branch 'origin\/main' not found/,
      );
    });

    it('should skip check in Azure DevOps context', async () => {
      process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI = 'https://dev.azure.com/test';

      await expect(checkBranchUpToDate('main')).resolves.not.toThrow();

      // Should not call any git commands
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it('should skip check when BUILD_BUILDID is set', async () => {
      process.env.BUILD_BUILDID = '123';

      await expect(checkBranchUpToDate('main')).resolves.not.toThrow();

      // Should not call any git commands
      expect(mockExeca).not.toHaveBeenCalled();
    });

    it('should use custom remote', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: commitHash } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash } as any); // remote commit

      await checkBranchUpToDate('main', 'upstream');

      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', 'upstream/main']);
    });
  });

  describe('validateBasicGitState', () => {
    it('should validate all checks when allowDirty is false', async () => {
      // Mock successful results for all checks
      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any); // untracked

      await expect(validateBasicGitState()).resolves.not.toThrow();

      expect(mockExeca).toHaveBeenCalledTimes(3);
      expect(mockExeca).toHaveBeenCalledWith('git', ['diff', '--exit-code']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['diff', '--cached', '--exit-code']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['ls-files', '--others', '--exclude-standard']);
    });

    it('should skip checks when allowDirty is true', async () => {
      await expect(validateBasicGitState({ allowDirty: true })).resolves.not.toThrow();

      expect(mockExeca).not.toHaveBeenCalled();
    });

    it('should fail if any check fails', async () => {
      // Mock unstaged changes error
      mockExeca.mockRejectedValueOnce({ exitCode: 1 } as any);

      await expect(validateBasicGitState()).rejects.toThrow('You have unstaged changes');
    });
  });

  describe('validateGitState', () => {
    it('should perform full validation when all options are false', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // fetch
        .mockResolvedValueOnce({ stdout: 'main', exitCode: 0 } as any) // current branch
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any); // remote commit

      await expect(validateGitState()).resolves.not.toThrow();

      expect(mockExeca).toHaveBeenCalledTimes(7);
      expect(mockExeca).toHaveBeenCalledWith('git', ['fetch', 'origin']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', '--abbrev-ref', 'HEAD']);
    });

    it('should skip basic validation when allowDirty is true', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // fetch
        .mockResolvedValueOnce({ stdout: 'main', exitCode: 0 } as any) // current branch
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any); // remote commit

      await expect(validateGitState({ allowDirty: true })).resolves.not.toThrow();

      // Should skip the 3 basic validation calls
      expect(mockExeca).toHaveBeenCalledTimes(4);
    });

    it('should skip branch up-to-date check when allowOutdated is true', async () => {
      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any); // fetch

      await expect(validateGitState({ allowOutdated: true })).resolves.not.toThrow();

      // Should not call getCurrentBranch or checkBranchUpToDate
      expect(mockExeca).toHaveBeenCalledTimes(4);
    });

    it('should use custom remote', async () => {
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // fetch
        .mockResolvedValueOnce({ stdout: 'main', exitCode: 0 } as any) // current branch
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any); // remote commit

      await validateGitState({ remote: 'upstream' });

      expect(mockExeca).toHaveBeenCalledWith('git', ['fetch', 'upstream']);
      expect(mockExeca).toHaveBeenCalledWith('git', ['rev-parse', 'upstream/main']);
    });

    it('should propagate errors from validation steps', async () => {
      // Mock fetch failure
      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockRejectedValueOnce(new Error('Fetch failed')); // fetch fails

      await expect(validateGitState()).rejects.toThrow('Fetch failed');
    });
  });

  describe('Integration scenarios', () => {
    it('should handle verbose logging throughout validation', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const commitHash = 'a1b2c3d4e5f6789012345678901234567890abcd';

      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // fetch
        .mockResolvedValueOnce({ stdout: 'main', exitCode: 0 } as any) // current branch
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any) // local commit
        .mockResolvedValueOnce({ stdout: commitHash, exitCode: 0 } as any); // remote commit

      await validateGitState({ verbose: true });

      // Should have verbose logging for git commands
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('[GIT] Executing:'));

      consoleSpy.mockRestore();
    });

    it('should handle complex error messages with proper formatting', async () => {
      const localCommit = 'a1b2c3d4';
      const remoteCommit = 'b2c3d4e5';

      mockExeca
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // unstaged
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // uncommitted
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // untracked
        .mockResolvedValueOnce({ stdout: '', exitCode: 0 } as any) // fetch
        .mockResolvedValueOnce({ stdout: 'feature/test', exitCode: 0 } as any) // current branch
        .mockResolvedValueOnce({ stdout: localCommit, exitCode: 0 } as any) // local commit
        .mockResolvedValueOnce({ stdout: remoteCommit, exitCode: 0 } as any); // remote commit

      await expect(validateGitState()).rejects.toThrow(
        /Local branch is not up to date with origin\/feature\/test.*Local commit:.*Remote commit:/s,
      );
    });
  });
});
