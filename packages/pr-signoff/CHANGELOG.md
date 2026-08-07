# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 2.0.1

### Patch Changes

- Security hardening from a full-repository audit:

  - Scrub likely credentials (GitHub token prefixes, `Bearer`/`Authorization`
    header echoes) from upstream API error bodies before they reach an error
    message or get printed, closing a gap between `SECURITY.md`'s stated
    policy and the actual `HttpError` construction in `lib/platform/http.ts`.
  - Use an unpredictable, exclusively-created temp directory (`mkdtempSync`)
    for the PR-description editor flow in `commands/pr.ts`, instead of a
    `Date.now()`-based filename in the shared temp directory.
  - Document the "Pwn Request" risk in `SECURITY.md`: `signoff.commands` runs
    via a real shell by design, and is loaded from the checked-out working
    tree — so a `pull_request`-triggered CI job against a fork PR is running
    config the PR itself can rewrite. No code change (restricting shell syntax
    would break the feature); this is guidance for how to deploy it safely.

- Changed the release process: `release.yml` no longer tries to open the
  "Version Packages" PR itself (the `immeodk` org disables Actions creating
  PRs org-wide, so that step always failed). A maintainer now runs
  `npm run version-packages` and opens that PR by hand — see
  `CONTRIBUTING.md`'s "Cutting a release" section. Publishing itself is
  unaffected and still fully automated via OIDC Trusted Publishing.

- Updated dependencies
  - @immeodk/git-utils@2.0.1
  - @immeodk/schema-tools@2.0.1

## [2.0.0]

First public release. This package was previously versioned internally
(through 1.7.0) on a private registry; the major version bump marks the
public 1.x line as a clean break, so a `^1.x` range from that internal feed
can never resolve to this public package. Its dependencies on
`@immeodk/git-utils` and `@immeodk/schema-tools` move to `^2.0.0` in lockstep.
Changes prior to this changelog are not tracked here.

- **`engines.node` raised to `>=22.13.0`** — `execa` v10, `chalk` v6, and
  `commander` v15 all require Node.js 22, and `inquirer` v14 specifically
  requires `>=23.5.0 || ^22.13.0 || ^20.17.0`. Node 18/20 are no longer
  supported.
- **`getRepositoryName()` failed against an `actions/checkout` remote** —
  it sets `origin` without a `.git` suffix (e.g.
  `https://github.com/owner/repo`), which the fallback regex required. Made
  the suffix optional, matching the more lenient parsing already used in
  `origin-url.ts`.
