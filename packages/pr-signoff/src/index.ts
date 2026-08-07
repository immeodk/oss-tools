#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import type { Spinner } from './lib/core/spinner.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import { createSignoffOrchestrator } from './signoff-orchestrator.js';
import { loadGlobalConfig } from './lib/config/config.js';
import { formatErrorForCli } from './lib/core/error-message.js';
import { showHeader } from './lib/core/header.js';
import { createSetupCommand } from './commands/setup-namespace.js';
import { createPrCommand } from './commands/pr.js';

interface PackageJson {
  version: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read package.json for version
const packageJson: PackageJson = JSON.parse(
  fs.readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);

const program = new Command();

// Global verbose flag
let isVerbose: boolean = false;

// Add global verbose option
program
  .name('pr-signoff')
  .description(
    'Pull Request Signoff Tool - Run CI checks and create status checks for pull requests',
  )
  .version(packageJson.version, '-v, --version', 'Display version number')
  .option('-V, --verbose', 'Enable verbose logging');

// Track if header has been shown in this session
let headerShown: boolean = false;

// Helper to set verbose flag from global options and show header
const setVerboseFlag = (): void => {
  const globalOpts = program.opts();
  isVerbose = globalOpts.verbose || false;

  // Show header only once per session
  if (!headerShown) {
    showHeader('run CI checks and create status checks');
    headerShown = true;
  }

  if (isVerbose) {
    console.log(chalk.dim(`[VERBOSE] Verbose logging enabled`));
  }
};

// Completion summary utility (matching dotpipeline style)
const showCompletionSummary = ({
  title,
  details = {},
}: {
  title: string;
  details?: Record<string, string | number | undefined>;
}): void => {
  console.log(chalk.green(`✔ ${title}`));

  // Show details in a compact format
  const detailEntries = Object.entries(details).filter(([_, value]) => value);
  if (detailEntries.length > 0) {
    const detailLines = detailEntries.map(([key, value]) => {
      const formattedKey = key.charAt(0).toLowerCase() + key.slice(1);
      return chalk.dim(`   ${formattedKey}: ${value}`);
    });
    console.log(detailLines.join('\n'));
  }
};

// Smart spinner utility that uses spinners in normal mode, console.log in verbose mode
const createSpinner = (message?: string, options: { alwaysSpinner?: boolean } = {}): Spinner => {
  // For long-running tasks, always show spinner even in verbose mode
  if (isVerbose && !options.alwaysSpinner) {
    if (message) {
      console.log(chalk.blue(`⏳ ${message}...`));
    }
    const verboseSpinner: Spinner = {
      start: (msg?: string) => {
        if (msg) {
          console.log(chalk.blue(`⏳ ${msg}...`));
        }
        return verboseSpinner;
      },
      succeed: (msg?: string) => {
        console.log(chalk.green(`✅ ${msg}`));
        return verboseSpinner;
      },
      fail: (msg?: string) => {
        console.log(chalk.red(`❌ ${msg}`));
        return verboseSpinner;
      },
      warn: (msg?: string) => {
        console.log(chalk.yellow(`⚠️  ${msg}`));
        return verboseSpinner;
      },
      info: (msg?: string) => {
        console.log(chalk.cyan(`ℹ️  ${msg}`));
        return verboseSpinner;
      },
      stop: () => {
        // Silent stop for verbose mode - no output needed
        return verboseSpinner;
      },
    };
    return verboseSpinner;
  } else {
    return ora(message);
  }
};

// Default to signoff command if no command is provided
if (process.argv.length <= 2) {
  process.argv.push('signoff');
}

// Validate command
program
  .command('validate')
  .description('Test signoff commands and check git state with warnings')
  .option(
    '--stream-output',
    'Stream command output in real-time (useful for long-running commands)',
  )
  .action(async (options) => {
    setVerboseFlag();
    const spinner = createSpinner();
    try {
      // Load global configuration
      spinner.start('Loading configuration');
      const config = loadGlobalConfig();
      spinner.succeed('Configuration loaded successfully');

      // Platform/config validity is enforced by loadGlobalConfig (exactly one
      // of azureDevOps/github). No platform-specific gate needed here.

      // Create signoff instance with default options (no special flags for validate)
      const validateOptions = {
        streamOutput: options.streamOutput || false,
        verbose: isVerbose,
      };

      const orchestrator = createSignoffOrchestrator(config, validateOptions);

      // Run validation
      const result = await orchestrator.validate(spinner);

      // Show validation results using clean format
      const details = {
        currentBranch: result.currentBranch,
        currentCommit: result.commitHash,
        wouldCreateMessage: result.message,
      };

      const hasWarnings = result.warnings && result.warnings.length > 0;
      const title = hasWarnings
        ? 'Validation completed with warnings'
        : 'Validation completed successfully';

      console.log(''); // Add line break before summary
      showCompletionSummary({ title, details });

      if (hasWarnings) {
        console.log(
          chalk.yellow(
            '\n⚠️  Found git state issues - these must be resolved before running signoff',
          ),
        );
      }
    } catch (error) {
      spinner?.fail(chalk.red(formatErrorForCli(error)));
      process.exit(1);
    }
  });

// Main signoff command
program
  .command('signoff')
  .description('Run CI checks and create a status check for pull requests')
  .option('--id <id>', 'Pull request ID (optional - will auto-detect if not provided)')
  .option(
    '--stream-output',
    'Stream command output in real-time (useful for long-running commands)',
  )
  .action(async (options) => {
    setVerboseFlag();
    const spinner = createSpinner();
    try {
      // Initialize (config, validation, etc.)
      spinner.start('Initializing signoff process');
      const config = loadGlobalConfig();

      const signoffOptions = {
        id: options.id,
        streamOutput: options.streamOutput || false,
        verbose: isVerbose,
      };

      const orchestrator = createSignoffOrchestrator(config, signoffOptions);
      spinner.succeed('Ready to run signoff checks');

      // Execute signoff process (this will show the important steps)
      const result = await orchestrator.execute(spinner);

      if (result.skipped) {
        const skipDetails: Record<string, string | number | undefined> = {
          organization: result.organization,
          project: result.project,
          pullRequest: result.prId || 'Not linked to a PR',
          reason: result.message,
        };

        if (config.signoff?.scopeToFolder) {
          skipDetails.scopedFolder = 'Scoped execution enabled';
        }

        console.log(''); // Add line break before summary
        showCompletionSummary({
          title: 'Signoff skipped - no changes in scope',
          details: skipDetails,
        });
      } else {
        // Summary using clean completion format
        const details: Record<string, string | number | undefined> = {
          organization: result.organization,
          project: result.project,
          pullRequest: result.prId,
          message: result.message,
          commit: result.commitHash,
        };

        if (config.signoff?.policyName) {
          details.policy = config.signoff.policyName;
        }

        const title =
          result.type === 'full-signoff'
            ? 'Pull request signoff completed'
            : 'Commit status check created (PR status failed)';

        console.log(''); // Add line break before summary
        showCompletionSummary({ title, details });
      }
    } catch (error) {
      spinner?.fail(chalk.red(formatErrorForCli(error)));
      process.exit(1);
    }
  });

// Add PR management command
program.addCommand(createPrCommand());

// Add setup command namespace
program.addCommand(createSetupCommand());

program.parse(process.argv);
