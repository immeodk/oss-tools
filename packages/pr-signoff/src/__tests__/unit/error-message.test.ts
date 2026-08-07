import { describe, test, expect } from 'vitest';
import { describeError, formatErrorForCli } from '../../lib/core/error-message.js';
import { ConfigError, HttpError } from '../../lib/errors.js';

describe('describeError', () => {
  test('returns message for an Error', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
  });
  test('stringifies a non-Error', () => {
    expect(describeError('plain')).toBe('plain');
    expect(describeError(42)).toBe('42');
  });
});

describe('formatErrorForCli', () => {
  test('returns the message when there is no cause', () => {
    expect(formatErrorForCli(new Error('top'))).toBe('top');
  });

  test('appends the deepest cause when present', () => {
    const root = new HttpError('GET /x → 500', 500, 'https://api/x', 'GET');
    const wrapped = new ConfigError('could not start', './c.yaml', { cause: root });
    const out = formatErrorForCli(wrapped);
    expect(out).toContain('could not start');
    expect(out).toContain('caused by: GET /x → 500');
  });

  test('walks multiple cause levels to the root', () => {
    const root = new Error('disk full');
    const mid = new Error('write failed', { cause: root });
    const top = new Error('save failed', { cause: mid });
    expect(formatErrorForCli(top)).toBe('save failed\n  caused by: disk full');
  });

  test('does not loop on a cyclic cause chain', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b; // cycle
    expect(() => formatErrorForCli(b)).not.toThrow();
  });

  test('stringifies a non-Error', () => {
    expect(formatErrorForCli('nope')).toBe('nope');
  });
});
