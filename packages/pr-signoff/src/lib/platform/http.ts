import { HttpError, SchemaValidationError } from '../errors.js';
import { scrubSecrets } from '../core/secret-scrubbing.js';

/**
 * Thin typed `fetch` wrapper used by every platform adapter.
 *
 * Responsibilities:
 * - issue the request
 * - throw `HttpError` (with status/url/method/body) on non-2xx
 * - parse the JSON body through a caller-supplied parser that narrows
 *   `unknown` to `T` (see the `runtime-safety` skill)
 * - wrap parser/JSON failures in `SchemaValidationError` with the request
 *   context, preserving the original error as `cause`
 */
export async function httpJson<T>(
  url: string,
  parse: (raw: unknown) => T,
  init?: RequestInit,
): Promise<T> {
  const method = init?.method ?? 'GET';
  const response = await fetch(url, init);

  if (!response.ok) {
    const rawBody = await response.text().catch(() => '');
    // Scrub before it ever becomes part of an error message or gets printed
    // — see SECURITY.md and the `secret-scrubbing` module.
    const body = scrubSecrets(rawBody);
    const suffix = body ? `: ${body}` : '';
    throw new HttpError(
      `${method} ${url} → ${response.status} ${response.statusText}${suffix}`,
      response.status,
      url,
      method,
      body || undefined,
    );
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (cause) {
    throw new SchemaValidationError(`${method} ${url} → response was not valid JSON`, { cause });
  }

  try {
    return parse(raw);
  } catch (cause) {
    throw new SchemaValidationError(`${method} ${url} → response did not match expected shape`, {
      cause,
    });
  }
}
