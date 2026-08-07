# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.2]

First public release. This package was previously versioned internally on a
private registry; the major version bump marks the public 1.x line as a
clean break, so a `^1.x` range from that internal feed can never resolve to
this public package. Changes prior to this changelog are not tracked here.

- **`engines.node` raised to `>=22`** — `execa` was bumped to v10, which
  requires Node.js 22. Node 18/20 are not supported.
