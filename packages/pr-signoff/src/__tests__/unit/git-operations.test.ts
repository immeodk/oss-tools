import { describe, test, expect, beforeEach, vi } from 'vitest';
import { executeGitCommand } from '@immeodk/git-utils';
import { createGitOperations } from '../../lib/core/git-operations.js';

vi.mock('@immeodk/git-utils', () => ({
  executeGitCommand: vi.fn(),
}));

describe('git-operations', () => {
  const mockExec = vi.mocked(executeGitCommand);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRepositoryName', () => {
    test('parses a GitHub HTTPS remote without a .git suffix (actions/checkout)', async () => {
      mockExec.mockResolvedValueOnce('https://github.com/immeodk/oss-tools');
      const gitOps = createGitOperations();
      expect(await gitOps.getRepositoryName()).toBe('oss-tools');
    });

    test('parses a GitHub HTTPS remote with a .git suffix', async () => {
      mockExec.mockResolvedValueOnce('https://github.com/immeodk/oss-tools.git');
      const gitOps = createGitOperations();
      expect(await gitOps.getRepositoryName()).toBe('oss-tools');
    });

    test('parses an SSH remote with a .git suffix', async () => {
      mockExec.mockResolvedValueOnce('git@github.com:immeodk/oss-tools.git');
      const gitOps = createGitOperations();
      expect(await gitOps.getRepositoryName()).toBe('oss-tools');
    });

    test('parses an Azure DevOps remote', async () => {
      mockExec.mockResolvedValueOnce('https://org@dev.azure.com/org/project/_git/repo');
      const gitOps = createGitOperations();
      expect(await gitOps.getRepositoryName()).toBe('repo');
    });

    test('throws a descriptive error when the remote URL is empty', async () => {
      mockExec.mockResolvedValueOnce('');
      const gitOps = createGitOperations();
      await expect(gitOps.getRepositoryName()).rejects.toThrow('Failed to get repository name');
    });
  });
});
