# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
