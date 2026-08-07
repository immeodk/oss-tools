/**
 * Extract a human-readable message from a caught `unknown`.
 *
 * Under strict mode `catch` binds `error: unknown`, so this is the standard
 * narrowing for log/verbose messages. Phase C adds richer cause-chain
 * formatting for the CLI boundary; this stays the lightweight internal form.
 */
export function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Format an error for the CLI boundary: the message plus the deepest `cause`
 * in the chain (the root reason), when present. Use this in top-level command
 * handlers so users see *why* something failed, not just the outer message.
 */
export function formatErrorForCli(error: unknown): string {
  if (!(error instanceof Error)) return String(error);

  let root: Error = error;
  const seen = new Set<Error>([root]);
  while (root.cause instanceof Error && !seen.has(root.cause)) {
    root = root.cause;
    seen.add(root);
  }

  return root === error ? error.message : `${error.message}\n  caused by: ${root.message}`;
}
