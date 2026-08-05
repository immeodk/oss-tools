# oss-tools

Three related, independently-versioned and independently-published npm
packages:

| Package                                          | Purpose                                                                                                                | Version |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------- |
| [`@immeodk/git-utils`](packages/git-utils)       | Git validation utilities (state checks, branch/commit helpers) used by other tools.                                    | 2.0.0   |
| [`@immeodk/schema-tools`](packages/schema-tools) | JSON Schema generation from TypeScript + editor (VS Code/Cursor/Rider) YAML intellisense install.                      | 2.0.0   |
| [`@immeodk/pr-signoff`](packages/pr-signoff)     | CLI that runs your CI checks locally and creates Azure DevOps/GitHub status checks. Depends on the two packages above. | 2.0.0   |

If you only need one of these, you can install just that package — they're
published independently. `pr-signoff` pulls in the other two as regular npm
dependencies.

```bash
npm install -g @immeodk/pr-signoff
# or
npm install @immeodk/git-utils
npm install @immeodk/schema-tools
```

## Quick start (working on this repo)

```bash
npm install       # installs all 3 packages; npm workspaces auto-symlinks
                  # the internal dependency (pr-signoff -> git-utils/schema-tools)
npm run build     # compile all 3
npm test          # test all 3
```

This repo uses **plain npm workspaces** — no lerna, pnpm, or Turborepo. See
[CONTRIBUTING.md](CONTRIBUTING.md) for the full dev loop.

## License

MIT — see [LICENSE](LICENSE).
