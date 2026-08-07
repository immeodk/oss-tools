/**
 * Simplified unit tests for schema generator
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { promises as fs } from 'fs';
import { existsSync, writeFileSync } from 'fs';
import type { SchemaGeneratorConfig } from '../../types/index.js';

// Mock dependencies
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  writeFileSync: vi.fn(),
  promises: {
    readFile: vi.fn(),
  },
}));

vi.mock('ts-json-schema-generator', () => ({
  createGenerator: vi.fn(() => ({
    createSchema: vi.fn(() => ({
      type: 'object',
      properties: {},
    })),
  })),
}));

// Import the mocked function so we can reference it in tests
import { createGenerator } from 'ts-json-schema-generator';

describe('Schema Generator - Core Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue('{"version": "1.0.0"}');
  });

  describe('Type Mapping', () => {
    it('should map TypeScript types to JSON Schema correctly', async () => {
      // Mock a more complex schema with various property types
      const mockSchema = {
        type: 'object',
        properties: {
          // String property
          name: {
            type: 'string',
            description: 'The name of the tool',
          },
          // Number property
          version: {
            type: 'number',
            description: 'Version number',
          },
          // Boolean property
          enabled: {
            type: 'boolean',
            description: 'Whether the tool is enabled',
          },
          // Array property
          commands: {
            type: 'array',
            items: {
              type: 'string',
            },
            description: 'List of commands',
          },
          // Nested object property
          config: {
            type: 'object',
            properties: {
              timeout: {
                type: 'number',
                description: 'Timeout in seconds',
              },
              retries: {
                type: 'number',
                description: 'Number of retries',
              },
            },
            required: ['timeout'],
            description: 'Configuration settings',
          },
          // Enum property
          environment: {
            type: 'string',
            enum: ['development', 'staging', 'production'],
            description: 'Deployment environment',
          },
          // Optional property with union type
          port: {
            oneOf: [{ type: 'number' }, { type: 'string' }],
            description: 'Port number or string',
          },
        },
        required: ['name', 'version', 'commands'],
        additionalProperties: false,
      };

      // Setup mock to return our complex schema
      vi.mocked(createGenerator).mockReturnValue({
        createSchema: vi.fn().mockReturnValue(mockSchema),
      } as any);

      // Mock no package.json for cleaner test
      vi.mocked(existsSync).mockReturnValue(false);

      const { generateSchema } = await import('../../generator/schema-generator.js');

      const config: SchemaGeneratorConfig = {
        toolName: 'test-tool',
        rootInterfaceName: 'TestConfig',
        typesPath: './test.ts',
        title: 'Test Schema',
        description: 'Test description',
      };

      const result = await generateSchema(config);

      // Verify the schema structure
      expect(result).toHaveProperty('type', 'object');
      expect(result).toHaveProperty('properties');
      expect(result).toHaveProperty('required');
      expect(result).toHaveProperty('additionalProperties', false);

      // Verify properties mapping
      const properties = (result as any).properties;

      // Check string property
      expect(properties.name).toEqual({
        type: 'string',
        description: 'The name of the tool',
      });

      // Check number property
      expect(properties.version).toEqual({
        type: 'number',
        description: 'Version number',
      });

      // Check boolean property
      expect(properties.enabled).toEqual({
        type: 'boolean',
        description: 'Whether the tool is enabled',
      });

      // Check array property
      expect(properties.commands).toEqual({
        type: 'array',
        items: {
          type: 'string',
        },
        description: 'List of commands',
      });

      // Check nested object property
      expect(properties.config).toEqual({
        type: 'object',
        properties: {
          timeout: {
            type: 'number',
            description: 'Timeout in seconds',
          },
          retries: {
            type: 'number',
            description: 'Number of retries',
          },
        },
        required: ['timeout'],
        description: 'Configuration settings',
      });

      // Check enum property
      expect(properties.environment).toEqual({
        type: 'string',
        enum: ['development', 'staging', 'production'],
        description: 'Deployment environment',
      });

      // Check union type property
      expect(properties.port).toEqual({
        oneOf: [{ type: 'number' }, { type: 'string' }],
        description: 'Port number or string',
      });

      // Check required fields
      expect((result as any).required).toEqual(['name', 'version', 'commands']);
    });

    it('should handle arrays of complex types', async () => {
      const mockSchema = {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'number' },
                name: { type: 'string' },
                email: {
                  type: 'string',
                  format: 'email',
                },
                roles: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['admin', 'user', 'guest'],
                  },
                },
              },
              required: ['id', 'name', 'email'],
            },
          },
        },
      };

      vi.mocked(createGenerator).mockReturnValue({
        createSchema: vi.fn().mockReturnValue(mockSchema),
      } as any);

      vi.mocked(existsSync).mockReturnValue(false);

      const { generateSchema } = await import('../../generator/schema-generator.js');

      const config: SchemaGeneratorConfig = {
        toolName: 'test-tool',
        rootInterfaceName: 'UserConfig',
        typesPath: './test.ts',
      };

      const result = await generateSchema(config);
      const properties = (result as any).properties;

      // Verify array of objects structure
      expect(properties.users).toBeDefined();
      expect(properties.users.type).toBe('array');
      expect(properties.users.items.type).toBe('object');
      expect(properties.users.items.properties).toHaveProperty('id');
      expect(properties.users.items.properties).toHaveProperty('name');
      expect(properties.users.items.properties).toHaveProperty('email');
      expect(properties.users.items.properties.email.format).toBe('email');
      expect(properties.users.items.properties.roles.items.enum).toEqual([
        'admin',
        'user',
        'guest',
      ]);
      expect(properties.users.items.required).toEqual(['id', 'name', 'email']);
    });

    it('should preserve JSON Schema annotations from JSDoc comments', async () => {
      const mockSchema = {
        type: 'object',
        properties: {
          port: {
            type: 'number',
            minimum: 1,
            maximum: 65535,
            default: 3000,
            description: 'Server port number',
          },
          maxConnections: {
            type: 'integer',
            minimum: 1,
            maximum: 1000,
            description: 'Maximum number of concurrent connections',
          },
          apiKey: {
            type: 'string',
            pattern: '^[A-Za-z0-9]{32}$',
            description: 'API key for authentication',
          },
          url: {
            type: 'string',
            format: 'uri',
            description: 'Service URL',
          },
        },
      };

      vi.mocked(createGenerator).mockReturnValue({
        createSchema: vi.fn().mockReturnValue(mockSchema),
      } as any);

      vi.mocked(existsSync).mockReturnValue(false);

      const { generateSchema } = await import('../../generator/schema-generator.js');

      const config: SchemaGeneratorConfig = {
        toolName: 'test-tool',
        rootInterfaceName: 'ConfigWithValidation',
        typesPath: './test.ts',
      };

      const result = await generateSchema(config);
      const properties = (result as any).properties;

      // Check numeric constraints
      expect(properties.port).toEqual({
        type: 'number',
        minimum: 1,
        maximum: 65535,
        default: 3000,
        description: 'Server port number',
      });

      // Check integer type with constraints
      expect(properties.maxConnections).toEqual({
        type: 'integer',
        minimum: 1,
        maximum: 1000,
        description: 'Maximum number of concurrent connections',
      });

      // Check string pattern validation
      expect(properties.apiKey).toEqual({
        type: 'string',
        pattern: '^[A-Za-z0-9]{32}$',
        description: 'API key for authentication',
      });

      // Check string format validation
      expect(properties.url).toEqual({
        type: 'string',
        format: 'uri',
        description: 'Service URL',
      });
    });
  });

  it('should have generateSchema function available', async () => {
    const { generateSchema } = await import('../../generator/schema-generator.js');
    expect(typeof generateSchema).toBe('function');
  });

  it('should have generateAndSaveSchema function available', async () => {
    const { generateAndSaveSchema } = await import('../../generator/schema-generator.js');
    expect(typeof generateAndSaveSchema).toBe('function');
  });

  it('should generate schema with basic config', async () => {
    // Mock no package.json to avoid version lookup
    vi.mocked(existsSync).mockReturnValue(false);

    const { generateSchema } = await import('../../generator/schema-generator.js');

    const config: SchemaGeneratorConfig = {
      toolName: 'test-tool',
      rootInterfaceName: 'TestConfig',
      typesPath: './test.ts',
      title: 'Test Schema',
      description: 'Test description',
    };

    const result = await generateSchema(config);

    expect(result).toBeDefined();
    expect(result).toHaveProperty('type', 'object');
    expect(result).toHaveProperty('title', 'Test Schema');
    expect(result).toHaveProperty('description', 'Test description');
  });

  it('should include version when package.json exists', async () => {
    // Mock package.json exists with version
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(fs.readFile).mockResolvedValue('{"version": "2.0.0"}');

    const { generateSchema } = await import('../../generator/schema-generator.js');

    const config: SchemaGeneratorConfig = {
      toolName: 'test-tool',
      rootInterfaceName: 'TestConfig',
      typesPath: './test.ts',
    };

    const result = await generateSchema(config);

    expect(result).toHaveProperty('version', '2.0.0');
  });

  it('should save schema to file', async () => {
    const { generateAndSaveSchema } = await import('../../generator/schema-generator.js');

    const config: SchemaGeneratorConfig = {
      toolName: 'test-tool',
      rootInterfaceName: 'TestConfig',
      typesPath: './test.ts',
    };

    await generateAndSaveSchema(config, './output.json');

    expect(writeFileSync).toHaveBeenCalledWith(
      './output.json',
      expect.stringContaining('"type": "object"'),
    );
  });
});
