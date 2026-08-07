import path from 'path';
import { executeGitCommand } from '@immeodk/git-utils';
import { createLogger, Logger } from './logger.js';
import { describeError } from './error-message.js';
import type { PlatformAdapter } from '../platform/platform-adapter.js';
import type { Repository } from '../platform/types.js';

export interface ScopeAnalyzerOptions {
  verbose?: boolean;
}

export interface ScopeInfo {
  scopedFolder: string;
  contextName: string;
}

export interface ScopeAnalyzer {
  readonly logger: Logger;
  detectScopedFolder(): Promise<string>;
  generateContextName(scopedFolder: string, baseName?: string): string;
  prHasChangesInScope(
    platformAdapter: PlatformAdapter,
    token: string,
    repo: Repository,
    prId: number,
    scopedFolder: string,
  ): Promise<boolean>;
}

export function createScopeAnalyzer(options: ScopeAnalyzerOptions = {}): ScopeAnalyzer {
  const logger = createLogger(options.verbose || false);
  const verbose = options.verbose || false;

  return {
    logger,

    /**
     * Detect the folder containing pr-signoff.json relative to repo root
     */
    async detectScopedFolder(): Promise<string> {
      try {
        // Get the repository root
        const repoRoot = await executeGitCommand(['rev-parse', '--show-toplevel'], { verbose });

        // Get current working directory
        const cwd = process.cwd();

        // Calculate relative path from repo root to current directory
        let relativePath = path.relative(repoRoot, cwd);

        // Normalize path separators for consistency
        relativePath = relativePath.replace(/\\/g, '/');

        // Ensure it ends with a slash if not empty
        if (relativePath && !relativePath.endsWith('/')) {
          relativePath += '/';
        }

        const scopedFolder = relativePath || '';
        logger.verboseLog(`Detected scoped folder: ${scopedFolder || '(root)'}`);

        return scopedFolder;
      } catch (error: unknown) {
        logger.verboseLog(`Failed to detect scoped folder: ${describeError(error)}`);
        return '';
      }
    },

    /**
     * Generate context name for status checks based on folder
     */
    generateContextName(scopedFolder: string, baseName = 'pr-signoff'): string {
      if (!scopedFolder) {
        return baseName;
      }

      // Generate policy name from folder path
      const folderName = scopedFolder.replace(/\/$/, '').split('/').pop() || 'root';
      const sanitizedName = folderName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
      const contextName = `${baseName}/${sanitizedName}`;

      logger.verboseLog(`Auto-generated status check context: ${contextName}`);
      return contextName;
    },

    /**
     * Check if PR has changes in the scoped folder
     */
    async prHasChangesInScope(
      platformAdapter: PlatformAdapter,
      token: string,
      repo: Repository,
      prId: number,
      scopedFolder: string,
    ): Promise<boolean> {
      if (!scopedFolder) {
        // If not scoped, always return true
        return true;
      }

      try {
        // Get list of changed files in PR
        const changedFiles = await platformAdapter.getPrChanges(token, repo, prId);

        if (changedFiles.length === 0) {
          return true; // If we can't get changes, assume there are relevant changes
        }

        // Check if any changed file is in our scoped folder
        const hasRelevantChanges = changedFiles.some((filePath) => {
          const isInScope = filePath.startsWith(scopedFolder);
          if (isInScope) {
            logger.verboseLog(`Found change in scope: ${filePath}`);
          }
          return isInScope;
        });

        if (!hasRelevantChanges) {
          logger.verboseLog(`No changes found in scoped folder: ${scopedFolder}`);
        }

        return hasRelevantChanges;
      } catch (error: unknown) {
        logger.verboseLog(
          `Error checking PR changes: ${describeError(error)}. Assuming changes exist.`,
        );
        return true;
      }
    },
  };
}
