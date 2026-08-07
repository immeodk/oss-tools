/**
 * Domain error classes. See the `error-handling` skill.
 *
 * Each carries structured fields (status, configPath, exitCode, ...) so the
 * top-level CLI handler and logs have something better to work with than a
 * string. `cause` chains the originating error (ES2022) so the full failure
 * context survives. The class `name` is set in the constructor (rather than as
 * a class field) so it survives transpilation and shows up in stack traces.
 */

export class HttpError extends Error {
  readonly status: number;
  readonly url: string;
  readonly method: string;
  readonly responseBody: string | undefined;

  constructor(
    message: string,
    status: number,
    url: string,
    method: string,
    responseBody?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
    this.method = method;
    this.responseBody = responseBody;
  }
}

export class SchemaValidationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'SchemaValidationError';
  }
}

export class ConfigError extends Error {
  readonly configPath: string | undefined;

  constructor(message: string, configPath?: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ConfigError';
    this.configPath = configPath;
  }
}

export class AuthError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AuthError';
  }
}

export class CommandExecutionError extends Error {
  readonly command: string;
  readonly exitCode: number | undefined;
  readonly stdout: string | undefined;
  readonly stderr: string | undefined;

  constructor(
    message: string,
    command: string,
    exitCode?: number,
    stdout?: string,
    stderr?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
