/**
 * @immeodk/schema-tools
 *
 * Generic JSON Schema generation and VS Code integration tools
 * for YAML configuration files
 */

// Export all types
export * from './types/index.js';

// Export generator functionality
export {
  generateSchema,
  generateAndSaveSchema,
  createSchemaGenerator,
} from './generator/schema-generator.js';

// Export installer functionality
export {
  installGlobalSchema,
  installProjectSchema,
  uninstallGlobalSchema,
  uninstallProjectSchema,
  getSchemaInfo,
} from './installer/schema-installer.js';

// Export editor configuration functionality
export {
  getEditorConfig,
  getSupportedEditors,
  getDefaultEditor,
} from './editor-configs/editor-configs.js';
