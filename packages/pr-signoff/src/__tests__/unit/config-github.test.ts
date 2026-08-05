import { describe, test, expect } from 'vitest';
import { validateConfig } from '../../lib/config/config.js';
import { parseOriginUrlToOwnerRepo } from '../../lib/github/origin-url.js';

describe('validateConfig — github block', () => {
  test('accepts a config with only a github block (no azureDevOps)', () => {
    const config = {
      github: { owner: 'my-org', repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  test('accepts github block without repo (auto-detect will fill it)', () => {
    const config = {
      github: { owner: 'my-org' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });

  test('throws when both github and azureDevOps blocks are present', () => {
    const config = {
      github: { owner: 'my-org', repo: 'my-repo' },
      azureDevOps: { organization: 'o', project: 'p' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/exactly one of azureDevOps or github/i);
  });

  test('throws when neither github nor azureDevOps block is present', () => {
    const config = {
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/exactly one of azureDevOps or github/i);
  });

  test('throws when github.owner is missing', () => {
    const config = {
      github: { repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/github\.owner/i);
  });

  test('throws when github.owner is not a string', () => {
    const config = {
      github: { owner: 42, repo: 'my-repo' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/github\.owner.*string/i);
  });

  test('throws when github.repo is not a string', () => {
    const config = {
      github: { owner: 'my-org', repo: 123 },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/github\.repo.*string/i);
  });

  test.each([
    ['../../etc', 'owner path traversal'],
    ['a/b', 'owner with slash'],
    ['a b', 'owner with space'],
    ['a$(x)', 'owner with shell chars'],
  ])('rejects unsafe github.owner %s (%s)', (owner) => {
    const config = { github: { owner, repo: 'r' }, signoff: { commands: ['npm test'] } };
    expect(() => validateConfig(config)).toThrow(/github\.owner may only contain/i);
  });

  test('rejects unsafe github.repo (path traversal)', () => {
    const config = {
      github: { owner: 'my-org', repo: '../x' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/github\.repo may only contain/i);
  });

  test('accepts a normal owner/repo slug', () => {
    const config = {
      github: { owner: 'my-org', repo: 'my-repo.v2' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).not.toThrow();
  });
});

describe('validateConfig — azureDevOps identifier safety', () => {
  test('rejects organization with path/shell chars', () => {
    const config = {
      azureDevOps: { organization: '../evil', project: 'p' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(config)).toThrow(/azureDevOps\.organization may only contain/i);
  });

  test('allows a project name with spaces but rejects path traversal', () => {
    const ok = {
      azureDevOps: { organization: 'org', project: 'My Project' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(ok)).not.toThrow();

    const bad = {
      azureDevOps: { organization: 'org', project: '../../x' },
      signoff: { commands: ['npm test'] },
    };
    expect(() => validateConfig(bad)).toThrow(/azureDevOps\.project must not contain/i);
  });
});

describe('parseOriginUrlToOwnerRepo', () => {
  test('parses HTTPS GitHub URLs (with .git suffix)', () => {
    expect(parseOriginUrlToOwnerRepo('https://github.com/my-org/my-repo.git')).toEqual({
      owner: 'my-org',
      repo: 'my-repo',
    });
  });

  test('parses HTTPS GitHub URLs (without .git suffix)', () => {
    expect(parseOriginUrlToOwnerRepo('https://github.com/my-org/my-repo')).toEqual({
      owner: 'my-org',
      repo: 'my-repo',
    });
  });

  test('parses SSH GitHub URLs', () => {
    expect(parseOriginUrlToOwnerRepo('git@github.com:my-org/my-repo.git')).toEqual({
      owner: 'my-org',
      repo: 'my-repo',
    });
  });

  test('parses SSH GitHub URLs without .git', () => {
    expect(parseOriginUrlToOwnerRepo('git@github.com:my-org/my-repo')).toEqual({
      owner: 'my-org',
      repo: 'my-repo',
    });
  });

  test('handles repository names containing dots', () => {
    expect(parseOriginUrlToOwnerRepo('https://github.com/my-org/repo.with.dots.git')).toEqual({
      owner: 'my-org',
      repo: 'repo.with.dots',
    });
  });

  test('returns null for non-GitHub URLs', () => {
    expect(parseOriginUrlToOwnerRepo('https://dev.azure.com/foo/bar/_git/baz')).toBeNull();
    expect(parseOriginUrlToOwnerRepo('https://gitlab.com/owner/repo.git')).toBeNull();
  });

  test('returns null for malformed URLs', () => {
    expect(parseOriginUrlToOwnerRepo('not-a-url')).toBeNull();
    expect(parseOriginUrlToOwnerRepo('')).toBeNull();
  });
});
