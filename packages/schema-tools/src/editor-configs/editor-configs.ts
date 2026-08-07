/**
 * Editor-specific configurations for schema installation
 */

import { join } from 'path';
import { homedir, platform } from 'os';
import type { EditorType, EditorConfig } from '../types/index.js';

/**
 * VS Code editor configuration
 * Note: "Global" settings are user-specific, not system-wide
 */
const vscodeConfig: EditorConfig = {
  name: 'VS Code',

  getGlobalSettingsPath: () => {
    const homeDir = homedir();
    switch (platform()) {
      case 'darwin': // macOS
        return join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'settings.json');
      case 'win32': // Windows
        return join(homeDir, 'AppData', 'Roaming', 'Code', 'User', 'settings.json');
      default: // Linux and others
        return join(homeDir, '.config', 'Code', 'User', 'settings.json');
    }
  },

  getWorkspaceSettingsPath: () => {
    return join(process.cwd(), '.vscode', 'settings.json');
  },

  getSchemaDirectory: () => {
    // User-specific schema directory
    return join(homedir(), '.vscode', 'schemas');
  },

  createSchemaMapping: (schemaPath: string, patterns: string[]) => {
    // Use relative path instead of file:// URL for better cross-platform compatibility
    // VS Code handles relative paths better than file:// URLs, especially on Windows
    let relativePath: string;

    if (schemaPath.startsWith(process.cwd())) {
      // Convert absolute path within workspace to relative path
      relativePath =
        './' +
        schemaPath
          .replace(process.cwd(), '')
          .replace(/^[\\/]/, '')
          .replace(/\\/g, '/');
    } else {
      // For paths outside workspace, just normalize separators (avoid file:// URLs)
      relativePath = schemaPath.replace(/\\/g, '/');
    }

    return {
      [relativePath]: patterns.map((p) => `**/${p}`),
    };
  },

  schemaSettingsKey: 'yaml.schemas',
};

/**
 * Cursor editor configuration (uses VS Code-compatible settings)
 * Note: These are user-specific paths, not system-global
 */
const cursorConfig: EditorConfig = {
  name: 'Cursor',

  getGlobalSettingsPath: () => {
    const homeDir = homedir();
    switch (platform()) {
      case 'darwin': // macOS
        return join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'settings.json');
      case 'win32': // Windows - follows VS Code pattern
        return join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'settings.json');
      default: // Linux and others
        return join(homeDir, '.config', 'Cursor', 'User', 'settings.json');
    }
  },

  getWorkspaceSettingsPath: () => {
    // Cursor uses .vscode for workspace settings (VS Code compatible)
    return join(process.cwd(), '.vscode', 'settings.json');
  },

  getSchemaDirectory: () => {
    const homeDir = homedir();
    switch (platform()) {
      case 'darwin': // macOS
        return join(homeDir, 'Library', 'Application Support', 'Cursor', 'User', 'schemas');
      case 'win32': // Windows - follows VS Code pattern
        return join(homeDir, 'AppData', 'Roaming', 'Cursor', 'User', 'schemas');
      default: // Linux and others
        return join(homeDir, '.config', 'Cursor', 'User', 'schemas');
    }
  },

  createSchemaMapping: (schemaPath: string, patterns: string[]) => {
    // Use relative path instead of file:// URL for better cross-platform compatibility
    // Cursor (VS Code compatible) handles relative paths better than file:// URLs, especially on Windows
    let relativePath: string;

    if (schemaPath.startsWith(process.cwd())) {
      // Convert absolute path within workspace to relative path
      relativePath =
        './' +
        schemaPath
          .replace(process.cwd(), '')
          .replace(/^[\\/]/, '')
          .replace(/\\/g, '/');
    } else {
      // For paths outside workspace, just normalize separators (avoid file:// URLs)
      relativePath = schemaPath.replace(/\\/g, '/');
    }

    return {
      [relativePath]: patterns.map((p) => `**/${p}`),
    };
  },

  schemaSettingsKey: 'yaml.schemas',
};

/**
 * JetBrains Rider configuration
 * Note: Rider has built-in JSON/YAML schema support but requires manual IDE configuration
 */
const riderConfig: EditorConfig = {
  name: 'JetBrains Rider',

  getGlobalSettingsPath: () => {
    // Rider doesn't use external JSON config files for schemas
    // Schema configuration is done through the IDE settings
    return 'IDE Settings (File > Settings > Languages & Frameworks > Schemas and DTDs > JSON Schema Mappings)';
  },

  getWorkspaceSettingsPath: () => {
    // Rider stores project settings in .idea directory but not in a format we can modify externally
    return 'IDE Project Settings (not externally configurable)';
  },

  getSchemaDirectory: () => {
    const homeDir = homedir();
    switch (platform()) {
      case 'darwin': // macOS
        return join(homeDir, 'Library', 'Application Support', 'JetBrains', 'Rider', 'schemas');
      case 'win32': // Windows
        return join(homeDir, 'AppData', 'Roaming', 'JetBrains', 'Rider', 'schemas');
      default: // Linux
        return join(homeDir, '.config', 'JetBrains', 'Rider', 'schemas');
    }
  },

  createSchemaMapping: (schemaPath: string, patterns: string[]) => {
    // Rider doesn't use external JSON for schema mapping
    // Return instructions for manual setup
    return {
      instructions: `To configure in Rider:
1. File > Settings > Languages & Frameworks > Schemas and DTDs > JSON Schema Mappings
2. Click '+' to add new mapping
3. Schema file: ${schemaPath}
4. File path patterns: ${patterns.join(', ')}`,
    };
  },

  schemaSettingsKey: 'manual_configuration',
};

/**
 * Map of editor types to their configurations
 */
export const editorConfigs: Record<EditorType, EditorConfig> = {
  vscode: vscodeConfig,
  cursor: cursorConfig,
  rider: riderConfig,
};

/**
 * Get editor configuration by type
 */
export function getEditorConfig(editor: EditorType): EditorConfig {
  return editorConfigs[editor];
}

/**
 * Get all supported editor types
 */
export function getSupportedEditors(): EditorType[] {
  return Object.keys(editorConfigs) as EditorType[];
}

/**
 * Get default editor (VS Code)
 */
export function getDefaultEditor(): EditorType {
  return 'vscode';
}
