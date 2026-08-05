import { Command } from 'commander';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import {
  installGlobalSchema,
  installProjectSchema,
  uninstallGlobalSchema,
  uninstallProjectSchema,
  getSchemaInfo,
  getSupportedEditors,
  getDefaultEditor,
  getEditorConfig,
  SchemaInstallerConfig,
  SchemaInstallerOptions,
  EditorType,
} from '@immeodk/schema-tools';
import { showHeader } from '../lib/core/header.js';

/**
 * Schema management commands for pr-signoff
 * Provides manual install/uninstall/info commands as fallback to automatic installation
 */

/**
 * Get the path to the bundled schema file, resolving it relative to the package directory
 */
function getBundledSchemaPath(): string {
  // In production (compiled), this will be dist/commands/schema.js
  // In development, this will be src/commands/schema.ts
  const currentModuleUrl = import.meta.url;
  const currentModulePath = fileURLToPath(currentModuleUrl);
  const currentDir = dirname(currentModulePath);

  // Navigate to package root (../../ from dist/commands/ or src/commands/)
  const packageRoot = join(currentDir, '..', '..');

  return join(packageRoot, 'pr-signoff-schema.json');
}

export function createSchemaCommand(): Command {
  const schemaCommand = new Command('schema');
  schemaCommand.description('Manage JSON Schema for pr-signoff.yaml files');

  // Install command
  schemaCommand
    .command('install')
    .description('Install JSON Schema for IDE intellisense')
    .option('-g, --global', 'Install schema globally instead of current project')
    .option('-f, --force', 'Force overwrite existing schema')
    .option('-v, --verbose', 'Show detailed installation steps')
    .option(
      '-e, --editor <editor>',
      `Target editor (${getSupportedEditors().join(', ')}) [default: ${getDefaultEditor()}]`,
    )
    .option('-a, --all-editors', 'Install for all supported editors')
    .action(async (options) => {
      showHeader('pr-signoff schema install');
      const config: SchemaInstallerConfig = {
        toolName: 'pr-signoff',
        schemaFileName: 'pr-signoff-schema.json',
        yamlPatterns: ['pr-signoff.yaml', 'pr-signoff.yml'],
        bundledSchemaPath: getBundledSchemaPath(),
      };

      const installerOptions: SchemaInstallerOptions = {
        verbose: options.verbose,
        force: options.force,
        editor: options.editor as EditorType,
        allEditors: options.allEditors || false,
      };

      const targetDescription = options.allEditors
        ? 'all supported editors'
        : `${options.editor || getDefaultEditor()}`;
      console.log(chalk.blue(`📋 Installing pr-signoff JSON Schema for ${targetDescription}...`));

      try {
        const result = options.global
          ? await installGlobalSchema(config, installerOptions)
          : await installProjectSchema(config, installerOptions);

        if (result.success) {
          console.log(chalk.green(`✓ ${result.message}`));
          if (result.schemaPath) {
            console.log(chalk.dim(`  Schema: ${result.schemaPath}`));
          }
          if (result.settingsPath) {
            console.log(chalk.dim(`  Settings: ${result.settingsPath}`));
          }

          // Show extension requirements
          const editor = options.editor || getDefaultEditor();
          if (options.allEditors) {
            console.log(chalk.yellow('\n📋 Extension Requirements:'));
            console.log(
              chalk.dim('  VS Code/Cursor: Install "YAML Language Support by Red Hat" extension'),
            );
            console.log(
              chalk.dim('  JetBrains Rider: Built-in support (manual configuration required)'),
            );
          } else {
            if (editor === 'vscode' || editor === 'cursor') {
              console.log(chalk.yellow('\n💡 Extension Required:'));
              console.log(
                chalk.dim(
                  `  Install "YAML Language Support by Red Hat" extension in ${getEditorConfig(editor).name}`,
                ),
              );
            } else if (editor === 'rider') {
              console.log(chalk.yellow('\n💡 Manual Setup Required:'));
              console.log(
                chalk.dim(
                  '  Configure schema in Rider: File > Settings > Languages & Frameworks > Schemas and DTDs > JSON Schema Mappings',
                ),
              );
            }
          }
        } else {
          console.log(chalk.red(`✗ ${result.message}`));
          process.exit(1);
        }
      } catch (error) {
        console.log(
          chalk.red(
            `✗ Installation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ),
        );
        process.exit(1);
      }
    });

  // Uninstall command
  schemaCommand
    .command('uninstall')
    .description('Uninstall JSON Schema and remove IDE configuration')
    .option('-g, --global', 'Uninstall global schema instead of project schema')
    .option(
      '-e, --editor <editor>',
      `Target editor (${getSupportedEditors().join(', ')}) [default: ${getDefaultEditor()}]`,
    )
    .option('-a, --all-editors', 'Uninstall from all supported editors')
    .option('-v, --verbose', 'Show detailed uninstallation steps')
    .action(async (options) => {
      showHeader('pr-signoff schema uninstall');
      const config: SchemaInstallerConfig = {
        toolName: 'pr-signoff',
        schemaFileName: 'pr-signoff-schema.json',
        yamlPatterns: ['pr-signoff.yaml', 'pr-signoff.yml'],
        bundledSchemaPath: getBundledSchemaPath(),
      };

      const installerOptions: SchemaInstallerOptions = {
        verbose: options.verbose,
        editor: options.editor as EditorType,
        allEditors: options.allEditors || false,
      };

      const targetDescription = options.allEditors
        ? 'all supported editors'
        : `${options.editor || getDefaultEditor()}`;
      console.log(
        chalk.blue(`📋 Uninstalling pr-signoff JSON Schema from ${targetDescription}...`),
      );

      try {
        const result = options.global
          ? await uninstallGlobalSchema(config, installerOptions)
          : await uninstallProjectSchema(config, installerOptions);

        if (result.success) {
          console.log(chalk.green(`✓ ${result.message}`));
        } else {
          console.log(chalk.red(`✗ ${result.message}`));
          process.exit(1);
        }
      } catch (error) {
        console.log(
          chalk.red(
            `✗ Uninstallation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ),
        );
        process.exit(1);
      }
    });

  // Info command
  schemaCommand
    .command('info')
    .description('Show schema installation status and paths')
    .action(async () => {
      showHeader('pr-signoff schema info');
      const config: SchemaInstallerConfig = {
        toolName: 'pr-signoff',
        schemaFileName: 'pr-signoff-schema.json',
        yamlPatterns: ['pr-signoff.yaml', 'pr-signoff.yml'],
        bundledSchemaPath: getBundledSchemaPath(),
      };

      try {
        const info = await getSchemaInfo(config);

        console.log(chalk.blue('📋 pr-signoff Schema Installation Status\n'));

        // Tool version
        if (info.toolVersion) {
          console.log(chalk.bold('Tool Information:'));
          console.log(`  Version: ${chalk.green(info.toolVersion)}\n`);
        }

        // Show information for each editor
        for (const editorInfo of info.editors) {
          console.log(chalk.bold(`${editorInfo.editorName}:`));

          // Global installation
          console.log(chalk.dim('  Global:'));
          console.log(
            `    Status: ${editorInfo.globalInstalled ? chalk.green('✓ Installed') : chalk.yellow('✗ Not installed')}`,
          );
          if (editorInfo.globalInstalled) {
            const globalVersion = editorInfo.globalSchemaVersion || 'missing';
            const isLatest = editorInfo.globalSchemaVersion === info.toolVersion;
            const versionColor = isLatest ? chalk.green : chalk.yellow;
            console.log(`    Schema Version: ${versionColor(globalVersion)}`);
          }
          console.log(chalk.dim(`    Schema: ${editorInfo.globalPath}`));
          console.log(chalk.dim(`    Settings: ${editorInfo.globalSettingsPath}`));

          // Local installation
          console.log(chalk.dim('  Local:'));
          console.log(
            `    Status: ${editorInfo.localInstalled ? chalk.green('✓ Installed') : chalk.yellow('✗ Not installed')}`,
          );
          if (editorInfo.localInstalled) {
            const localVersion = editorInfo.localSchemaVersion || 'missing';
            const isLatest = editorInfo.localSchemaVersion === info.toolVersion;
            const versionColor = isLatest ? chalk.green : chalk.yellow;
            console.log(`    Schema Version: ${versionColor(localVersion)}`);
          }
          console.log(chalk.dim(`    Schema: ${editorInfo.localPath}`));
          console.log(chalk.dim(`    Settings: ${editorInfo.workspaceSettingsPath}`));
          console.log(); // Empty line between editors
        }

        // Installation instructions
        const hasAnyInstallation = info.editors.some((e) => e.globalInstalled || e.localInstalled);
        if (!hasAnyInstallation) {
          console.log(chalk.yellow('💡 To enable intellisense, run:'));
          console.log(
            chalk.dim(
              '  pr-signoff schema install --global           # Install globally for VS Code',
            ),
          );
          console.log(
            chalk.dim('  pr-signoff schema install --all-editors      # Install for all editors'),
          );
          console.log(
            chalk.dim(
              '  pr-signoff schema install --editor cursor    # Install for specific editor',
            ),
          );
          console.log(
            chalk.dim(
              '  pr-signoff schema install                    # Install locally for VS Code',
            ),
          );
        }
      } catch (error) {
        console.log(
          chalk.red(
            `✗ Failed to get schema info: ${error instanceof Error ? error.message : 'Unknown error'}`,
          ),
        );
        process.exit(1);
      }
    });

  // Update command
  schemaCommand
    .command('update')
    .description('Update existing schema installation')
    .option('-g, --global', 'Update global schema instead of project schema')
    .option(
      '-e, --editor <editor>',
      `Target editor (${getSupportedEditors().join(', ')}) [default: ${getDefaultEditor()}]`,
    )
    .option('-a, --all-editors', 'Update for all supported editors')
    .option('-v, --verbose', 'Show detailed update steps')
    .action(async (options) => {
      showHeader('pr-signoff schema update');
      const config: SchemaInstallerConfig = {
        toolName: 'pr-signoff',
        schemaFileName: 'pr-signoff-schema.json',
        yamlPatterns: ['pr-signoff.yaml', 'pr-signoff.yml'],
        bundledSchemaPath: getBundledSchemaPath(),
      };

      const installerOptions: SchemaInstallerOptions = {
        verbose: options.verbose,
        force: true, // Always force update
        editor: options.editor as EditorType,
        allEditors: options.allEditors || false,
      };

      const targetDescription = options.allEditors
        ? 'all supported editors'
        : `${options.editor || getDefaultEditor()}`;
      console.log(chalk.blue(`📋 Updating pr-signoff JSON Schema for ${targetDescription}...`));

      try {
        const result = options.global
          ? await installGlobalSchema(config, installerOptions)
          : await installProjectSchema(config, installerOptions);

        if (result.success) {
          console.log(chalk.green(`✓ ${result.message}`));
          if (result.schemaPath) {
            console.log(chalk.dim(`  Schema: ${result.schemaPath}`));
          }
          if (result.settingsPath) {
            console.log(chalk.dim(`  Settings: ${result.settingsPath}`));
          }
        } else {
          console.log(chalk.red(`✗ ${result.message}`));
          process.exit(1);
        }
      } catch (error) {
        console.log(
          chalk.red(`✗ Update failed: ${error instanceof Error ? error.message : 'Unknown error'}`),
        );
        process.exit(1);
      }
    });

  return schemaCommand;
}
