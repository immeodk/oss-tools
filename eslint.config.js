import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

/**
 * ESLint flat config for the oss-tools workspace.
 *
 * Scope: TypeScript sources under each package's `src/`. Formatting is owned by
 * Prettier (`eslint-config-prettier` disables any rules that would conflict),
 * so ESLint only enforces correctness/quality rules. Strictest type checks are
 * already handled by the strict `tsconfig` — this layer adds the lint-only
 * rules on top.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/node_modules/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      '**/*.json',
    ],
  },
  {
    files: ['packages/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // Allow intentionally-unused params/vars when prefixed with `_`
      // (some adapters use `_repo`, `_prId`, etc. to satisfy interface shapes).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Empty catch is allowed (used for "tolerate failure" fall-through paths).
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Tests legitimately use `as any` for mocks/fixtures.
    files: ['packages/**/__tests__/**/*.ts', 'packages/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  eslintConfigPrettier,
);
