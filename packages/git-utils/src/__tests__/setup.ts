/**
 * Test setup for git-utils
 * Global test configuration and utilities
 */

// Set up test environment variables
process.env.NODE_ENV = 'test';

// Mock console methods for cleaner test output
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

// Only show console output if VERBOSE_TESTS is set
if (!process.env.VERBOSE_TESTS) {
  console.log = () => {};
  console.error = () => {};
}

// Cleanup function to restore console
export function restoreConsole() {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
}
