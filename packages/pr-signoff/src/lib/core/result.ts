/**
 * Result type for expected, recoverable failures.
 *
 * Per the user's chosen convention: model *expected* failures (a config that
 * fails to load, a malformed input) as a `Result` value the caller branches
 * on, and reserve `throw` for programmer errors and unrecoverable conditions.
 *
 * Used at boundaries where a caller can genuinely act on the failure (e.g.
 * `loadConfig`). Deep internal calls where the only response is to abort keep
 * throwing — wrapping those in `Result` would be ceremony with no payoff.
 */
export type Result<T, E = Error> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

export function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok;
}

export function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok;
}

/**
 * Return the value, or throw the error. Use when the caller has decided the
 * failure is unrecoverable at this point (e.g. a CLI handler that aborts).
 */
export function unwrap<T, E>(result: Result<T, E>): T {
  if (result.ok) return result.value;
  throw result.error;
}

export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result;
}

export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
  return result.ok ? result : err(fn(result.error));
}
