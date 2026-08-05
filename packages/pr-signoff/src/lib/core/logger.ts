import chalk from 'chalk';

export interface Logger {
  readonly isVerbose: boolean;
  readonly streamOutput: boolean;
  verboseLog(message: string, data?: unknown): void;
  info(message: string): void;
  error(message: string): void;
  success(message: string): void;
  warning(message: string): void;
}

/**
 * Create a logger instance with verbose and streaming options
 */
export function createLogger(isVerbose = false, streamOutput = false): Logger {
  return {
    isVerbose,
    streamOutput,

    /**
     * Verbose logging utility
     */
    verboseLog(message: string, data?: unknown): void {
      if (isVerbose) {
        console.log(chalk.dim(`[VERBOSE] ${message}`));
        if (data !== undefined) {
          console.log(chalk.dim(JSON.stringify(data, null, 2)));
        }
      }
    },

    /**
     * Log info message
     */
    info(message: string): void {
      console.log(message);
    },

    /**
     * Log error message
     */
    error(message: string): void {
      console.error(chalk.red(message));
    },

    /**
     * Log success message
     */
    success(message: string): void {
      console.log(chalk.green(message));
    },

    /**
     * Log warning message
     */
    warning(message: string): void {
      console.log(chalk.yellow(message));
    },
  };
}
