import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execa } from 'execa';
import fs from 'fs';
import path from 'path';
import { loadGlobalConfig } from '../lib/config/config.js';
import { showHeader } from '../lib/core/header.js';
import { describeError, formatErrorForCli } from '../lib/core/error-message.js';
import { createSignoffOrchestrator } from '../signoff-orchestrator.js';
import { createSchemaCommand } from './schema.js';
import { createScopeAnalyzer } from '../lib/core/scope-analyzer.js';
import { createGitOperations } from '../lib/core/git-operations.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createSetupCommand(): Command {
  const setup = new Command('setup');
  setup.description('Setup and configure pr-signoff components');

  // Generate configuration file
  setup
    .command('generate-config')
    .description('Generate a base pr-signoff.yaml configuration file with placeholder values')
    .option('-f, --force', 'Overwrite existing configuration file')
    .action(async (options) => {
      showHeader('generate configuration');
      const spinner = ora();

      try {
        const configPath = 'pr-signoff.yaml';

        // Check if config already exists
        if (fs.existsSync(configPath) && !options.force) {
          console.log(chalk.yellow(`⚠️  Configuration file already exists at ${configPath}`));
          console.log(chalk.dim('Use --force to overwrite, or edit the existing file manually.'));
          return;
        }

        spinner.start('Generating configuration template');

        // Create template configuration
        const template = `# PR Signoff Configuration
# See: https://docs.anthropic.com/en/docs/claude-code for full documentation

# Minimum tool version required
minToolVersion: "1.5.0"

# Azure DevOps connection details
azureDevOps:
  organization: your-org  # Replace with your Azure DevOps organization name
  project: your-project  # Replace with your Azure DevOps project name
  # tenantId: your-tenant-id  # Azure tenant ID

# Signoff configuration
signoff:
  # Policy name for the status check (optional - auto-generated if not specified)
  # policyName: my-policy
  
  # Scope signoff to the folder containing changes (useful for monorepos)
  scopeToFolder: true
  
  # Default validation method for new PRs
  defaultSignoffMethod: local
  
  # Pipeline signoff configuration (for hybrid validation)
  pipelineSignoff:
    name: pr-signoff-pipeline
    azureDevOpsPipelineFolder: "project-folder"  # Azure DevOps folder path
    pipelineDefinition: .pipeline/pr-signoff-pipeline.yaml
  
  # Commands to run for validation
  commands:
    # Add your validation commands here, for example:
    # - npm install
    # - npm test
    # - npm run lint
    # - docker build -t app:latest .
    # - dotnet test
`;

        fs.writeFileSync(configPath, template);
        spinner.succeed(`Configuration template created at ${configPath}`);

        console.log(chalk.green('\n✅ Configuration file generated!'));
        console.log(chalk.cyan('\n📋 Next steps:'));
        console.log('1. Edit pr-signoff.yaml with your specific settings');
        console.log('2. Add your validation commands');
        console.log('3. Test with: pr-signoff validate');
        console.log('4. Setup branch policy: pr-signoff setup register-pr-signoff-policy');
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to generate configuration: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Register PR signoff policy
  setup
    .command('register-pr-signoff-policy')
    .description('Create branch policy to require signoff status check on future PRs')
    .option('--branch <branch>', 'Target branch (defaults to repo default branch)')
    .option('--optional', 'Make the status check optional instead of required')
    .action(async (options) => {
      showHeader('register pr signoff policy');
      const spinner = ora();

      try {
        // Load global configuration
        spinner.start('Loading configuration');
        const config = loadGlobalConfig();
        spinner.succeed('Configuration loaded successfully');

        // Create orchestrator instance (platform validity enforced by loadGlobalConfig)
        const orchestrator = createSignoffOrchestrator(config, { verbose: false });

        // Setup the policy
        const policyOptions = {
          targetBranch: options.branch,
          required: !options.optional, // Default is required unless --optional is specified
        };

        const result = await orchestrator.setupPolicy(policyOptions, spinner);

        if (result.action === 'updated') {
          console.log(chalk.blue('\nSignoff policy updated! 🔄'));
          console.log(chalk.bold('\nRepository:'), result.repository);
          console.log(chalk.bold('Target Branch:'), result.targetBranch);
          console.log(chalk.bold('Policy ID:'), result.policyId);
          console.log(
            chalk.bold('Status Check:'),
            result.required ? chalk.green('Required') : chalk.yellow('Optional'),
          );
          if (config.signoff?.policyName) {
            console.log(chalk.bold('Policy Name:'), config.signoff.policyName);
          }
          if (config.signoff?.scopeToFolder) {
            console.log(chalk.bold('Scoped Folder:'), 'Enabled');
          }
          console.log(chalk.cyan('\n✨ Policy has been updated with new configuration!'));
        } else {
          console.log(chalk.green('\nBranch policy setup completed! 🎉'));
          console.log(chalk.bold('\nRepository:'), result.repository);
          console.log(chalk.bold('Target Branch:'), result.targetBranch);
          console.log(chalk.bold('Policy ID:'), result.policyId);
          console.log(
            chalk.bold('Status Check:'),
            result.required ? chalk.green('Required') : chalk.yellow('Optional'),
          );
          if (config.signoff?.policyName) {
            console.log(chalk.bold('Policy Name:'), config.signoff.policyName);
          }
          if (config.signoff?.scopeToFolder) {
            console.log(chalk.bold('Scoped Folder:'), 'Enabled');
          }
          console.log(
            chalk.cyan('\n✨ Future pull requests to this branch will now require signoff!'),
          );
        }
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to register policy: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Setup PR signoff pipeline YAML
  setup
    .command('pr-signoff-pipeline')
    .description('Create pipeline YAML for hybrid validation')
    .option('-f, --force', 'Overwrite existing pipeline file without confirmation')
    .action(async (options) => {
      showHeader('setup pr signoff pipeline');
      const spinner = ora();

      try {
        spinner.start('Loading configuration');
        const config = loadGlobalConfig();
        spinner.succeed('Configuration loaded');

        // Check if pipeline signoff is configured
        if (!config.signoff?.pipelineSignoff) {
          throw new Error(
            'Pipeline signoff not configured. Add signoff.pipelineSignoff to your pr-signoff.yml:\n\n' +
              '  signoff:\n' +
              '    defaultSignoffMethod: local\n' +
              '    pipelineSignoff:\n' +
              '      name: "PR Signoff Pipeline"\n' +
              '      azureDevOpsPipelineFolder: "\\\\PR Validation"  # Optional\n' +
              '      pipelineDefinition: ".pipeline/pr-signoff-pipeline.yaml"  # Optional\n',
          );
        }

        const pipelineConfig = config.signoff.pipelineSignoff;
        const pipelineDefinitionPath =
          pipelineConfig.pipelineDefinition || '.pipeline/pr-signoff-pipeline.yaml';

        // Check if pipeline file already exists
        if (fs.existsSync(pipelineDefinitionPath)) {
          if (!options.force) {
            spinner.stop();
            console.log(
              chalk.yellow(`⚠️  Pipeline file already exists at: ${pipelineDefinitionPath}`),
            );

            const overwriteAnswer = await inquirer.prompt([
              {
                type: 'confirm',
                name: 'overwrite',
                message: 'Do you want to overwrite the existing pipeline file?',
                default: false,
              },
            ]);

            if (!overwriteAnswer.overwrite) {
              console.log(chalk.cyan('\n📋 Setup cancelled. Existing pipeline file kept.'));
              console.log('You can manually edit the existing file or use --force to overwrite.');
              return;
            }
          } else {
            spinner.info(`Overwriting existing pipeline file (--force specified)`);
          }
        }

        // Create pipeline from template
        spinner.start('Creating pipeline YAML from template');

        // Get template path
        const templatePath = path.join(__dirname, '../../templates/pr-signoff-pipeline.yml');
        if (!fs.existsSync(templatePath)) {
          throw new Error(`Pipeline template not found at: ${templatePath}`);
        }

        let templateContent = fs.readFileSync(templatePath, 'utf8');

        // Replace the file search section with specific path navigation using detected repo path
        const scopeAnalyzer = createScopeAnalyzer({ verbose: false });
        const scopedFolder = await scopeAnalyzer.detectScopedFolder();

        if (scopedFolder) {
          // Replace the file search section with specific path navigation
          templateContent = templateContent.replace(
            /# Find the pr-signoff configuration file and run from that directory\n {6}CONFIG_FILE=\$\(find[\s\S]*?cd "\$CONFIG_DIR"/m,
            `# Navigate to the specific solution folder\n      cd "${scopedFolder}"`,
          );
        }

        // Ensure the directory exists
        const pipelineDir = path.dirname(pipelineDefinitionPath);
        if (!fs.existsSync(pipelineDir)) {
          fs.mkdirSync(pipelineDir, { recursive: true });
        }

        fs.writeFileSync(pipelineDefinitionPath, templateContent);
        spinner.succeed(`Pipeline YAML created at: ${pipelineDefinitionPath}`);

        // Show setup summary and next steps
        console.log(chalk.green('\n✅ Pipeline file created successfully!'));
        console.log(chalk.cyan('\n📋 Next steps to complete setup:'));
        console.log('1. Commit and push the pipeline file to your repository');
        console.log('2. Register the pipeline: pr-signoff setup register-pr-signoff-pipeline');
        console.log('3. Grant Build Service permissions (see README for details)');

        console.log(chalk.cyan('\n🔄 Using hybrid validation:'));
        console.log('• PRs with "signoff-method-local" tag → validated locally with pr-signoff');
        console.log('• PRs with "signoff-method-pipeline" tag → validated by pipeline');
        console.log('• Create PRs: pr-signoff pr create --validation-mode <local|pipeline>');
        console.log('• Switch modes: pr-signoff pr validation-mode <local|pipeline>');

        console.log(
          '\n' +
            chalk.dim('The pipeline will automatically skip validation for locally-validated PRs.'),
        );
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to setup pipeline: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Register PR signoff pipeline in Azure DevOps
  setup
    .command('register-pr-signoff-pipeline')
    .description('Register the PR signoff pipeline in Azure DevOps')
    .option('--pipeline-name <name>', 'Custom pipeline name (uses config default if not specified)')
    .action(async (options) => {
      showHeader('register pr signoff pipeline');
      const spinner = ora();

      try {
        spinner.start('Loading configuration');
        const config = loadGlobalConfig();
        spinner.succeed('Configuration loaded');

        // Check if pipeline signoff is configured
        if (!config.signoff?.pipelineSignoff) {
          throw new Error(
            'Pipeline signoff not configured in pr-signoff.yaml. Run "pr-signoff setup pr-signoff-pipeline" first.',
          );
        }

        // register-pr-signoff-pipeline is an Azure-DevOps-only command (the
        // GitHub equivalent is configured via Actions + Rulesets directly).
        if (!config.azureDevOps) {
          throw new Error(
            'register-pr-signoff-pipeline requires an azureDevOps block in pr-signoff.yaml. ' +
              'On GitHub, configure the pipeline as a GitHub Actions workflow with a Ruleset-required check.',
          );
        }
        const azureDevOps = config.azureDevOps;

        const pipelineConfig = config.signoff.pipelineSignoff;

        // Get pipeline configuration
        const pipelineName = options.pipelineName || pipelineConfig.name || 'PR Signoff Pipeline';
        const localPipelineDefinitionPath =
          pipelineConfig.pipelineDefinition || '.pipeline/pr-signoff-pipeline.yaml';
        const folderPath = pipelineConfig.azureDevOpsPipelineFolder || '';

        // Validate pipeline file exists locally
        if (!fs.existsSync(localPipelineDefinitionPath)) {
          throw new Error(
            `Pipeline file not found at: ${localPipelineDefinitionPath}. Run "pr-signoff setup pr-signoff-pipeline" first.`,
          );
        }

        // Import execSync for running commands
        const { execSync } = await import('child_process');

        // Get repository information
        spinner.start('Getting repository information');
        const gitRemote = execSync('git config --get remote.origin.url', {
          encoding: 'utf8',
        }).trim();
        const repoName = gitRemote.split('/').pop()?.replace('.git', '') || 'unknown';

        spinner.succeed(`Repository: ${repoName}`);

        // Create the repository-relative pipeline path (should be relative to repo root, not Azure DevOps folder)
        // Use scope analyzer to get the current repository location
        const scopeAnalyzer = createScopeAnalyzer({ verbose: false });
        const scopedFolder = await scopeAnalyzer.detectScopedFolder();

        // Construct the actual repository path to the pipeline file
        const repoPipelinePath = scopedFolder
          ? `${scopedFolder}${localPipelineDefinitionPath}`
          : localPipelineDefinitionPath;

        // Create the pipeline using Azure CLI
        spinner.start(`Creating pipeline: ${pipelineName}`);

        try {
          // Invoke `az` via execa with an argument array (no shell) so config
          // values (pipeline name, org/project, repo, paths) are passed as
          // literal arguments and can't inject shell commands.
          const azArgs = [
            'pipelines',
            'create',
            '--name',
            pipelineName,
            '--organization',
            `https://dev.azure.com/${azureDevOps.organization}`,
            '--project',
            azureDevOps.project,
            '--repository',
            repoName,
            '--repository-type',
            'tfsgit',
            '--yml-path',
            repoPipelinePath,
            '--skip-first-run',
            'true',
          ];
          if (folderPath) {
            azArgs.push('--folder-path', folderPath);
          }

          const { stdout: result } = await execa('az', azArgs);
          const pipelineData = JSON.parse(result);

          spinner.succeed(`Pipeline created: ${pipelineName}`);

          console.log(chalk.green('\n✅ Pipeline registered successfully!'));
          console.log(chalk.bold('Pipeline Name:'), pipelineName);
          console.log(chalk.bold('Pipeline ID:'), pipelineData.id);
          console.log(
            chalk.bold('Pipeline URL:'),
            `https://dev.azure.com/${azureDevOps.organization}/${azureDevOps.project}/_build?definitionId=${pipelineData.id}`,
          );

          console.log(chalk.cyan('\n📋 Pipeline Configuration:'));
          console.log(chalk.bold('YAML File:'), repoPipelinePath);
          console.log(
            chalk.bold('Triggers:'),
            'Configured via YAML (per pipeline YAML trigger rules)',
          );
          console.log(chalk.bold('Condition:'), 'Skips when PR has signoff-method-local tag');

          // Create build validation policy using our existing policy manager
          spinner.start('Creating build validation policy');

          // Resolve the repo's default branch for the policy target
          const gitOps = createGitOperations({ verbose: false });
          const defaultBranch = await gitOps.getDefaultBranch();

          try {
            // Create orchestrator to use the existing policy manager
            const orchestrator = createSignoffOrchestrator(config, { verbose: false });

            // Create the build validation policy for the pipeline
            const buildPolicyResult = await orchestrator.setupPipelineBuildPolicy({
              pipelineId: pipelineData.id,
              pipelineName: pipelineName,
              targetBranch: defaultBranch,
              required: true,
            });

            spinner.succeed('Build validation policy created');

            console.log(chalk.green('\n🔒 Build Validation Policy Created:'));
            console.log(`• Pipeline runs automatically on PRs to ${defaultBranch} branch`);
            console.log('• PR cannot be completed until pipeline passes');
            console.log('• Policy is scoped to the configured folder');
            console.log(chalk.bold('Policy ID:'), buildPolicyResult.policyId);
          } catch (buildPolicyError: unknown) {
            spinner.warn('Build validation policy creation failed');
            console.log(
              chalk.yellow('\n⚠️  Could not create build validation policy automatically'),
            );
            console.log('Error:', describeError(buildPolicyError));
            console.log('\nManual setup required:');
            console.log('1. Go to Project Settings > Branch policies');
            console.log(`2. Select ${defaultBranch} branch`);
            console.log('3. Add "Build validation" policy');
            console.log(`4. Select pipeline: ${pipelineName}`);
            console.log('5. Set as required');
          }

          console.log(chalk.cyan('\n🔧 Required Permissions:'));
          console.log('Ensure Build Service has "Contribute to pull requests" permission:');
          console.log('• Project Settings > Repositories > [Repository] > Security');
          console.log('• Find "[Project] Build Service" user');
          console.log('• Set "Contribute to pull requests" to "Allow"');

          console.log(chalk.green('\n✅ Setup Complete! Ready for hybrid validation'));
          console.log('• Create PRs with: pr-signoff pr create --validation-mode <local|pipeline>');
        } catch (error: unknown) {
          // Check if pipeline already exists (az CLI reports this via message/stderr).
          const stderr = (error as { stderr?: string })?.stderr ?? '';
          if (
            describeError(error).includes('already exists') ||
            stderr.includes('already exists')
          ) {
            spinner.warn('Pipeline already exists');
            console.log(chalk.yellow('\n⚠️  Pipeline with this name already exists'));
            console.log('• Use a different name with --pipeline-name option');
            console.log('• Or delete the existing pipeline in Azure DevOps');
          } else {
            throw error;
          }
        }
      } catch (error: unknown) {
        spinner.fail();
        console.error(chalk.red(`Failed to register pipeline: ${formatErrorForCli(error)}`));
        process.exit(1);
      }
    });

  // Add schema management as a subcommand
  setup.addCommand(createSchemaCommand());

  return setup;
}
