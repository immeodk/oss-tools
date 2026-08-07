import { describe, test, expect } from 'vitest';
import { scrubSecrets } from '../../lib/core/secret-scrubbing.js';

describe('scrubSecrets', () => {
  test('redacts a GitHub personal access token', () => {
    const input = 'error using token ghp_abcdefghijklmnopqrstuvwxyz0123456789 for auth';
    expect(scrubSecrets(input)).toBe('error using token [REDACTED] for auth');
  });

  test('redacts each of the documented GitHub token prefixes', () => {
    for (const prefix of ['ghp', 'gho', 'ghu', 'ghs', 'ghr']) {
      const token = `${prefix}_${'a'.repeat(36)}`;
      expect(scrubSecrets(`token=${token}`)).not.toContain(token);
    }
  });

  test('redacts a fine-grained github_pat_ token', () => {
    const token = `github_pat_${'a'.repeat(30)}`;
    expect(scrubSecrets(`Authorization failed for ${token}`)).not.toContain(token);
  });

  test('redacts a Bearer token', () => {
    const input = 'rejected: Bearer abc123.def456-ghi789';
    const result = scrubSecrets(input);
    expect(result).not.toContain('abc123.def456-ghi789');
    expect(result).toContain('[REDACTED]');
  });

  test('redacts an echoed Authorization header', () => {
    const input = 'Authorization: Bearer some-secret-value\nOther: fine';
    const result = scrubSecrets(input);
    expect(result).not.toContain('some-secret-value');
    expect(result).toContain('Other: fine');
  });

  test('leaves ordinary text untouched', () => {
    const input = 'Not Found: no repository with that name';
    expect(scrubSecrets(input)).toBe(input);
  });

  test('truncates very long input after redaction', () => {
    const input = 'x'.repeat(3000);
    const result = scrubSecrets(input);
    expect(result.length).toBeLessThan(2100);
    expect(result).toContain('[truncated]');
  });

  test('handles empty string', () => {
    expect(scrubSecrets('')).toBe('');
  });
});
