/**
 * Minimal spinner contract shared by the orchestrator, managers, and command
 * handlers. Both `ora`'s `Ora` and the verbose-mode console shim in `index.ts`
 * structurally satisfy this, so it replaces the `spinner: any` parameters
 * without coupling the call sites to `ora`.
 */
export interface Spinner {
  start(text?: string): Spinner;
  succeed(text?: string): Spinner;
  fail(text?: string): Spinner;
  warn(text?: string): Spinner;
  info(text?: string): Spinner;
  stop(): Spinner;
}
