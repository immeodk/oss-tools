/**
 * Generic JSON Schema installer for VS Code intellisense support
 * Functional approach for consistency
 */

import { promises as fs } from 'fs';
import { resolve, join, dirname } from 'path';
import { pathToFileURL } from 'url';
import { existsSync, mkdirSync } from 'fs';
import chalk from 'chalk';
import {
  getEditorConfig,
  getSupportedEditors,
  getDefaultEditor,
} from '../editor-configs/editor-configs.js';
import type {
  SchemaInstallerConfig,
  SchemaInstallerOptions,
  SchemaInstallResult,
  SchemaInfo,
  EditorSchemaInfo,
  EditorType,
} from '../types/index.js';

/**
 * Get the bundled schema file path from the npm package
 */
function getBundledSchemaPath(config: SchemaInstallerConfig): string {
  if (config.bundledSchemaPath) {
    return resolve(config.bundledSchemaPath);
  }
  // Default: assume schema is at package root
  return resolve(process.cwd(), config.schemaFileName);
}

/**
 * Get global schema directory path for a specific editor
 */
function getGlobalSchemaPath(config: SchemaInstallerConfig, editor: EditorType): string {
  const editorConfig = getEditorConfig(editor);
  return join(editorConfig.getSchemaDirectory(), config.schemaFileName);
}

/**
 * Get project-local schema path
 */
function getProjectSchemaPath(config: SchemaInstallerConfig): string {
  return resolve(process.cwd(), config.schemaFileName);
}

/**
 * Get editor settings path (platform-specific)
 */
function getEditorSettingsPath(editor: EditorType, isGlobal: boolean): string {
  const editorConfig = getEditorConfig(editor);
  return isGlobal ? editorConfig.getGlobalSettingsPath() : editorConfig.getWorkspaceSettingsPath();
}

// Removed - now handled by getEditorSettingsPath

/**
 * Log message if verbose mode is enabled
 */
function log(
  message: string,
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions,
): void {
  if (options.verbose) {
    console.log(chalk.dim(`[${config.toolName}] ${message}`));
  }
}

/**
 * Update editor settings with YAML schema mapping
 */
async function updateEditorSettings(
  settingsPath: string,
  schemaMapping: Record<string, unknown>,
  editor: EditorType,
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions,
): Promise<void> {
  try {
    let settings: Record<string, unknown> = {};

    // Read existing settings if they exist
    if (existsSync(settingsPath)) {
      const settingsContent = await fs.readFile(settingsPath, 'utf8');
      try {
        const parsed: unknown = JSON.parse(settingsContent);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          settings = parsed as Record<string, unknown>;
        }
      } catch {
        // If settings file is corrupted, start fresh
        settings = {};
      }
    }

    const editorConfig = getEditorConfig(editor);
    const key = editorConfig.schemaSettingsKey;

    // Ensure schema settings key exists
    if (!settings[key]) {
      settings[key] = editor === 'rider' ? [] : {};
    }

    // Add our schema mappings (handle different formats)
    if (editor === 'rider') {
      // Rider uses an array format
      const existing = settings[key];
      const incoming = Array.isArray(schemaMapping.schemas) ? schemaMapping.schemas : [];
      if (Array.isArray(existing)) {
        existing.push(...incoming);
      }
    } else {
      // VS Code and Cursor use object format
      const existing = settings[key];
      if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        Object.assign(existing, schemaMapping);
      }
    }

    // Write updated settings
    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    log(`Updated ${editorConfig.name} settings: ${settingsPath}`, config, options);
  } catch (error) {
    const editorConfig = getEditorConfig(editor);
    log(
      `Warning: Could not update ${editorConfig.name} settings automatically: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      config,
      options,
    );
    log(`You can manually add this to your ${editorConfig.name} settings:`, config, options);
    log(
      JSON.stringify({ [editorConfig.schemaSettingsKey]: schemaMapping }, null, 2),
      config,
      options,
    );
  }
}

/**
 * Remove schema mapping from editor settings
 */
async function removeFromEditorSettings(
  settingsPath: string,
  schemaKey: string,
  editor: EditorType,
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions,
): Promise<void> {
  try {
    if (!existsSync(settingsPath)) {
      return;
    }

    const settingsContent = await fs.readFile(settingsPath, 'utf8');
    const parsed: unknown = JSON.parse(settingsContent);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return;
    }
    const settings = parsed as Record<string, unknown>;

    const editorConfig = getEditorConfig(editor);
    const key = editorConfig.schemaSettingsKey;

    if (editor === 'rider') {
      // Rider uses array format - remove matching schema
      const current = settings[key];
      if (Array.isArray(current)) {
        settings[key] = current.filter(
          (schema) =>
            !schema ||
            typeof schema !== 'object' ||
            (schema as { url?: unknown }).url !== schemaKey,
        );
      }
    } else {
      // VS Code and Cursor use object format
      const current = settings[key];
      if (current && typeof current === 'object' && !Array.isArray(current)) {
        const obj = current as Record<string, unknown>;
        if (obj[schemaKey] !== undefined) {
          delete obj[schemaKey];

          // Remove schema settings if empty
          if (Object.keys(obj).length === 0) {
            delete settings[key];
          }
        }
      }
    }

    await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2));
    log(
      `Removed schema mapping from ${editorConfig.name} settings: ${settingsPath}`,
      config,
      options,
    );
  } catch (error) {
    log(
      `Warning: Could not update ${getEditorConfig(editor).name} settings: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`,
      config,
      options,
    );
  }
}

/**
 * Install schema globally for specified editor(s)
 */
export async function installGlobalSchema(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions = {},
): Promise<SchemaInstallResult> {
  const editor = options.editor || getDefaultEditor();

  if (options.allEditors) {
    return await installForAllEditors(config, { ...options, global: true });
  }

  return await installForSingleEditor(config, editor, { ...options, global: true });
}

/**
 * Install schema globally for a single editor
 */
async function installForSingleEditor(
  config: SchemaInstallerConfig,
  editor: EditorType,
  options: SchemaInstallerOptions,
): Promise<SchemaInstallResult> {
  try {
    const editorConfig = getEditorConfig(editor);
    const bundledSchemaPath = getBundledSchemaPath(config);
    const schemaPath = options.global
      ? getGlobalSchemaPath(config, editor)
      : getProjectSchemaPath(config);
    const settingsPath = getEditorSettingsPath(editor, options.global || false);

    // Check if bundled schema exists
    if (!existsSync(bundledSchemaPath)) {
      return {
        success: false,
        message: `Schema file not found. Run "npm run schema" to generate it first.`,
      };
    }

    // Check if already installed and not forcing
    if (existsSync(schemaPath) && !options.force) {
      const scope = options.global ? 'Global' : 'Local';
      return {
        success: true,
        message: `${scope} schema already installed for ${editorConfig.name}`,
      };
    }

    // Create schemas directory
    mkdirSync(dirname(schemaPath), { recursive: true });

    // Copy schema to location
    await fs.copyFile(bundledSchemaPath, schemaPath);
    log(`Schema installed to: ${schemaPath}`, config, options);

    // Create editor-specific schema mapping
    const schemaMapping = options.global
      ? editorConfig.createSchemaMapping(
          schemaPath,
          config.yamlPatterns.map((p) => `**/${p}`),
        )
      : editorConfig.createSchemaMapping(schemaPath, config.yamlPatterns);

    // Update editor settings (if supported)
    if (editor === 'rider') {
      // Rider requires manual configuration
      log('Rider schema configuration requires manual setup:', config, options);
      const instructions =
        typeof schemaMapping.instructions === 'string' ? schemaMapping.instructions : '';
      log(instructions, config, options);
    } else {
      await updateEditorSettings(settingsPath, schemaMapping, editor, config, options);
    }

    const scope = options.global ? 'globally' : 'locally';
    let message = `Schema installed ${scope} for ${editorConfig.name}`;

    if (editor === 'rider') {
      message += ' - Manual IDE configuration required (see instructions above)';
    } else {
      message += ' and configured for intellisense';
    }

    return {
      success: true,
      message,
      schemaPath,
      settingsPath: editor === 'rider' ? undefined : settingsPath,
    };
  } catch (error) {
    const scope = options.global ? 'Global' : 'Local';
    return {
      success: false,
      message: `${scope} installation failed for ${getEditorConfig(editor).name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Install schema locally for specified editor(s)
 */
export async function installProjectSchema(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions = {},
): Promise<SchemaInstallResult> {
  const editor = options.editor || getDefaultEditor();

  if (options.allEditors) {
    return await installForAllEditors(config, { ...options, global: false });
  }

  return await installForSingleEditor(config, editor, { ...options, global: false });
}

/**
 * Install schema for all supported editors
 */
async function installForAllEditors(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions,
): Promise<SchemaInstallResult> {
  const editors = getSupportedEditors();
  const results: SchemaInstallResult[] = [];

  for (const editor of editors) {
    const result = await installForSingleEditor(config, editor, options);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  if (failureCount === 0) {
    const scope = options.global ? 'globally' : 'locally';
    return {
      success: true,
      message: `Schema installed ${scope} for all ${editors.length} supported editors`,
    };
  } else if (successCount > 0) {
    const scope = options.global ? 'globally' : 'locally';
    return {
      success: true,
      message: `Schema installed ${scope} for ${successCount}/${editors.length} editors (${failureCount} failed)`,
    };
  } else {
    const scope = options.global ? 'Global' : 'Local';
    return {
      success: false,
      message: `${scope} installation failed for all editors`,
    };
  }
}

/**
 * Uninstall global schema for specified editor(s)
 */
export async function uninstallGlobalSchema(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions = {},
): Promise<SchemaInstallResult> {
  const editor = options.editor || getDefaultEditor();

  if (options.allEditors) {
    return await uninstallForAllEditors(config, { ...options, global: true });
  }

  return await uninstallForSingleEditor(config, editor, { ...options, global: true });
}

/**
 * Uninstall schema for a single editor
 */
async function uninstallForSingleEditor(
  config: SchemaInstallerConfig,
  editor: EditorType,
  options: SchemaInstallerOptions,
): Promise<SchemaInstallResult> {
  try {
    const editorConfig = getEditorConfig(editor);
    const schemaPath = options.global
      ? getGlobalSchemaPath(config, editor)
      : getProjectSchemaPath(config);
    const settingsPath = getEditorSettingsPath(editor, options.global || false);

    // Remove schema file
    if (existsSync(schemaPath)) {
      await fs.unlink(schemaPath);
      log(`Removed schema: ${schemaPath}`, config, options);
    }

    // Remove from editor settings
    const schemaKey = pathToFileURL(schemaPath).href;
    await removeFromEditorSettings(settingsPath, schemaKey, editor, config, options);

    const scope = options.global ? 'Global' : 'Local';
    return {
      success: true,
      message: `${scope} schema uninstalled successfully from ${editorConfig.name}`,
    };
  } catch (error) {
    const scope = options.global ? 'Global' : 'Local';
    return {
      success: false,
      message: `${scope} uninstall failed for ${getEditorConfig(editor).name}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Uninstall local schema for specified editor(s)
 */
export async function uninstallProjectSchema(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions = {},
): Promise<SchemaInstallResult> {
  const editor = options.editor || getDefaultEditor();

  if (options.allEditors) {
    return await uninstallForAllEditors(config, { ...options, global: false });
  }

  return await uninstallForSingleEditor(config, editor, { ...options, global: false });
}

/**
 * Uninstall schema for all supported editors
 */
async function uninstallForAllEditors(
  config: SchemaInstallerConfig,
  options: SchemaInstallerOptions,
): Promise<SchemaInstallResult> {
  const editors = getSupportedEditors();
  const results: SchemaInstallResult[] = [];

  for (const editor of editors) {
    const result = await uninstallForSingleEditor(config, editor, options);
    results.push(result);
  }

  const successCount = results.filter((r) => r.success).length;
  const failureCount = results.length - successCount;

  const scope = options.global ? 'Global' : 'Local';
  if (failureCount === 0) {
    return {
      success: true,
      message: `${scope} schema uninstalled from all ${editors.length} supported editors`,
    };
  } else if (successCount > 0) {
    return {
      success: true,
      message: `${scope} schema uninstalled from ${successCount}/${editors.length} editors (${failureCount} failed)`,
    };
  } else {
    return {
      success: false,
      message: `${scope} uninstall failed for all editors`,
    };
  }
}

/**
 * Read version from a schema file
 */
async function getSchemaVersion(schemaPath: string): Promise<string | undefined> {
  try {
    if (!existsSync(schemaPath)) {
      return undefined;
    }
    const schemaContent = await fs.readFile(schemaPath, 'utf-8');
    const schema = JSON.parse(schemaContent);
    return schema.version || schema.$id || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get tool version from package.json
 */
async function getToolVersion(config?: SchemaInstallerConfig): Promise<string | undefined> {
  try {
    // If config with bundled schema path is provided, use that to find package.json
    if (config?.bundledSchemaPath) {
      const schemaPath = resolve(config.bundledSchemaPath);
      const packagePath = join(dirname(schemaPath), 'package.json');
      if (existsSync(packagePath)) {
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        return packageJson.version;
      }
    }

    // Fallback: Look for package.json in current directory or parent directories
    let currentDir = process.cwd();
    while (currentDir !== dirname(currentDir)) {
      const packagePath = join(currentDir, 'package.json');
      if (existsSync(packagePath)) {
        const packageContent = await fs.readFile(packagePath, 'utf-8');
        const packageJson = JSON.parse(packageContent);
        return packageJson.version;
      }
      currentDir = dirname(currentDir);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Get schema installation information for all editors
 */
export async function getSchemaInfo(config: SchemaInstallerConfig): Promise<SchemaInfo> {
  const editors = getSupportedEditors();
  const toolVersion = await getToolVersion(config);

  const editorInfos = await Promise.all(
    editors.map(async (editor): Promise<EditorSchemaInfo> => {
      const editorConfig = getEditorConfig(editor);
      const globalSchemaPath = getGlobalSchemaPath(config, editor);
      const projectSchemaPath = getProjectSchemaPath(config);

      const [globalSchemaVersion, localSchemaVersion] = await Promise.all([
        getSchemaVersion(globalSchemaPath),
        getSchemaVersion(projectSchemaPath),
      ]);

      return {
        editor,
        editorName: editorConfig.name,
        globalInstalled: existsSync(globalSchemaPath),
        localInstalled: existsSync(projectSchemaPath),
        globalPath: globalSchemaPath,
        localPath: projectSchemaPath,
        globalSettingsPath: editorConfig.getGlobalSettingsPath(),
        workspaceSettingsPath: editorConfig.getWorkspaceSettingsPath(),
        globalSchemaVersion,
        localSchemaVersion,
      };
    }),
  );

  return {
    toolVersion,
    editors: editorInfos,
  };
}
