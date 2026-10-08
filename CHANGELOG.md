# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-10-08

### Added

- MCP **dialect engine**: aidit reads and writes each agent's own layout — `mcpServers` (JSON), VS Code `servers`, opencode/Kilo `mcp`, Crush `mcp`, Codex TOML `mcp_servers`, Mistral Vibe `[[mcp_servers]]`, Zed `context_servers`, Amp `amp.mcpServers`, Goose `extensions` and Continue's YAML list.
- TOML config support (Codex, Mistral Vibe, Grok Build).
- New agents: OpenAI Codex, Google Antigravity, GitHub Copilot CLI, Kiro, Kilo Code, Crush, Amp, Qwen Code, Factory Droid, JetBrains Junie, Warp, Mistral Vibe, Kimi Code, Grok Build, LM Studio, and the shared Agent Skills folders (`~/.agents/skills`, `.agents/skills`).
- Skills paths for Claude Code, Codex, Cursor, Copilot, Antigravity, Gemini CLI, Devin Desktop/Windsurf, Kiro, Cline, Roo, opencode, Crush, Amp, Goose, Factory and Vibe.
- `POST /api/config/:id/servers` for structured add / edit / rename / toggle / delete, translated into the target agent's format.
- Copying servers between agents in Diff & Sync now converts between formats (e.g. Cursor JSON → Codex TOML).
- `aidit start --no-open`, `AIDIT_DATA_DIR` environment variable, graceful shutdown.
- Agent catalog with display names and homepages; scan results now carry the agent's real name.
- Test suite for dialects, mutations, validation, registry sync, end-to-end scan/write and server security.
- OSS project files: contributing guide, code of conduct, issue forms, Dependabot, release workflow, CODEOWNERS.

### Changed

- **Node.js 22.13+ is required.** The database now uses the built-in `node:sqlite`; the native `better-sqlite3` dependency (which failed to build on recent Node versions) is gone.
- JSON/JSONC edits are applied surgically, preserving comments, key order and indentation.
- Built-in paths are re-synced on every start: new ones are added, retired ones removed, and your enabled/disabled choices are kept.
- Enable/disable toggles are only offered for agents that actually honour the flag.
- Validation is dialect-aware (replaces the AJV schema, which only understood `mcpServers`).
- Monaco editor is bundled locally instead of being loaded from a CDN.
- ESLint 10 flat config, Vitest 3, TypeScript 5.9; CI on Node 22 and 24.
- Windsurf is shown as **Devin Desktop (Windsurf)**, Gemini CLI as legacy, Roo Code as archived.

### Fixed

- YAML configs (e.g. Goose) were overwritten with JSON after a structured edit.
- Renaming a server in the form left the old entry behind.
- Project-level configs without an agent were listed twice.
- `--token` mode didn't work because the dashboard never sent the token.
- Schema migrations are versioned with `PRAGMA user_version`.

### Security

- The production server sent `Access-Control-Allow-Origin: *` with no Host/Origin checks, so any website could rewrite MCP configs (and therefore the commands agents execute). Requests with a foreign Host/Origin or a non-JSON body are now rejected, including WebSocket upgrades.
- Backup restore accepted `../` filenames; path entry ids, backup names and skill paths are now validated and confined (symlinks resolved).
- Shell commands are spawned with argument arrays instead of interpolated strings.
- Security headers (nosniff, no-referrer, frame-ancestors 'none').

### Removed

- Built-in entries that never contained MCP servers or pointed to non-existent files: Aider, Supermaven, Tabnine, JetBrains AI Assistant, Void, `~/.claude/mcp.json`, `~/.claude/settings.json`, Copilot `hosts.json`, Warp agent config, Cursor/Windsurf rules folders, `CLAUDE.md` as a "skill".

## [0.1.0] - 2026-06-01

### Added

- Initial release: local dashboard for MCP configs and skills across AI coding agents.
- Agent overview, MCP config editor (form + raw JSON), skills browser and editor.
- Diff & Sync between agents' MCP configs.
- Live file watching over WebSocket.
- Path registry with built-in agent paths and custom entries.
- Safe writes with per-file backups, validation, and atomic replace; config history and restore.
- `aidit start` and `aidit scan` CLI commands.

[Unreleased]: https://github.com/onurceri/aidit/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/onurceri/aidit/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/onurceri/aidit/releases/tag/v0.1.0
