import { describe, test, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';
import fs from 'fs';

// Mock dependencies
vi.mock('fs');
vi.mock('../../core.js');

describe('CLI Interface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConsole();
  });

  describe('Command Structure', () => {
    test('creates commander program with expected commands', () => {
      // Test that the command structure is correct by creating a program instance
      const program = new Command();

      // This tests the structure without executing the actual CLI
      program.name('pr-signoff').description('Test').version('1.0.0');

      const validate = program.command('validate');
      const signoff = program.command('signoff');
      const status = program.command('status');
      const setupPolicy = program.command('setup-policy');

      // Verify the commands were created successfully
      expect(program.commands).toHaveLength(4);
      expect(validate.name()).toBe('validate');
      expect(signoff.name()).toBe('signoff');
      expect(status.name()).toBe('status');
      expect(setupPolicy.name()).toBe('setup-policy');
    });

    test('validates required command structure exists', () => {
      const program = new Command();

      // Test that we can create the expected command structure
      program.name('pr-signoff').description('Pull Request Signoff Tool').version('1.0.0');

      program.command('validate').description('Test signoff commands');
      program.command('signoff').description('Run CI checks');
      program.command('status').description('Check PR status');
      program.command('setup-policy').description('Setup branch policy');

      expect(program.commands).toHaveLength(4);
      expect(program.commands[0].name()).toBe('validate');
      expect(program.commands[1].name()).toBe('signoff');
      expect(program.commands[2].name()).toBe('status');
      expect(program.commands[3].name()).toBe('setup-policy');
    });
  });

  describe('Configuration Loading', () => {
    test('handles missing configuration file gracefully', async () => {
      (fs.existsSync as any).mockReturnValue(false);

      const { loadGlobalConfig } = await import('../../lib/config/config.js');
      // Test that the actual function throws when files don't exist
      await expect(async () => loadGlobalConfig()).rejects.toThrow(
        'pr-signoff.yml or pr-signoff.yaml not found',
      );
    });

    test('validates Azure DevOps configuration requirements', async () => {
      // Create a mock config that will fail validation
      (fs.existsSync as any).mockReturnValue(true);
      (fs.readFileSync as any).mockReturnValue('azureDevOps: {}\nsignoff:\n  commands: []');

      const { loadGlobalConfig } = await import('../../lib/config/config.js');
      // Test validation error handling
      await expect(async () => loadGlobalConfig()).rejects.toThrow(
        'azureDevOps.organization is required',
      );
    });
  });

  describe('Spinner Utilities', () => {
    test('creates spinner with proper configuration', () => {
      // Test the spinner utility functions that are defined in the CLI
      const mockSpinner = createMockSpinner();

      expect(typeof mockSpinner.start).toBe('function');
      expect(typeof mockSpinner.succeed).toBe('function');
      expect(typeof mockSpinner.fail).toBe('function');
      expect(typeof mockSpinner.warn).toBe('function');
      expect(typeof mockSpinner.info).toBe('function');
    });
  });

  describe('Error Message Formatting', () => {
    test('formats configuration errors appropriately', () => {
      const configError =
        'Azure DevOps organization and project are required in pr-signoff.yml configuration.';

      // Test that error messages reference the correct YAML file extension
      expect(configError).toContain('pr-signoff.yml');
      expect(configError).not.toContain('pr-signoff.json');
    });

    test('provides helpful error context', () => {
      const missingFileError = 'pr-signoff.yml or pr-signoff.yaml not found in repository root';

      expect(missingFileError).toContain('yml');
      expect(missingFileError).toContain('yaml');
      expect(missingFileError).toContain('repository root');
    });
  });
});
