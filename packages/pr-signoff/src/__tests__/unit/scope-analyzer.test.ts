import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeGitCommand } from '@immeodk/git-utils';
import { createScopeAnalyzer } from '../../lib/core/scope-analyzer.js';
import type { PlatformAdapter } from '../../lib/platform/platform-adapter.js';
import type { Repository } from '../../lib/platform/types.js';

vi.mock('@immeodk/git-utils', () => ({
  executeGitCommand: vi.fn(),
}));

const repo: Repository = { id: 'r', name: 'r' };

/** Minimal fake adapter exposing only getPrChanges, which is all the analyzer uses. */
function fakeAdapter(changedFiles: string[]): PlatformAdapter {
  return {
    getPrChanges: vi.fn().mockResolvedValue(changedFiles),
  } as unknown as PlatformAdapter;
}

describe('scope-analyzer', () => {
  const mockExec = vi.mocked(executeGitCommand);
  const originalCwd = process.cwd;

  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    process.cwd = originalCwd;
  });

  describe('generateContextName', () => {
    const analyzer = createScopeAnalyzer();

    test('returns the base name at repo root', () => {
      expect(analyzer.generateContextName('')).toBe('pr-signoff');
    });

    test('appends a sanitised folder leaf', () => {
      expect(analyzer.generateContextName('tools/pr-signoff/')).toBe('pr-signoff/pr-signoff');
      expect(analyzer.generateContextName('apps/Web App/')).toBe('pr-signoff/web-app');
    });

    test('honours a custom base name', () => {
      expect(analyzer.generateContextName('svc/', 'ci')).toBe('ci/svc');
    });
  });

  describe('detectScopedFolder', () => {
    test('returns the cwd path relative to repo root, slash-terminated', async () => {
      mockExec.mockResolvedValueOnce('/repo');
      process.cwd = () => '/repo/tools/pr-signoff';
      const analyzer = createScopeAnalyzer();
      expect(await analyzer.detectScopedFolder()).toBe('tools/pr-signoff/');
    });

    test('returns empty string at repo root', async () => {
      mockExec.mockResolvedValueOnce('/repo');
      process.cwd = () => '/repo';
      const analyzer = createScopeAnalyzer();
      expect(await analyzer.detectScopedFolder()).toBe('');
    });

    test('returns empty string when git fails', async () => {
      mockExec.mockRejectedValueOnce(new Error('not a git repo'));
      const analyzer = createScopeAnalyzer();
      expect(await analyzer.detectScopedFolder()).toBe('');
    });
  });

  describe('prHasChangesInScope', () => {
    test('returns true when not scoped', async () => {
      const analyzer = createScopeAnalyzer();
      expect(await analyzer.prHasChangesInScope(fakeAdapter([]), 't', repo, 1, '')).toBe(true);
    });

    test('returns true when a changed file is in the scoped folder', async () => {
      const analyzer = createScopeAnalyzer();
      const adapter = fakeAdapter(['tools/pr-signoff/src/x.ts', 'README.md']);
      expect(await analyzer.prHasChangesInScope(adapter, 't', repo, 1, 'tools/pr-signoff/')).toBe(
        true,
      );
    });

    test('returns false when no changed file is in the scoped folder', async () => {
      const analyzer = createScopeAnalyzer();
      const adapter = fakeAdapter(['docs/readme.md', 'other/file.ts']);
      expect(await analyzer.prHasChangesInScope(adapter, 't', repo, 1, 'tools/pr-signoff/')).toBe(
        false,
      );
    });

    test('returns true (fail-open) when the change list is empty', async () => {
      const analyzer = createScopeAnalyzer();
      expect(
        await analyzer.prHasChangesInScope(fakeAdapter([]), 't', repo, 1, 'tools/pr-signoff/'),
      ).toBe(true);
    });
  });
});
