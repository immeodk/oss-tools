#!/usr/bin/env tsx

/**
 * Schema generator for pr-signoff
 * Simple wrapper around the shared schema-tools library
 */

import { generateAndSaveSchema } from '@immeodk/schema-tools';

// Generate and save schema using shared library
generateAndSaveSchema(
  {
    toolName: 'pr-signoff',
    rootInterfaceName: 'PrSignoffConfig',
    typesPath: './src/lib/config/config.ts',
    tsconfigPath: './tsconfig.json',
    title: 'PR Signoff Configuration',
    description: 'JSON Schema for pr-signoff.yaml configuration files',
  },
  './pr-signoff-schema.json',
).catch((error: unknown) => {
  console.error(
    'Schema generation failed:',
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
