# @immeodk/schema-tools

Generic JSON Schema generation and VS Code integration tools for YAML configuration files.

## Overview

This library provides reusable functionality for:

- **Schema Generation**: Convert TypeScript interfaces to JSON Schema
- **VS Code Integration**: Install schemas for YAML intellisense support
- **Cross-Platform Support**: Works on macOS, Windows, and Linux

## Installation

```bash
npm install @immeodk/schema-tools
```

## Usage

### Schema Generation

Generate JSON Schema from TypeScript interfaces:

```typescript
import { generateAndSaveSchema } from '@immeodk/schema-tools/generator';

const config = {
  toolName: 'my-tool',
  rootInterfaceName: 'MyConfig',
  typesPath: './src/types/config.ts',
  schemaId: 'https://example.com/my-tool-schema.json',
  title: 'My Tool Configuration',
  description: 'Schema for my-tool.yaml files',
};

await generateAndSaveSchema(config, './my-tool-schema.json');
```

### Schema Installation

Install schemas for VS Code intellisense:

```typescript
import {
  installProjectSchema,
  installGlobalSchema,
  getSchemaInfo,
} from '@immeodk/schema-tools/installer';

const config = {
  toolName: 'my-tool',
  schemaFileName: 'my-tool-schema.json',
  yamlPatterns: ['my-tool.yaml', 'my-tool.yml'],
};

// Install locally for current project
await installProjectSchema(config, { verbose: true });

// Or install globally for all projects
await installGlobalSchema(config, { verbose: true });

// Check installation status
const info = await getSchemaInfo(config);
console.log(info);
```

## API Reference

### Types

#### `SchemaGeneratorConfig`

Configuration for schema generation:

- `toolName`: Name of the tool
- `rootInterfaceName`: TypeScript interface to generate from
- `typesPath`: Path to TypeScript file
- `schemaId?`: Optional schema ID URL
- `title?`: Schema title
- `description?`: Schema description
- `tsconfigPath?`: Path to tsconfig.json
- `additionalTypes?`: Additional types to include
- `postProcess?`: Custom post-processing function

#### `SchemaInstallerConfig`

Configuration for schema installation:

- `toolName`: Name of the tool
- `schemaFileName`: Schema file name
- `yamlPatterns`: YAML file patterns to associate
- `bundledSchemaPath?`: Custom path to bundled schema

#### `SchemaInstallerOptions`

Options for installation:

- `verbose?`: Enable verbose logging
- `force?`: Force overwrite existing
- `global?`: Install globally

### Functions

#### `generateSchema(config)`

Generate JSON Schema from TypeScript interfaces.

#### `generateAndSaveSchema(config, outputPath)`

Generate and save schema to file.

#### Installer functions (`@immeodk/schema-tools/installer`)

Each takes a `SchemaInstallerConfig` (plus optional `SchemaInstallerOptions`):

- `installGlobalSchema(config, options?)`: Install globally
- `installProjectSchema(config, options?)`: Install locally
- `uninstallGlobalSchema(config, options?)`: Remove global installation
- `uninstallProjectSchema(config, options?)`: Remove local installation
- `getSchemaInfo(config)`: Get installation status

## Examples

### Creating a CLI Schema Command

```typescript
import { Command } from 'commander';
import { installGlobalSchema, installProjectSchema } from '@immeodk/schema-tools/installer';

const schemaCmd = new Command('schema');

schemaCmd
  .command('install')
  .option('-g, --global', 'Install globally')
  .action(async (options) => {
    const config = {
      toolName: 'my-tool',
      schemaFileName: 'my-tool-schema.json',
      yamlPatterns: ['my-tool.yaml', 'my-tool.yml'],
    };

    const result = options.global
      ? await installGlobalSchema(config, options)
      : await installProjectSchema(config, options);

    console.log(result.message);
  });
```

### Generating Schema in Build Process

```json
{
  "scripts": {
    "generate-schema": "node scripts/generate-schema.js",
    "prepublishOnly": "npm run generate-schema"
  }
}
```

```javascript
// scripts/generate-schema.js
import { generateAndSaveSchema } from '@immeodk/schema-tools/generator';

const config = {
  toolName: 'my-tool',
  rootInterfaceName: 'MyConfig',
  typesPath: './src/types/config.ts',
};

await generateAndSaveSchema(config, './my-tool-schema.json');
```

## License

MIT
