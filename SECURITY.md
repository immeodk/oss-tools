# Security Policy

This workspace publishes three packages: `@immeodk/git-utils`,
`@immeodk/schema-tools`, and `@immeodk/pr-signoff`. This policy covers all
three; each has its own "scope and threat model" section below since their
attack surfaces differ.

## Supported versions

Security fixes are applied to the latest released version of each package.
Please upgrade before reporting an issue.

| Package                 | Supported | Unsupported |
| ----------------------- | --------- | ----------- |
| `@immeodk/git-utils`    | 2.0.x     | < 2.0       |
| `@immeodk/schema-tools` | 2.0.x     | < 2.0       |
| `@immeodk/pr-signoff`   | 2.0.x     | < 2.0       |

These are the first public releases — each package was previously versioned
internally on a private registry, and the major version bump to 2.0.0 marks
a clean break so a stale internal reference can never resolve to the public
package.

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, email **klm@immeo.dk** with:

- Which package is affected.
- A description of the vulnerability and its impact.
- Steps to reproduce (proof-of-concept if possible).
- The affected version and Node.js version (and, for pr-signoff, the platform
  — Azure DevOps or GitHub).

You can expect an initial acknowledgement within a few business days. We will
keep you informed as we work on a fix and will credit you in the release notes
unless you prefer to remain anonymous.

When sharing reproduction steps, **redact any real tokens, tenant IDs, private
repository names, or absolute filesystem paths** that could identify your
environment.

## Scope and threat model — `@immeodk/git-utils`

This library is a thin wrapper around the local `git` binary. It performs no
network calls of its own, reads no credentials, and persists no state.

- **`git` is invoked via `execa` with an argv array** — never an interpolated
  shell string. Branch names, remote names, and other caller-supplied inputs
  are passed as discrete arguments, so they cannot break out into the shell.
  If you find a code path where a caller-controlled value reaches a shell, or
  where `execa`'s `shell` option is enabled, treat it as a security issue.
- **No secrets are read or logged.** Verbose mode echoes the `git` invocation
  and its stdout/stderr; it does not read tokens, environment secrets, or
  config files.
- **Out of scope:** vulnerabilities in `git` itself, in `execa`, or in the
  consumer's repository contents. Report those upstream.

## Scope and threat model — `@immeodk/schema-tools`

- **Filesystem writes (installer).** `installGlobalSchema` and
  `installProjectSchema` write schema files and edit editor settings JSON in
  paths derived from `os.homedir()` and `process.cwd()`. The `schemaFileName`
  and `bundledSchemaPath` come from the caller. If you find a code path where
  a caller-controlled value escapes the intended directory (path traversal,
  symlink follow into a sensitive location, write to an unintended absolute
  path), treat it as a security issue.
- **Schema generation via `ts-json-schema-generator`.** `generateSchema` reads
  the caller-supplied `typesPath` and `tsconfigPath` and invokes the
  TypeScript compiler over them. The caller controls these inputs; do not
  pass paths derived from untrusted user input. Vulnerabilities in
  `ts-json-schema-generator` or `typescript` themselves should be reported
  upstream.
- **Out of scope:** vulnerabilities in `chalk`, `ts-json-schema-generator`,
  `typescript`, Node.js, or the editors whose settings files this library
  edits.

## Scope and threat model — `@immeodk/pr-signoff`

This tool reads short-lived access tokens from the environment and from local
CLI auth (`gh auth token` and `az account get-access-token`) to call the Azure
DevOps and GitHub REST APIs.

- **Tokens are never logged.** Output (including verbose mode) is scrubbed of
  credentials. If you find a path where a token can leak into logs, terminal
  output, or error messages, treat it as a security issue.
- **No tokens are persisted.** They are held in memory for the duration of a
  command and used only as `Authorization` headers over HTTPS.
- **Config is treated as untrusted input.** Repository owner/repo and Azure
  organization/project values are validated to reject path-traversal and
  shell metacharacters. Reports of validation bypasses are in scope.
- **External commands use argument arrays**, never interpolated shell
  strings. Report any place where user- or config-controlled input reaches a
  shell.
