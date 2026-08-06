# Contributing to oss-tools

Thanks for your interest in improving these tools! This repo is an npm
workspace containing three independently-versioned, independently-published
packages: `@immeodk/git-utils`, `@immeodk/schema-tools`, and
`@immeodk/pr-signoff` (which depends on the other two). This document covers
the shared setup, checks, and conventions across all three. Package-specific
notes live in each package's own `CONTRIBUTING.md` (currently only
`packages/pr-signoff/CONTRIBUTING.md` has anything package-specific to add —
linking the CLI globally for manual testing).

## Prerequisites

- **Node.js >= 22.13.0** (pr-signoff's dependencies — commander, inquirer —
  require it; git-utils/schema-tools alone only need >= 22).
- **npm** (this repo uses npm workspaces — not pnpm, yarn, lerna, or
  Turborepo).
- A working **`git`** binary on `PATH` — `git-utils` shells out to it.
- For pr-signoff's end-to-end testing against a real provider: the **GitHub
  CLI** (`gh`) and/or the **Azure CLI** (`az`), authenticated to a repository
  you control.

## Setup

Install once, from the **repository root** — this installs all three
packages and symlinks the internal dependency (`pr-signoff` → `git-utils` /
`schema-tools`) automatically via npm workspaces:

```bash
npm install
```

> The root `package.json` pins `"overrides": { "@types/node": "^26.1.2" }`.
> Without it, `@changesets/cli` pulls in an ancient `@types/node@^12.7.1`
> (via `@manypkg/get-packages` → `@manypkg/find-root@1.1.0`) that `npm
install` tolerates but `npm ci` rejects as out of sync. `@types/node` is
> compile-time-only, so forcing one version everywhere is safe — don't
> remove this without verifying `npm ci` (not just `npm install`) still
> passes from a clean `node_modules`.

## Everyday checks

Run from the repository root — these fan out across all three packages:

```bash
npm run type-check    # tsc --noEmit, per package
npm run lint          # eslint, workspace-wide
npm run format:check  # prettier --check (use `npm run format` to fix)
npm test              # vitest, per package
npm run build         # tsc -> dist/, per package
```

To scope a command to one package, use npm's `-w` flag, e.g.
`npm test -w @immeodk/git-utils`.

A change is ready for review when type-check, lint, format, tests, and build
all pass. New behaviour must come with tests (see each package's
`src/__tests__`).

## Working across packages (the one real footgun)

`@immeodk/pr-signoff` imports `@immeodk/git-utils` and `@immeodk/schema-tools`
from their **compiled `dist/` output**, not their TypeScript source. npm
workspaces symlinks the packages together, but it does not rebuild them for
you. If you edit `packages/git-utils/src/*` or `packages/schema-tools/src/*`
and then run pr-signoff's tests without rebuilding, you'll be testing against
stale compiled output.

```bash
npm run build                          # rebuild everything, or:
npm run build -w @immeodk/git-utils    # rebuild just the one you changed
npm test -w @immeodk/pr-signoff
```

If a cross-package change doesn't seem to take effect, check
`npm ls @immeodk/git-utils -w @immeodk/pr-signoff` — it should point at the
workspace symlink (`packages/git-utils`), not a registry-resolved copy. It
only falls back to the registry if the workspace package's `version` no
longer satisfies the consumer's declared range.

## Versioning and releases

This repo uses [Changesets](https://github.com/changesets/changesets), not
hand-edited `package.json` versions or `CHANGELOG.md` entries. If your change
affects a published package's behavior — including a docs-only change like a
README edit, since that's what shows on the npm package page — add a
changeset before opening the PR:

```bash
npm run changeset
```

Follow the prompts to pick which package(s) changed and the semver bump
(patch/minor/major — a README-only change with no behavior change is a
`patch`). `git-utils`, `schema-tools`, and `pr-signoff` version
independently — they are **not** locked together. If a changeset bumps
`git-utils` or `schema-tools`, Changesets automatically adds a matching bump
to `pr-signoff`'s dependency range on merge (see `.changeset/config.json`'s
`updateInternalDependencies`).

Do not hand-edit `CHANGELOG.md` or `version` fields — the release workflow
(`.github/workflows/release.yml`) does this from your changesets.

### What happens after your PR merges

Releasing is two merges to `main`, not one, and after the first one you (as a
maintainer) never run `npm publish` by hand:

1. **Your PR merges** (with its `.changeset/*.md` file included). `release.yml`
   runs and, since an unreleased changeset exists, opens or updates an
   automated **"Version Packages" PR** — it bumps the affected package(s)'
   `version` in `package.json` and writes the `CHANGELOG.md` entry from your
   changeset's summary. Nothing publishes yet.
2. **Merge the "Version Packages" PR** (whenever you're ready to actually
   release — it can sit open collecting multiple changesets first). That
   merge re-triggers `release.yml`; this time there's no unreleased
   changeset left, so it runs the publish step instead and pushes the new
   version(s) to npm.

Publishing authenticates via npm's **Trusted Publishing (OIDC)** — the
`release` job declares `environment: NPM` (must match the environment
configured on each package's Trusted Publisher settings on npmjs.com) and
`permissions: id-token: write`, and gets a short-lived token per run. There is
no `NPM_TOKEN` secret involved and no `npm login` step for anyone to run.

## Coding style

- **TypeScript, ESM, functional style.** Prefer exported functions over
  classes unless a class provides clear state-management benefits.
- **No `any` in production code.** Catch blocks use `unknown` and narrow
  before reading properties; validate external input (HTTP responses,
  config) at the boundary with zod (pr-signoff) or a type guard.
- **Errors carry a `cause`.** When rethrowing as a new `Error`, attach the
  original via `{ cause }` so the chain is preserved.
- **External commands use argv arrays**, never interpolated shell strings —
  see [SECURITY.md](SECURITY.md).
- Formatting is owned by Prettier and correctness rules by ESLint — run both
  before opening a PR rather than hand-formatting.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit
  messages (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`).
- Keep the PR description focused on the _why_; the diff shows the _what_.
- Ensure CI is green and the branch is up to date with the target branch
  before requesting review.
- Include a changeset (above) if the change affects a published package.

## Reporting bugs and requesting features

Use the issue templates under `.github/ISSUE_TEMPLATE/`. For security issues,
follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
