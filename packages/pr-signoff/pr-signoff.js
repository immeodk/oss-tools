#!/usr/bin/env node

/**
 * pr-signoff wrapper script
 *
 * This wrapper provides seamless local development with npm link without requiring rebuilds.
 *
 * How it works:
 * - Development mode: When src/ exists and tsx is available, runs TypeScript directly
 * - Production mode: When published or src/ doesn't exist, runs compiled JavaScript
 *
 * Benefits:
 * - No rebuilds needed during local development with npm link
 * - Instant feedback on code changes
 * - Same command works in both environments
 * - No production impact - published packages use compiled JS
 * - Automatic detection - no manual switching
 */

import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { spawn } from 'child_process';

// Get the directory where this script is located (package root)
const __filename = fileURLToPath(import.meta.url);
const packageRoot = dirname(__filename);

// Check if we're in development mode (source files exist and tsx is available)
const srcExists = existsSync(join(packageRoot, 'src', 'index.ts'));
const nodeModulesExists = existsSync(join(packageRoot, 'node_modules'));
const tsxExists = nodeModulesExists && existsSync(join(packageRoot, 'node_modules', '.bin', 'tsx'));

const isDevelopment = srcExists && tsxExists;

if (isDevelopment) {
  // Development mode: run TypeScript directly with tsx
  const srcEntry = join(packageRoot, 'src', 'index.ts');
  const tsxBin = join(packageRoot, 'node_modules', '.bin', 'tsx');

  // Forward all arguments to tsx with the TypeScript entry point
  const args = [srcEntry, ...process.argv.slice(2)];

  const child = spawn(tsxBin, args, {
    stdio: 'inherit',
    env: process.env,
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('Failed to start development mode:', err.message);
    process.exit(1);
  });
} else {
  // Production mode: run compiled JavaScript
  const distEntry = join(packageRoot, 'dist', 'index.js');

  if (!existsSync(distEntry)) {
    console.error('Error: Compiled files not found. Please run "npm run build" first.');
    process.exit(1);
  }

  // Import and run the compiled module
  import(pathToFileURL(distEntry).href).catch((err) => {
    console.error('Failed to start production mode:', err.message);
    process.exit(1);
  });
}
