# Contributing to pr-signoff

This package lives inside the `oss-tools` workspace alongside `@immeodk/git-utils`
and `@immeodk/schema-tools`. See the [root CONTRIBUTING.md](../../CONTRIBUTING.md)
for the general setup, everyday checks, coding style, and PR process — this file
only covers what's specific to the `pr-signoff` package.

## Prerequisites

- **Node.js >= 18** (the CLI relies on the global `fetch` and ES2022 features).
- For end-to-end testing against a real provider: the **GitHub CLI** (`gh`) and/or
  the **Azure CLI** (`az`), authenticated to a repository you control.

## Running the CLI locally

To try your local build as the global `pr-signoff` command, link **this package**
specifically — it's the only one in the workspace that defines a `bin`:

```bash
# Option A: from this package's directory
cd packages/pr-signoff
npm run build
npm link

# Option B: from the workspace root, target this package
npm run build
npm link -w @immeodk/pr-signoff
```

After linking, `pr-signoff --help` should resolve to your local build. Use
`npm unlink -g @immeodk/pr-signoff` to remove the link.

> If `pr-signoff` is "not recognized" after linking, you most likely ran
> `npm link` from the workspace root. Re-run it from `packages/pr-signoff`.

## Working across packages

This package depends on `@immeodk/git-utils` and `@immeodk/schema-tools`, resolved
automatically as workspace symlinks (no manual linking step, no `link-libs`
script — npm workspaces handles this). If you're editing those packages' source
alongside pr-signoff, run `npm run build` at the workspace root before re-running
`npm test -w @immeodk/pr-signoff`, since this package imports their compiled
`dist/` output, not their source directly.

## Reporting bugs and requesting features

Use the issue templates under the workspace root's `.github/ISSUE_TEMPLATE/`. For
security issues, follow the root [SECURITY.md](../../SECURITY.md) instead of
opening a public issue.
