/**
 * Generic TypeScript to JSON Schema generator
 */

import { resolve, dirname } from 'path';
import { writeFileSync, existsSync } from 'fs';
import { promises as fs } from 'fs';
import { createGenerator, Config as TsJsonSchemaConfig } from 'ts-json-schema-generator';
import chalk from 'chalk';
import type { SchemaGeneratorConfig } from '../types/index.js';

/**
 * Generate JSON Schema from TypeScript interfaces
 */
export async function generateSchema(config: SchemaGeneratorConfig): Promise<object> {
  const {
    toolName,
    rootInterfaceName,
    typesPath,
    schemaId,
    title,
    description,
    tsconfigPath,
    postProcess,
  } = config;

  console.log(chalk.blue(`📘 Generating ${toolName} schema from TypeScript interfaces...`));

  // Resolve paths
  const resolvedTypesPath = resolve(typesPath);
  const resolvedTsConfigPath = tsconfigPath
    ? resolve(tsconfigPath)
    : resolve(dirname(resolvedTypesPath), '../tsconfig.json');

  // Create schema generator configuration
  const generatorConfig: TsJsonSchemaConfig = {
    path: resolvedTypesPath,
    type: rootInterfaceName,
    schemaId,
    tsconfig: resolvedTsConfigPath,
    skipTypeCheck: true,
    expose: 'export',
    jsDoc: 'extended',
    additionalProperties: false,
    sortProps: true,
  };

  try {
    // Create generator instance
    const generator = createGenerator(generatorConfig);

    // Generate schema for the root interface
    const schema = generator.createSchema(rootInterfaceName);

    if (!schema) {
      throw new Error(`Failed to generate schema for ${rootInterfaceName}`);
    }

    // Get tool version for schema metadata
    let toolVersion: string | undefined;
    try {
      // Look for package.json starting from current working directory
      let currentDir = process.cwd();
      while (currentDir !== dirname(currentDir)) {
        const packagePath = resolve(currentDir, 'package.json');
        if (existsSync(packagePath)) {
          const packageContent = await fs.readFile(packagePath, 'utf-8');
          const packageJson = JSON.parse(packageContent);
          toolVersion = packageJson.version;
          break;
        }
        currentDir = dirname(currentDir);
      }
    } catch {
      // Ignore version lookup errors
    }

    // Add metadata
    const enhancedSchema: Record<string, unknown> = {
      ...schema,
      title: title || `${toolName} configuration`,
      description:
        description ||
        `Schema for ${toolName} configuration files - Generated from TypeScript definitions`,
    };

    // Add version if available (JSON Schema allows custom properties)
    if (toolVersion) {
      enhancedSchema.version = toolVersion;
    }

    // Apply custom post-processing if provided
    const finalSchema = postProcess ? postProcess(enhancedSchema) : enhancedSchema;

    console.log(chalk.green('✓ Schema generated from TypeScript definitions'));
    console.log(chalk.dim(`  Root interface: ${rootInterfaceName}`));
    console.log(chalk.dim(`  Config file: ${resolvedTypesPath}`));

    return finalSchema;
  } catch (error) {
    console.error(
      chalk.red(
        `✗ Schema generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    );
    throw error;
  }
}

/**
 * Generate and save JSON Schema to file
 */
export async function generateAndSaveSchema(
  config: SchemaGeneratorConfig,
  outputPath: string,
): Promise<void> {
  try {
    // Generate the schema
    const schema = await generateSchema(config);

    // Write to file with pretty formatting
    writeFileSync(outputPath, JSON.stringify(schema, null, 2));

    console.log(chalk.green('✓ Schema saved successfully'));
    console.log(chalk.dim(`  Location: ${resolve(outputPath)}`));
    console.log(chalk.blue(`\n🧪 Generated ${config.toolName} schema is ready for validation`));
    console.log(
      chalk.dim(`\nUse schema for intellisense in your ${config.toolName} configuration files`),
    );
  } catch (error) {
    console.error(
      chalk.red(
        `✗ Failed to save schema: ${error instanceof Error ? error.message : 'Unknown error'}`,
      ),
    );
    throw error;
  }
}

/**
 * Create a schema generator function with preset configuration
 */
export function createSchemaGenerator(defaultConfig: Partial<SchemaGeneratorConfig>) {
  return async (overrides?: Partial<SchemaGeneratorConfig>): Promise<object> => {
    const mergedConfig = { ...defaultConfig, ...overrides } as SchemaGeneratorConfig;
    return generateSchema(mergedConfig);
  };
}
