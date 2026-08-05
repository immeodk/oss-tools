/**
 * Simplified unit tests for schema installer
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { existsSync } from 'fs';
import { homedir, platform } from 'os';
import type { SchemaInstallerConfig } from '../../types/index.js';

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    unlink: vi.fn(),
    mkdir: vi.fn(),
  },
}));

vi.mock('os', () => ({
  homedir: vi.fn(),
  platform: vi.fn(),
}));

describe('Schema Installer - Core Functions', () => {
  const baseConfig: SchemaInstallerConfig = {
    toolName: 'test-tool',
    schemaFileName: 'test-schema.json',
    yamlPatterns: ['test.yaml', 'test.yml'],
    bundledSchemaPath: '/path/to/test-schema.json',
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(homedir).mockReturnValue('/Users/test');
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue('{"yaml.schemas": {}}');
  });

  it('should have getSchemaInfo function available', async () => {
    const { getSchemaInfo } = await import('../../installer/schema-installer.js');
    expect(typeof getSchemaInfo).toBe('function');
  });

  it('should have install functions available', async () => {
    const { installGlobalSchema, installProjectSchema } =
      await import('../../installer/schema-installer.js');
    expect(typeof installGlobalSchema).toBe('function');
    expect(typeof installProjectSchema).toBe('function');
  });

  it('should have uninstall functions available', async () => {
    const { uninstallGlobalSchema, uninstallProjectSchema } =
      await import('../../installer/schema-installer.js');
    expect(typeof uninstallGlobalSchema).toBe('function');
    expect(typeof uninstallProjectSchema).toBe('function');
  });

  it('should return schema info', async () => {
    // Mock version info
    vi.mocked(fs.readFile)
      .mockResolvedValueOnce('{"version": "1.0.0"}') // package.json
      .mockResolvedValueOnce('{"version": "1.0.0"}') // global schema
      .mockResolvedValueOnce('{"version": "1.0.0"}'); // local schema

    const { getSchemaInfo } = await import('../../installer/schema-installer.js');
    const info = await getSchemaInfo(baseConfig);

    expect(info).toBeDefined();
    expect(info).toHaveProperty('toolVersion');
    expect(info).toHaveProperty('editors');
    expect(Array.isArray(info.editors)).toBe(true);
    expect(info.editors.length).toBeGreaterThan(0);

    // Check that each editor has the expected properties
    info.editors.forEach((editor) => {
      expect(editor).toHaveProperty('editor');
      expect(editor).toHaveProperty('editorName');
      expect(editor).toHaveProperty('globalInstalled');
      expect(editor).toHaveProperty('localInstalled');
      expect(editor).toHaveProperty('globalPath');
      expect(editor).toHaveProperty('localPath');
      expect(editor).toHaveProperty('globalSettingsPath');
      expect(editor).toHaveProperty('workspaceSettingsPath');
      expect(editor).toHaveProperty('globalSchemaVersion');
      expect(editor).toHaveProperty('localSchemaVersion');
    });
  });

  it('should handle install operations', async () => {
    const schemaContent = '{"type": "object"}';
    vi.mocked(fs.readFile).mockResolvedValue(schemaContent);

    const { installGlobalSchema } = await import('../../installer/schema-installer.js');
    const result = await installGlobalSchema(baseConfig, { force: true });

    expect(result).toBeDefined();
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('message');
  });

  it('should handle platform-specific paths on Windows', async () => {
    vi.mocked(platform).mockReturnValue('win32');
    vi.mocked(homedir).mockReturnValue('C:\\Users\\test');

    const { getSchemaInfo } = await import('../../installer/schema-installer.js');
    const info = await getSchemaInfo(baseConfig);

    // Test that VS Code editor info includes Windows path.
    // Match either separator — production uses native `path.join`, so the
    // result is `\`-separated on Windows runners and `/`-separated elsewhere.
    const vscodeInfo = info.editors.find((e) => e.editor === 'vscode');
    expect(vscodeInfo?.globalSettingsPath).toMatch(/AppData[\\/]Roaming/);
  });

  it('should handle platform-specific paths on macOS', async () => {
    vi.mocked(platform).mockReturnValue('darwin');
    vi.mocked(homedir).mockReturnValue('/Users/test');

    const { getSchemaInfo } = await import('../../installer/schema-installer.js');
    const info = await getSchemaInfo(baseConfig);

    // Test that VS Code editor info includes macOS path.
    // Match either separator — production uses native `path.join`.
    const vscodeInfo = info.editors.find((e) => e.editor === 'vscode');
    expect(vscodeInfo?.globalSettingsPath).toMatch(/Library[\\/]Application Support/);
  });
});
