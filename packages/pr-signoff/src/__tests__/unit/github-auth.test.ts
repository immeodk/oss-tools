import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { execa } from 'execa';
import { getGitHubToken } from '../../lib/github/github-auth.js';

vi.mock('execa');

describe('getGitHubToken', () => {
  const mockExeca = vi.mocked(execa);
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GITHUB_ACTIONS;
    delete process.env.GITHUB_TOKEN;
    delete process.env.GH_TOKEN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('uses $GITHUB_TOKEN when running in GitHub Actions', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_TOKEN = 'actions-token-abc';

    const token = await getGitHubToken();

    expect(token).toBe('actions-token-abc');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  test('ignores $GITHUB_TOKEN when NOT running in GitHub Actions', async () => {
    process.env.GITHUB_TOKEN = 'should-be-ignored';
    process.env.GH_TOKEN = 'gh-token-xyz';

    const token = await getGitHubToken();

    expect(token).toBe('gh-token-xyz');
  });

  test('uses $GH_TOKEN when set (no Actions context)', async () => {
    process.env.GH_TOKEN = 'gh-token-xyz';

    const token = await getGitHubToken();

    expect(token).toBe('gh-token-xyz');
    expect(mockExeca).not.toHaveBeenCalled();
  });

  test('falls back to `gh auth token` when no env var is set', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: 'gho_cli_token_from_shell',
      stderr: '',
      exitCode: 0,
    } as any);

    const token = await getGitHubToken();

    expect(token).toBe('gho_cli_token_from_shell');
    expect(mockExeca).toHaveBeenCalledWith('gh', ['auth', 'token']);
  });

  test('trims whitespace from `gh auth token` output', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: '  gho_with_whitespace  \n',
      stderr: '',
      exitCode: 0,
    } as any);

    const token = await getGitHubToken();

    expect(token).toBe('gho_with_whitespace');
  });

  test('throws actionable error when gh CLI fails and no env var is set', async () => {
    mockExeca.mockRejectedValueOnce(new Error('gh: command not found'));

    await expect(getGitHubToken()).rejects.toThrow(/could not resolve a github token/i);
    await expect(getGitHubToken()).rejects.toThrow(/gh auth login|GH_TOKEN|GITHUB_TOKEN/);
  });

  test('throws when gh CLI returns empty output', async () => {
    mockExeca.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      exitCode: 0,
    } as any);

    await expect(getGitHubToken()).rejects.toThrow(/could not resolve a github token/i);
  });

  test('prefers $GITHUB_TOKEN (in Actions) over $GH_TOKEN', async () => {
    process.env.GITHUB_ACTIONS = 'true';
    process.env.GITHUB_TOKEN = 'actions-wins';
    process.env.GH_TOKEN = 'gh-loses';

    const token = await getGitHubToken();

    expect(token).toBe('actions-wins');
  });

  test('does not use $GITHUB_TOKEN if Actions env is set to anything other than "true"', async () => {
    process.env.GITHUB_ACTIONS = 'false';
    process.env.GITHUB_TOKEN = 'should-be-ignored';
    process.env.GH_TOKEN = 'gh-wins';

    const token = await getGitHubToken();

    expect(token).toBe('gh-wins');
  });
});
