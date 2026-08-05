// Global test setup
import { vi, beforeEach, afterEach } from 'vitest';

declare global {
  function mockConsole(): typeof console;
  function createMockSpinner(): MockSpinner;
}

interface MockSpinner {
  start: ReturnType<typeof vi.fn>;
  succeed: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  info: ReturnType<typeof vi.fn>;
  text: string;
}

// Mock console methods for cleaner test output
global.mockConsole = () => {
  const originalConsole = { ...console };
  let logSpy: any, warnSpy: any, errorSpy: any;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    if (logSpy) logSpy.mockRestore();
    if (warnSpy) warnSpy.mockRestore();
    if (errorSpy) errorSpy.mockRestore();
  });

  return originalConsole;
};

// Global test utilities
global.createMockSpinner = (): MockSpinner => ({
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis(),
  warn: vi.fn().mockReturnThis(),
  info: vi.fn().mockReturnThis(),
  text: '',
});

// Environment setup
process.env.NODE_ENV = 'test';
