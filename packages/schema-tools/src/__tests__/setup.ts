/**
 * Test setup for schema-tools
 */

import { beforeEach, afterEach, vi } from 'vitest';

beforeEach(() => {
  // Mock console.log to reduce test noise
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  // Restore console methods
  vi.restoreAllMocks();
});
