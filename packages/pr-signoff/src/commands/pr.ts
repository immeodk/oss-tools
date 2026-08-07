import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { execSync, execFileSync } from 'child_process';
import { loadGlobalConfig } from '../lib/config/config.js';
import { readEnv } from '../lib/config/env.js';
import { formatErrorForCli } from '../lib/core/error-message.js';
import { createPrManager } from '../lib/azure/pr-manager.js';
import { createGitOperations } from '../lib/core/git-operations.js';
import { showHeader } from '../lib/core/header.js';

// Helper functions for status display
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

const getStatusDisplay = (status: string): string => {
  switch (status) {
    case 'active':
      return chalk.green('Active');
    case 'completed':
      return chalk.blue('Completed');
    case 'abandoned':
      return chalk.gray('Abandoned');
    default:
      return status;
  }
};

const getStatusIcon = (state: string): string => {
  switch (state) {
    case 'succeeded':
      return chalk.green('✅');
    case 'failed':
    case 'error':
      return chalk.red('❌');
    case 'pending':
      return chalk.yellow('⏳');
    case 'notSet':
      return chalk.gray('⚪');
    default:
      return chalk.gray('❓');
  }
};

export function createPrCommand(): Command {
  const pr = new Command('pr');
  pr.description('Manage pull requests with signoff method tags');

  // Create PR with validation mode
  pr.command('create')
    .description('Create a new pull request with signoff method')
    .option('--title <title>', 'PR title')
    .option('--description <description>', 'PR description')
    .option('--target-branch <branch>', 'Target branch (defaults to repo default branch)')
    .option(
      '--signoff-method <method>',
      'Signoff method: local or pipeline (uses config default if not specified)',
    )
    .option('--draft', 'Create as draft PR')
    .option('--auto-complete', 'Enable auto-complete when all policies pass')
    .action(async (options) => {
      showHeader('create and manage pull requests');
      const spinner = ora();

      try {
        spinner.start('Loading configuration');
        const config = loadGlobalConfig();
        spinner.succeed('Configuration loaded');

        // Function to find PR template
        const findPRTemplate = (): string | null => {
          const templatePaths = [
            '.azuredevops/pull_request_template.md',
            '.azuredevops/PULL_REQUEST_TEMPLATE.md',
            'docs/pull_request_template.md',
            'docs/PULL_REQUEST_TEMPLATE.md',
            '.github/pull_request_template.md',
            '.github/PULL_REQUEST_TEMPLATE.md',
            'PULL_REQUEST_TEMPLATE.md',
            'pull_request_template.md',
          ];

          // Check from git root
          const gitRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();

          for (const templatePath of templatePaths) {
            const fullPath = path.join(gitRoot, templatePath);
            if (fs.existsSync(fullPath)) {
              return fs.readFileSync(fullPath, 'utf8');
            }
          }

          return null;
        };

        // Resolve target branch (use --target-branch if provided, else detect repo default)
        const gitOps = createGitOperations({ verbose: false });
        const targetBranch: string = options.targetBranch ?? (await gitOps.getDefaultBranch());

        // Generate suggestions based on git context
        let titleSuggestion = '';
        let descriptionSuggestion = '';
        const templateContent = findPRTemplate();

        try {
          // Get the current branch name
          const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf8',
          }).trim();

          // Get recent commit messages for suggestions. Prefer commits unique to
          // this branch; fall back to the last 3 if origin/<branch> isn't known
          // locally. Done with a JS try/catch rather than a shell `|| ` + POSIX
          // `2>/dev/null` so it works on Windows cmd too.
          // Use execFileSync with an argument array (no shell) so a crafted
          // branch name in `targetBranch` can't inject shell commands — it is
          // passed to git as a single literal argument.
          let recentCommits: string[];
          try {
            recentCommits = execFileSync(
              'git',
              ['log', `origin/${targetBranch}..HEAD`, '--pretty=format:%s', '--reverse'],
              { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] },
            )
              .trim()
              .split('\n')
              .filter((msg) => msg);
          } catch {
            recentCommits = execFileSync('git', ['log', '-3', '--pretty=format:%s', '--reverse'], {
              encoding: 'utf8',
            })
              .trim()
              .split('\n')
              .filter((msg) => msg);
          }

          // Generate title suggestion from branch name or first commit
          if (currentBranch.includes('/')) {
            // Extract feature/bug/etc from branch name
            const branchParts = currentBranch.split('/');
            const lastPart = branchParts[branchParts.length - 1] ?? '';
            const branchDesc = lastPart
              .replace(/-/g, ' ')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (l) => l.toUpperCase());
            titleSuggestion = branchDesc;
          } else if (recentCommits.length > 0) {
            titleSuggestion = recentCommits[0] ?? '';
          }

          // Generate common content for both template and non-template cases
          const commitSummary =
            recentCommits.length > 0 ? recentCommits.join(', ') : 'Changes from ' + currentBranch;
          const commitList =
            recentCommits.length > 0 ? recentCommits.map((msg) => `- ${msg}`).join('\n') : '';

          // Use template if available, otherwise generate from commits
          if (templateContent) {
            console.log(chalk.cyan('📄 Found PR template, using it as base...'));
            descriptionSuggestion = templateContent;

            // Try to intelligently fill in common template sections

            // Common template replacements - handle various placeholder formats
            descriptionSuggestion = descriptionSuggestion
              // Replace description placeholders
              .replace(/_Brief description of changes_/gi, commitSummary)
              .replace(/_?Description of.+?_/gi, commitSummary)
              .replace(/_?Summary.+?_/gi, commitSummary)
              // Replace list placeholders
              .replace(/_List of changes_/gi, commitList)
              .replace(/_?Changes made.+?_/gi, commitList)
              .replace(/_?What changed.+?_/gi, commitList)
              // Replace issue placeholders
              .replace(/_Issue number_/gi, '(issue number)')
              .replace(/#\s*_Issue number_/gi, '#(issue number)')
              // Replace any context placeholders
              .replace(/_Any additional.+?_/gi, '')
              // Remove HTML comments
              .replace(/<!--[\s\S]*?-->/g, '')
              .trim();

            // If template has checkbox lists, try to check relevant ones
            if (descriptionSuggestion.includes('[ ]')) {
              if (currentBranch.includes('feature')) {
                descriptionSuggestion = descriptionSuggestion.replace(
                  /\[ \] (New feature|Feature)/gi,
                  '[x] $1',
                );
              }
              if (currentBranch.includes('fix') || currentBranch.includes('bug')) {
                descriptionSuggestion = descriptionSuggestion.replace(
                  /\[ \] (Bug fix|Fix)/gi,
                  '[x] $1',
                );
              }
              if (currentBranch.includes('docs')) {
                descriptionSuggestion = descriptionSuggestion.replace(
                  /\[ \] (Documentation)/gi,
                  '[x] $1',
                );
              }
            }

            // If we found a "Changes Made" section with placeholder, replace it
            if (commitList && descriptionSuggestion.includes('## Changes Made')) {
              descriptionSuggestion = descriptionSuggestion.replace(
                /## Changes Made\n[^#]*/,
                `## Changes Made\n${commitList}\n\n`,
              );
            }
          } else {
            // No template found, generate from commits with summary
            let generatedContent = '';

            if (commitSummary) {
              generatedContent += `## Summary\n${commitSummary}\n\n`;
            }

            if (commitList) {
              generatedContent += `## Changes\n\n${commitList}`;
            }

            descriptionSuggestion = generatedContent;
          }
        } catch {
          // If git commands fail, use template as-is or continue without suggestions
          if (templateContent) {
            descriptionSuggestion = templateContent;
          }
        }

        // Prompt for title if not provided
        let title = options.title;
        if (!title) {
          const titleAnswer = await inquirer.prompt([
            {
              type: 'input',
              name: 'title',
              message: 'PR Title:',
              default: titleSuggestion,
              validate: (input) => {
                if (!input || input.trim().length === 0) {
                  return 'PR title is required';
                }
                return true;
              },
            },
          ]);
          title = titleAnswer.title;
        }

        // Prompt for description if not provided
        let description = options.description;
        if (!description && !options.draft) {
          // Show full preview of suggested description
          if (descriptionSuggestion) {
            console.log(
              chalk.blue(
                '\n📝 Generated description from ' +
                  (templateContent ? 'PR template' : 'git commits') +
                  ':',
              ),
            );
            console.log(chalk.dim('─'.repeat(60)));
            // Show full description with proper formatting
            const lines = descriptionSuggestion.split('\n');
            for (const line of lines) {
              if (line.startsWith('##')) {
                console.log(chalk.cyan(line));
              } else if (line.startsWith('- [')) {
                console.log(chalk.gray(line));
              } else if (line.startsWith('- ')) {
                console.log(chalk.yellow(line));
              } else {
                console.log(chalk.gray(line));
              }
            }
            console.log(chalk.dim('─'.repeat(60)));
          }

          // Ask if user wants to edit/add description
          const descAnswer = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'wantDescription',
              message: descriptionSuggestion
                ? 'Do you want to review/edit this description?'
                : 'Do you want to add a description?',
              default: !!descriptionSuggestion, // Default to true if we have a suggestion
            },
          ]);

          const shouldEdit = descAnswer.wantDescription;

          if (shouldEdit) {
            // Check if VS Code is available and set as default
            let vsCodeAvailable = false;
            try {
              execSync('code --version', { stdio: 'ignore' });
              vsCodeAvailable = true;
            } catch {}

            // Determine which editor to use (VS Code default, or system default)
            const editorEnv = readEnv();
            let editorCommand = 'code --wait';
            if (!vsCodeAvailable || editorEnv.EDITOR?.includes('vi')) {
              editorCommand = editorEnv.VISUAL || editorEnv.EDITOR || 'vi';
            }

            console.log(
              chalk.cyan(
                `\n📝 Opening ${editorCommand.includes('code') ? 'VS Code' : editorCommand}...`,
              ),
            );
            if (editorCommand.includes('code')) {
              console.log(chalk.dim('   Save and close the file when done'));
            } else if (editorCommand.includes('vi')) {
              console.log(chalk.dim('   Vim: "i" to insert, "Esc" then ":wq" to save and quit'));
            }

            // Create temporary file with suggested content. mkdtempSync gives
            // an unpredictable, exclusively-created directory — a plain
            // Date.now()-based filename in the shared tmpdir would be
            // guessable, letting another local process race to plant a
            // symlink at that path before we write to it.
            const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-signoff-'));
            const tempFile = path.join(tempDir, 'pr-description.md');
            fs.writeFileSync(tempFile, descriptionSuggestion || '');

            // Launch editor directly without inquirer prompt
            await new Promise<void>((resolve, reject) => {
              const editorArgs = editorCommand.split(' ');
              const editor = editorArgs[0];
              if (!editor) {
                reject(new Error(`Could not parse editor command: '${editorCommand}'`));
                return;
              }
              const args = [...editorArgs.slice(1), tempFile];

              const child = spawn(editor, args, { stdio: 'inherit' });
              child.on('close', (code: number | null) => {
                if (code === 0) {
                  resolve();
                } else {
                  reject(new Error(`Editor exited with code ${code}`));
                }
              });
              child.on('error', reject);
            });

            // Read the edited content
            description = fs.readFileSync(tempFile, 'utf8').trim();
            fs.rmSync(tempDir, { recursive: true, force: true }); // Clean up temp dir
          } else {
            // User chose not to edit - use suggestion as-is or leave empty
            description = descriptionSuggestion || '';
          }
        }

        // Get verbose flag from the root command
        const globalOpts = pr.parent?.opts() || {};
        const isVerbose = globalOpts.verbose || false;

        const prManager = createPrManager(config, { verbose: isVerbose });

        // Determine signoff method (from option, config default, or fallback to local)
        const defaultMethod = config.signoff?.defaultSignoffMethod || 'local';
        const signoffMethod = options.signoffMethod || defaultMethod;

        // Create PR with signoff method tag
        const result = await prManager.createPullRequest(
          {
            title: title,
            description: description || undefined, // Explicitly pass undefined if empty
            targetBranch,
            validationMode: signoffMethod,
            isDraft: options.draft || false,
            autoComplete: options.autoComplete || false,
          },
          spinner,
        );

        console.log(chalk.green('\n✅ Pull request created successfully!'));
        console.log(chalk.bold('PR ID:'), result.pullRequestId);
        console.log(chalk.bold('Title:'), result.title);
        console.log(chalk.bold('URL:'), result.url);
        console.log(chalk.bold('Signoff Method:'), signoffMethod);

        if (result.labels && result.labels.length > 0) {
          console.log(chalk.bold('Tags:'), result.labels.map((l) => l.name).join(', '));
        }

        if (signoffMethod === 'local') {
          console.log(chalk.cyan('\n📝 This PR is configured for local signoff.'));
          console.log(chalk.dim('Run `pr-signoff` to validate and sign off locally.'));
        } else {
          console.log(chalk.cyan('\n🚀 This PR is configured for pipeline signoff.'));
          console.log(chalk.dim('The pipeline will automatically run validation checks.'));
        }
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to create pull request: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Update signoff validation mode for existing PR
  pr.command('validation-mode')
    .description('Update validation mode for current or specified PR')
    .argument('<mode>', 'Validation mode: local or pipeline')
    .option('--id <prId>', 'PR ID (auto-detects if not specified)')
    .action(async (mode: string, options) => {
      showHeader('update PR validation mode');
      const spinner = ora();

      try {
        if (!['local', 'pipeline'].includes(mode)) {
          throw new Error('Validation mode must be "local" or "pipeline"');
        }

        spinner.start('Loading configuration');
        const config = loadGlobalConfig();
        spinner.succeed('Configuration loaded');

        // Get verbose flag from the root command
        const globalOpts = pr.parent?.opts() || {};
        const isVerbose = globalOpts.verbose || false;

        const prManager = createPrManager(config, { verbose: isVerbose });

        const updateOptions = {
          prId: options.id ? parseInt(options.id, 10) : undefined,
          validationMode: mode as 'local' | 'pipeline',
        };

        await prManager.updatePullRequestValidationMode(updateOptions, spinner);

        console.log(chalk.green(`\n✅ PR validation mode updated to: ${mode}`));

        if (mode === 'local') {
          console.log(chalk.cyan('\n📝 Local Validation:'));
          console.log('This PR should be validated locally using pr-signoff.');
          console.log('After making changes, run "pr-signoff" to validate and sign off.');
        } else {
          console.log(chalk.cyan('\n🚀 Pipeline Validation:'));
          console.log('This PR will be validated by the pipeline.');
          console.log('The pipeline will run automatically when changes are pushed.');
        }
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to update validation mode: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Show PR status
  pr.command('status')
    .description('Check the current status of an Azure DevOps pull request')
    .option('--id <id>', 'Pull request ID (auto-detects if not provided)')
    .action(async (options) => {
      showHeader('pull request status');
      const spinner = ora();

      try {
        // Load configuration
        const config = loadGlobalConfig();

        // Get verbose flag from the root command
        const globalOpts = pr.parent?.opts() || {};
        const isVerbose = globalOpts.verbose || false;

        const prManager = createPrManager(config, { verbose: isVerbose });

        // Get comprehensive PR status (includes status checks, details, etc.)
        const status = await prManager.getPrStatus(options.id, spinner);

        // PR Information
        const prDetails: Record<string, string | number | undefined> = {
          repository: status.repository,
          prId: status.pr.pullRequestId,
          title: status.pr.title,
          author: status.pr.createdBy?.displayName,
          sourceBranch: status.pr.sourceRefName?.replace('refs/heads/', ''),
          targetBranch: status.pr.targetRefName?.replace('refs/heads/', ''),
          status: status.pr.status ? getStatusDisplay(status.pr.status) : undefined,
          created: status.pr.creationDate
            ? new Date(status.pr.creationDate).toLocaleString()
            : undefined,
        };

        // Add validation mode if tags are present
        if (status.pr.labels && status.pr.labels.length > 0) {
          const tags = status.pr.labels.map((l) => l.name);
          prDetails.tags = tags.join(', ');

          const methodTag = tags.find((tag) => tag.startsWith('signoff-method-'));
          if (methodTag) {
            const method = methodTag.substring('signoff-method-'.length);
            prDetails.validationMode = method === 'local' ? 'Local (pr-signoff)' : 'Pipeline';
          }
        }

        if (status.pr.closedDate) {
          prDetails.closed = new Date(status.pr.closedDate).toLocaleString();
        }

        console.log(''); // Add line break before summary
        showCompletionSummary({ title: 'Pull Request Status', details: prDetails });

        // Current Git Status
        const gitDetails = {
          currentBranch: status.currentBranch,
          currentCommit: status.currentCommit,
        };

        console.log('');
        showCompletionSummary({ title: 'Current Git Status', details: gitDetails });

        // Status Checks
        if (status.statusChecks.length > 0) {
          console.log('');
          console.log(chalk.blue('Status Checks:'));
          status.statusChecks.forEach((check) => {
            const statusIcon = getStatusIcon(check.state);
            const contextName = check.context?.name || 'Unknown';
            console.log(`  ${statusIcon} ${contextName}: ${check.description || 'No description'}`);
          });
        } else {
          console.log('');
          console.log(chalk.blue('Status Checks:'));
          console.log(chalk.dim('  No status checks found for current commit'));
          console.log(chalk.dim('  This usually means required policies are waiting for signoff'));
        }

        // Show merge status
        const succeededChecks = status.statusChecks.filter((check) => check.state === 'succeeded');
        const failedChecks = status.statusChecks.filter(
          (check) => check.state === 'failed' || check.state === 'error',
        );
        const pendingChecks = status.statusChecks.filter((check) => check.state === 'pending');

        if (status.statusChecks.length === 0) {
          console.log(
            chalk.yellow(
              '\n⏳ PR requires signoff before merge (no status checks for current commit)',
            ),
          );
        } else if (status.pr.status !== 'active') {
          console.log(chalk.yellow(`\n⚠️  PR is ${status.pr.status}`));
        } else if (failedChecks.length > 0) {
          console.log(chalk.red(`\n❌ ${failedChecks.length} policy check(s) failed`));
        } else if (pendingChecks.length > 0) {
          console.log(
            chalk.yellow(`\n⏳ Waiting for ${pendingChecks.length} policy check(s) to complete`),
          );
        } else if (succeededChecks.length === status.statusChecks.length) {
          console.log(chalk.green('\n✅ All policy checks passed - PR ready for review/merge'));
        } else {
          console.log(chalk.yellow('\n⚠️  PR status unclear'));
        }
      } catch (error: unknown) {
        spinner.fail(chalk.red(formatErrorForCli(error)));
        process.exit(1);
      }
    });

  return pr;
}
