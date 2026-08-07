import { describe, test, expect } from 'vitest';
import {
  HttpError,
  SchemaValidationError,
  ConfigError,
  AuthError,
  CommandExecutionError,
} from '../../lib/errors.js';

describe('error classes', () => {
  test('HttpError preserves status, url, method, responseBody and is an Error', () => {
    const e = new HttpError('GET /x → 404', 404, 'https://api/x', 'GET', '{"message":"nope"}');
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(HttpError);
    expect(e.name).toBe('HttpError');
    expect(e.status).toBe(404);
    expect(e.url).toBe('https://api/x');
    expect(e.method).toBe('GET');
    expect(e.responseBody).toBe('{"message":"nope"}');
    expect(e.message).toBe('GET /x → 404');
  });

  test('SchemaValidationError chains the underlying error as cause', () => {
    const cause = new Error('expected string');
    const e = new SchemaValidationError('shape mismatch', { cause });
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('SchemaValidationError');
    expect(e.cause).toBe(cause);
  });

  test('ConfigError preserves configPath and cause', () => {
    const cause = new SyntaxError('bad yaml');
    const e = new ConfigError('could not load', './pr-signoff.yaml', { cause });
    expect(e.name).toBe('ConfigError');
    expect(e.configPath).toBe('./pr-signoff.yaml');
    expect(e.cause).toBe(cause);
  });

  test('AuthError preserves cause', () => {
    const cause = new Error('az failed');
    const e = new AuthError('login failed', { cause });
    expect(e.name).toBe('AuthError');
    expect(e.cause).toBe(cause);
  });

  test('CommandExecutionError preserves command, exitCode, stdout, stderr', () => {
    const e = new CommandExecutionError('cmd failed', 'npm test', 1, 'out', 'err');
    expect(e.name).toBe('CommandExecutionError');
    expect(e.command).toBe('npm test');
    expect(e.exitCode).toBe(1);
    expect(e.stdout).toBe('out');
    expect(e.stderr).toBe('err');
  });

  test('all custom errors produce a stack', () => {
    expect(new HttpError('m', 500, 'u', 'GET').stack).toBeTruthy();
    expect(new ConfigError('m').stack).toBeTruthy();
  });
});
