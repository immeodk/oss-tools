/**
 * Core types for generic schema tools
 */

/**
 * Supported editors for schema installation
 */
export type EditorType = 'vscode' | 'cursor' | 'rider';

/**
 * Editor-specific configuration
 */
export interface EditorConfig {
  /** Human-readable editor name */
  name: string;

  /** Function to get global settings path */
  getGlobalSettingsPath: () => string;

  /** Function to get workspace settings path */
  getWorkspaceSettingsPath: () => string;

  /** Function to get schema directory path */
  getSchemaDirectory: () => string;

  /** Function to create schema mapping for this editor */
  createSchemaMapping: (schemaPath: string, patterns: string[]) => Record<string, unknown>;

  /** Settings key where schema mappings are stored */
  schemaSettingsKey: string;
}

/**
 * Configuration for schema generation
 */
export interface SchemaGeneratorConfig {
  /** Name of the tool (e.g., 'pr-signoff', 'dotpipeline') */
  toolName: string;

  /** Root TypeScript interface name to generate schema from */
  rootInterfaceName: string;

  /** Path to TypeScript file containing the interfaces */
  typesPath: string;

  /** Optional schema ID URL for $schema references */
  schemaId?: string;

  /** Schema title */
  title?: string;

  /** Schema description */
  description?: string;

  /** Path to tsconfig.json file */
  tsconfigPath?: string;

  /** Additional type names to include in schema generation */
  additionalTypes?: string[];

  /** Custom schema post-processing function */
  postProcess?: (schema: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * Configuration for schema installation
 */
export interface SchemaInstallerConfig {
  /** Name of the tool (e.g., 'pr-signoff', 'dotpipeline') */
  toolName: string;

  /** Schema filename (e.g., 'pr-signoff-schema.json') */
  schemaFileName: string;

  /** YAML file patterns to associate with schema (e.g., ['pr-signoff.yaml', 'pr-signoff.yml']) */
  yamlPatterns: string[];

  /** Path to bundled schema file in the package */
  bundledSchemaPath?: string;
}

/**
 * Options for schema installation
 */
export interface SchemaInstallerOptions {
  /** Enable verbose logging */
  verbose?: boolean;

  /** Force overwrite existing installations */
  force?: boolean;

  /** Install globally instead of locally */
  global?: boolean;

  /** Target editor (defaults to 'vscode') */
  editor?: EditorType;

  /** Install for all supported editors */
  allEditors?: boolean;
}

/**
 * Result of schema installation operation
 */
export interface SchemaInstallResult {
  /** Whether the operation was successful */
  success: boolean;

  /** Human-readable message about the operation */
  message: string;

  /** Path where schema was installed */
  schemaPath?: string;

  /** Path to VS Code settings file that was updated */
  settingsPath?: string;
}

/**
 * Editor-specific schema information
 */
export interface EditorSchemaInfo {
  /** Editor type */
  editor: EditorType;

  /** Editor name */
  editorName: string;

  /** Whether schema is installed globally for this editor */
  globalInstalled: boolean;

  /** Whether schema is installed locally for this editor */
  localInstalled: boolean;

  /** Path to global schema location */
  globalPath: string;

  /** Path to local schema location */
  localPath: string;

  /** Path to editor's global settings */
  globalSettingsPath: string;

  /** Path to editor's workspace settings */
  workspaceSettingsPath: string;

  /** Global schema version if installed */
  globalSchemaVersion?: string;

  /** Local schema version if installed */
  localSchemaVersion?: string;
}

/**
 * Schema installation status information
 */
export interface SchemaInfo {
  /** Tool version from package.json */
  toolVersion?: string;

  /** Information for each supported editor */
  editors: EditorSchemaInfo[];
}
