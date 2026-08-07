/**
 * Unit tests for main index exports
 */

import { describe, it, expect } from 'vitest';

describe('Schema Tools Index', () => {
  it('should export all expected functions and types', async () => {
    const schemaTools = await import('../index.js');

    // Check that all expected exports are available
    expect(schemaTools).toHaveProperty('generateSchema');
    expect(schemaTools).toHaveProperty('generateAndSaveSchema');
    expect(schemaTools).toHaveProperty('installGlobalSchema');
    expect(schemaTools).toHaveProperty('installProjectSchema');
    expect(schemaTools).toHaveProperty('uninstallGlobalSchema');
    expect(schemaTools).toHaveProperty('uninstallProjectSchema');
    expect(schemaTools).toHaveProperty('getSchemaInfo');

    // Check that exports are functions
    expect(typeof schemaTools.generateSchema).toBe('function');
    expect(typeof schemaTools.generateAndSaveSchema).toBe('function');
    expect(typeof schemaTools.installGlobalSchema).toBe('function');
    expect(typeof schemaTools.installProjectSchema).toBe('function');
    expect(typeof schemaTools.uninstallGlobalSchema).toBe('function');
    expect(typeof schemaTools.uninstallProjectSchema).toBe('function');
    expect(typeof schemaTools.getSchemaInfo).toBe('function');
  });

  it('should export generator functions', async () => {
    const generator = await import('../generator/index.js');

    expect(generator).toHaveProperty('generateSchema');
    expect(generator).toHaveProperty('generateAndSaveSchema');
    expect(typeof generator.generateSchema).toBe('function');
    expect(typeof generator.generateAndSaveSchema).toBe('function');
  });

  it('should export installer functions', async () => {
    const installer = await import('../installer/index.js');

    expect(installer).toHaveProperty('installGlobalSchema');
    expect(installer).toHaveProperty('installProjectSchema');
    expect(installer).toHaveProperty('uninstallGlobalSchema');
    expect(installer).toHaveProperty('uninstallProjectSchema');
    expect(installer).toHaveProperty('getSchemaInfo');

    expect(typeof installer.installGlobalSchema).toBe('function');
    expect(typeof installer.installProjectSchema).toBe('function');
    expect(typeof installer.uninstallGlobalSchema).toBe('function');
    expect(typeof installer.uninstallProjectSchema).toBe('function');
    expect(typeof installer.getSchemaInfo).toBe('function');
  });
});
