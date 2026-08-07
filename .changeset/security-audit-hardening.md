---
'@immeodk/pr-signoff': patch
---

Security hardening from a full-repository audit:

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
