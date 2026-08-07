import type { Logger } from '../../core/logger.js';
import type { CommandExecutor } from '../../core/command-executor.js';
import type { PrSignoffConfig } from '../../config/config.js';

/**
 * Shared dependencies passed to each Azure DevOps operation function.
 *
 * The operations are plain functions (not methods) that take this context as
 * their first argument; `createAzureDevOpsClient` builds one context and
 * composes the operations into a `PlatformAdapter`.
 */
export interface AzureContext {
  organization: string;
  project: string;
  config: PrSignoffConfig;
  logger: Logger;
  commandExecutor: CommandExecutor;
  verbose: boolean;
}

/** Headers for a GET/JSON-reading request. */
export function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, Accept: 'application/json' };
}

/** Headers for a POST/PUT request with a JSON body. */
export function jsonHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}
