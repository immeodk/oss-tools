import { describe, test, expect, beforeEach, vi } from 'vitest';
import { executeGitCommand } from '@immeodk/git-utils';
import { resolveGitHubOwnerRepo } from '../../lib/github/resolve-repo.js';
import { ConfigError } from '../../lib/errors.js';

vi.mock('@immeodk/git-utils', () => ({
  executeGitCommand: vi.fn(),
}));

describe('resolveGitHubOwnerRepo', () => {
  const mockExec = vi.mocked(executeGitCommand);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns owner/repo directly when github.repo is set (no git call)', async () => {
    const result = await resolveGitHubOwnerRepo({ owner: 'my-org', repo: 'my-repo' });
    expect(result).toEqual({ owner: 'my-org', repo: 'my-repo' });
    expect(mockExec).not.toHaveBeenCalled();
  });

  test('auto-detects repo from the origin remote when repo is omitted', async () => {
    mockExec.mockResolvedValueOnce('git@github.com:my-org/detected-repo.git');
    const result = await resolveGitHubOwnerRepo({ owner: 'my-org' });
    expect(result).toEqual({ owner: 'my-org', repo: 'detected-repo' });
    expect(mockExec).toHaveBeenCalledWith(['remote', 'get-url', 'origin'], expect.any(Object));
  });

  test('throws ConfigError when the git remote read fails', async () => {
    mockExec.mockRejectedValue(new Error('no origin remote'));
    const error = await resolveGitHubOwnerRepo({ owner: 'my-org' }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConfigError);
    expect((error as Error).message).toMatch(/reading the git remote failed/i);
  });

  test('throws ConfigError when the origin remote is not a GitHub URL', async () => {
    mockExec.mockResolvedValue('https://dev.azure.com/org/proj/_git/repo');
    await expect(resolveGitHubOwnerRepo({ owner: 'my-org' })).rejects.toThrow(/not a GitHub URL/i);
  });

  test('throws ConfigError when the detected owner does not match config', async () => {
    mockExec.mockResolvedValue('https://github.com/other-org/some-repo.git');
    await expect(resolveGitHubOwnerRepo({ owner: 'my-org' })).rejects.toThrow(
      "github.owner in config is 'my-org' but origin remote points to 'other-org/some-repo'",
    );
  });
});
