# Reviewer guide

Notes for maintainers reviewing pull requests to aidit.

## What to check on every PR

- **CI is green** — format, lint, typecheck, tests, build, CLI smoke tests on Node 22 and 24, Linux and macOS.
- **Local-only stays local** — no outbound network requests, telemetry, or analytics. The server must bind to `127.0.0.1` only.
- **Writes go through the safe writer** — any code that modifies a user's config file must use `packages/backend/src/writer/safeWriter.ts` (backup → validate → atomic write). Direct `writeFileSync` on user configs is a blocker.
- **Security-sensitive surfaces** — changes to request handling (`server.ts`), the WebSocket server, path resolution, the skills routes, or anything that spawns processes (`$EDITOR`, `open`) need extra scrutiny for path traversal, command injection, and Host/Origin bypasses. See [SECURITY.md](./SECURITY.md).
- **Format preservation** — edits to JSONC files must keep comments; YAML/TOML round-trips should be covered by tests.
- **Changelog** — user-facing changes have an entry under `[Unreleased]`.

## Agent support PRs

- Every new path is backed by a link to the vendor's documentation.
- Agent ids are kebab-case and stable — renaming one orphans users' registry rows, so it needs a migration.
- Per-OS variants use `~`, `$HOME`, `$XDG_CONFIG_HOME`, or `{WIN_HOME}`, never hard-coded usernames.
- The MCP dialect matches the real file format (key name, field names, how a server is disabled), and there is a test fixture for any new dialect.
- An icon mapping exists in `packages/frontend/src/lib/icons.ts`, and the README table is updated.

## Releasing

1. Move `[Unreleased]` entries in `CHANGELOG.md` to a new version section and update the compare links.
2. Bump `version` in `package.json` (and the `VERSION` constant in `bin/aidit.js` if it is still hard-coded).
3. Commit (`chore(release): vX.Y.Z`), tag `vX.Y.Z`, and push the tag. The release workflow builds, tests, publishes to npm with provenance, and creates the GitHub Release.
4. Update `homebrew/aidit.rb` with the new tarball URL and its `sha256`.

## Useful links

- [README.md](../README.md) — install, usage, development
- [CONTRIBUTING.md](../CONTRIBUTING.md) — setup and how to add an agent
- [AGENTS.md](../AGENTS.md) — codebase conventions for AI agents and humans
