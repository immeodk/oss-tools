import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/__tests__/', 'coverage/', '**/*.config.js', '**/*.config.ts'],
      thresholds: {
        global: {
          statements: 80,
          branches: 75,
          functions: 80,
          lines: 80,
        },
      },
    },

    // Test environment
    environment: 'node',

    // Global test utilities
    globals: true,

    // Test file patterns
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],

    // Test timeout
    testTimeout: 10000,

    // Setup files
    setupFiles: ['src/__tests__/setup.ts'],
  },
});
