import { describe, test, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Lock the strict TypeScript flags required by the ts-strict-mode skill.
 *
 * If a flag is loosened in tsconfig.json, this test fails. The point is to
 * make any loosening visible in code review — the skill spells out *why*
 * each of these matters.
 *
 * See [.claude/skills/ts-strict-mode/SKILL.md](../../../../../../.claude/skills/ts-strict-mode/SKILL.md).
 */
describe('tsconfig.json — required strict flags', () => {
  const tsconfigPath = path.join(__dirname, '..', '..', '..', 'tsconfig.json');
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  // tsconfig allows JSON-with-comments; strip line comments before parsing.
  const stripped = raw.replace(/(^|\s)\/\/.*$/gm, '$1');
  const tsconfig = JSON.parse(stripped);
  const opts: Record<string, unknown> = tsconfig.compilerOptions ?? {};

  // `strict: true` implies several of the others, but we still assert the
  // individual flags so a future "strict: true but noImplicitAny: false"
  // override (which is technically valid) cannot slip through.
  test.each([
    ['strict', true],
    ['noImplicitAny', true],
    ['strictNullChecks', true],
    ['strictFunctionTypes', true],
    ['noImplicitThis', true],
    ['noUncheckedIndexedAccess', true],
    ['noImplicitOverride', true],
    ['noImplicitReturns', true],
    ['noUnusedLocals', true],
    ['noUnusedParameters', true],
    ['forceConsistentCasingInFileNames', true],
  ])('compilerOptions.%s is %s', (flag, expected) => {
    expect(opts[flag]).toBe(expected);
  });
});
