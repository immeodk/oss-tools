import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { readEnv, isGitHubActions, isAzureDevOpsPipeline } from '../../lib/config/env.js';

describe('readEnv', () => {
  const original = { ...process.env };

  beforeEach(() => {
    for (const k of [
      'TF_BUILD',
      'BUILD_REASON',
      'AZURE_DEVOPS_TOKEN',
      'SYSTEM_PULLREQUEST_PULLREQUESTID',
      'GITHUB_ACTIONS',
      'GH_TOKEN',
      'GITHUB_TOKEN',
    ]) {
      delete process.env[k];
    }
  });
  afterEach(() => {
    process.env = { ...original };
  });

  test('returns only the declared env keys (strips the rest)', () => {
    process.env.GH_TOKEN = 'abc';
    process.env.SOME_UNRELATED_VAR = 'x';
    const env = readEnv();
    expect(env.GH_TOKEN).toBe('abc');
    expect('SOME_UNRELATED_VAR' in env).toBe(false);
  });

  test('re-reads process.env on each call (no memoization)', () => {
    expect(readEnv().GH_TOKEN).toBeUndefined();
    process.env.GH_TOKEN = 'later';
    expect(readEnv().GH_TOKEN).toBe('later');
  });

  describe('isGitHubActions', () => {
    test('true only when GITHUB_ACTIONS === "true"', () => {
      expect(isGitHubActions()).toBe(false);
      process.env.GITHUB_ACTIONS = 'false';
      expect(isGitHubActions()).toBe(false);
      process.env.GITHUB_ACTIONS = 'true';
      expect(isGitHubActions()).toBe(true);
    });
  });

  describe('isAzureDevOpsPipeline', () => {
    test('true when TF_BUILD or BUILD_REASON is set', () => {
      expect(isAzureDevOpsPipeline()).toBe(false);
      process.env.TF_BUILD = 'True';
      expect(isAzureDevOpsPipeline()).toBe(true);
      delete process.env.TF_BUILD;
      process.env.BUILD_REASON = 'PullRequest';
      expect(isAzureDevOpsPipeline()).toBe(true);
    });
  });
});
