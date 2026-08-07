import { execa } from 'execa';
import chalk from 'chalk';
import { createLogger, Logger } from './logger.js';
import { CommandExecutionError } from '../errors.js';
import { describeError } from './error-message.js';
import type { Spinner } from './spinner.js';

export interface CommandExecutorOptions {
  verbose?: boolean;
  streamOutput?: boolean;
}

export interface CommandExecutor {
  readonly logger: Logger;
  readonly streamOutput: boolean;
  executeCommand(command: string, args: string[]): Promise<string>;
  executeCommandWithStream(
    cmd: string,
    args: string[],
    step: string,
    commandDisplay: string,
  ): Promise<string>;
  executeCommands(commands: string[], spinner: Spinner): Promise<void>;
}

/**
 * Create a command executor with streaming and non-streaming support
 */
export function createCommandExecutor(options: CommandExecutorOptions = {}): CommandExecutor {
  const logger = createLogger(options.verbose || false, options.streamOutput || false);
  const streamOutput = options.streamOutput || false;

  /**
   * Execute shell command with proper error handling
   */
  async function executeCommand(command: string, args: string[]): Promise<string> {
    const fullCommand = `${command} ${args.join(' ')}`;
    logger.verboseLog(`Executing command: ${fullCommand}`);

    try {
      const result = await execa(command, args);
      const output = result.stdout?.trim() ?? '';

      logger.verboseLog(`Command completed successfully`);
      if (output) {
        logger.verboseLog(`Command output:`, output);
      } else {
        logger.verboseLog(`Command output: (empty)`);
      }

      return output;
    } catch (error: unknown) {
      logger.verboseLog(`Command failed: ${describeError(error)}`);
      const stderr = (error as { stderr?: string })?.stderr;
      if (stderr) {
        logger.verboseLog(`Command stderr:`, stderr);
      }
      throw error;
    }
  }

  /**
   * Execute command with streaming output support
   */
  async function executeCommandWithStream(
    cmd: string,
    args: string[],
    step: string,
    commandDisplay: string,
  ): Promise<string> {
    try {
      // Create the subprocess with inherit for better terminal compatibility
      if (streamOutput) {
        console.log(chalk.cyan(`\n[${step}] Running: ${commandDisplay}`));
        console.log(chalk.dim('─'.repeat(60)));

        // Use inherit for stdio to let the subprocess control terminal directly
        const subprocess = execa(cmd, args, {
          stdio: ['pipe', 'inherit', 'inherit'],
          env: {
            ...process.env,
            FORCE_COLOR: '1', // Ensure colors are preserved
            CI: 'false', // Some tools behave differently in CI mode
          },
        });

        // Wait for completion
        await subprocess;

        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.green(`✓ [${step}] Completed successfully\n`));

        return ''; // We don't capture output in streaming mode
      } else {
        // Non-streaming mode - capture output
        const result = await execa(cmd, args);
        return result.stdout || '';
      }
    } catch (error: unknown) {
      if (streamOutput) {
        console.log(chalk.dim('─'.repeat(60)));
        console.log(chalk.red(`✗ [${step}] Failed\n`));
      }
      throw error;
    }
  }

  /**
   * Execute commands in sequence
   */
  async function executeCommands(commands: string[], spinner: Spinner): Promise<void> {
    if (!commands || commands.length === 0) {
      return;
    }

    // Highlight the start of validation checks
    console.log(chalk.bold.cyan('\n🧪 Running Validation Checks'));
    console.log(chalk.dim('─'.repeat(50)));

    for (let i = 0; i < commands.length; i++) {
      const command = commands[i];
      if (!command) continue; // satisfies noUncheckedIndexedAccess; bounds-checked loop
      const step = `${i + 1}/${commands.length}`;

      // If streaming, don't use spinner
      if (!streamOutput) {
        spinner.start(`[${step}] ${command}`);
      }

      try {
        // Cross-platform command execution
        let output: string = '';
        if (streamOutput) {
          // Use streaming for long-running commands
          if (process.platform === 'win32') {
            await executeCommandWithStream('cmd', ['/c', command], step, command);
          } else {
            await executeCommandWithStream('sh', ['-c', command], step, command);
          }
        } else {
          // Original non-streaming execution
          if (process.platform === 'win32') {
            output = await executeCommand('cmd', ['/c', command]);
          } else {
            output = await executeCommand('sh', ['-c', command]);
          }
          spinner.succeed(`[${step}] ${command}`);
          if (output && logger.isVerbose) {
            logger.verboseLog(`Command output for "${command}":`, output);
          }
        }
      } catch (error: unknown) {
        if (!streamOutput) {
          spinner.fail(`[${step}] ${command}`);
        }

        // execa errors carry stdout/stderr/exitCode; read them defensively.
        const e = (error ?? {}) as {
          stdout?: string;
          stderr?: string;
          exitCode?: number;
          command?: string;
        };
        const errorMsg = `Command failed: ${command}`;
        logger.error(errorMsg);

        if (e.stdout) {
          console.log(chalk.dim('   stdout:', e.stdout));
        }
        if (e.stderr) {
          console.log(chalk.dim('   stderr:', e.stderr));
        }

        throw new CommandExecutionError(
          `${errorMsg}\nCommand failed with exit code ${e.exitCode}: ${e.command || command}`,
          command,
          e.exitCode,
          e.stdout,
          e.stderr,
          { cause: error },
        );
      }
    }

    // Final success message
    console.log(chalk.dim('─'.repeat(50)));
    console.log(chalk.green('✅ All validation checks passed\n'));
  }

  return {
    logger,
    streamOutput,
    executeCommand,
    executeCommandWithStream,
    executeCommands,
  };
}
