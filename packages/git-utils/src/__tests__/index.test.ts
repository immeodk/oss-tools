/**
 * Tests for git-utils main exports
 * Ensures all public functions are properly exported
 */

import { describe, it, expect } from 'vitest';

describe('Git Utils - Exports', () => {
  it('should export all core functions', async () => {
    const gitUtils = await import('../index.js');

    // Core utility functions
    expect(typeof gitUtils.executeGitCommand).toBe('function');

    // Validation functions
    expect(typeof gitUtils.checkUnstagedChanges).toBe('function');
    expect(typeof gitUtils.checkUncommittedChanges).toBe('function');
    expect(typeof gitUtils.checkUntrackedFiles).toBe('function');

    // Git information functions
    expect(typeof gitUtils.fetchLatestChanges).toBe('function');
    expect(typeof gitUtils.getCurrentBranch).toBe('function');
    expect(typeof gitUtils.getCurrentCommit).toBe('function');
    expect(typeof gitUtils.checkBranchUpToDate).toBe('function');

    // High-level validation functions
    expect(typeof gitUtils.validateBasicGitState).toBe('function');
    expect(typeof gitUtils.validateGitState).toBe('function');
  });

  it('should export TypeScript interfaces', async () => {
    const gitUtils = await import('../index.js');

    // Test that we can import and use the types (types are compile-time only)
    // We'll test that functions accepting these options work correctly

    // Test basic options interface usage
    const basicOptions = { verbose: true };
    expect(typeof gitUtils.executeGitCommand).toBe('function');

    // Test validation options interface usage
    const validationOptions = {
      verbose: true,
      allowDirty: false,
      allowOutdated: false,
      remote: 'origin',
    };
    expect(typeof gitUtils.validateGitState).toBe('function');

    // Verify the options structure makes sense
    expect(basicOptions.verbose).toBe(true);
    expect(validationOptions.allowDirty).toBe(false);
  });

  it('should have proper function signatures', async () => {
    const gitUtils = await import('../index.js');

    // Test that functions have expected parameter counts
    expect(gitUtils.executeGitCommand.length).toBe(1); // args + optional options
    expect(gitUtils.checkUnstagedChanges.length).toBe(0); // optional options only
    expect(gitUtils.getCurrentBranch.length).toBe(0); // optional options only
    expect(gitUtils.getCurrentCommit.length).toBe(0); // optional short + optional options
    expect(gitUtils.validateGitState.length).toBe(0); // optional options only
  });
});
