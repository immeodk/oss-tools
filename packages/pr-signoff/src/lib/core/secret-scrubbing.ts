/**
 * Redact likely credentials from text before it's embedded in an error
 * message or printed.
 *
 * SECURITY.md promises: "Don't print raw upstream error bodies that might
 * contain a token; scrub before printing, even in verbose/debug mode." This
 * is what makes that true for `HttpError` (see `lib/platform/http.ts`) — a
 * failed GitHub/Azure DevOps API response body gets run through this before
 * it's embedded in the thrown error or printed at the CLI boundary.
 *
 * This is defense-in-depth, not a guarantee — pattern matching can't catch
 * every possible secret shape. It targets the concrete, known formats most
 * likely to appear in an upstream response: GitHub's documented token
 * prefixes, and a `Bearer`/`Authorization` header echoed back verbatim.
 */

const REDACTED = '[REDACTED]';

/** Caps how much of a response body reaches an error message/log line. */
const MAX_LENGTH = 2000;

const SECRET_PATTERNS: readonly RegExp[] = [
  // GitHub fine-grained/classic token prefixes: ghp_, gho_, ghu_, ghs_, ghr_
  /\bgh[oprsu]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  // `Bearer <token>` — case-insensitive per the HTTP spec's scheme token
  /\bBearer\s+\S{10,}/gi,
  // An `Authorization: ...` header echoed back verbatim by an upstream API
  /\bAuthorization\s*:\s*\S+/gi,
];

/**
 * Redact known credential shapes, then cap the overall length. Safe to call
 * on any string, including ones with no secrets — those pass through
 * unchanged (aside from truncation, if very long).
 */
export function scrubSecrets(text: string): string {
  let scrubbed = text;
  for (const pattern of SECRET_PATTERNS) {
    scrubbed = scrubbed.replace(pattern, REDACTED);
  }
  if (scrubbed.length > MAX_LENGTH) {
    scrubbed = `${scrubbed.slice(0, MAX_LENGTH)}… [truncated]`;
  }
  return scrubbed;
}
