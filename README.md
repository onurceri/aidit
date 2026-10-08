# aidit

> One local dashboard for every AI coding agent's MCP servers and skills: Claude Code, Codex, Cursor, Copilot, Antigravity, Kiro, opencode, Goose, Zed and 20+ more. It runs on localhost only and never sends anything to the cloud.

[![CI](https://github.com/onurceri/aidit/actions/workflows/ci.yml/badge.svg)](https://github.com/onurceri/aidit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/aidit.svg)](https://www.npmjs.com/package/aidit)
[![MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A522.13-339933.svg)](https://nodejs.org)
[![Local-only](https://img.shields.io/badge/network-localhost%20only-orange.svg)](#security)

<p align="center">
  <img src="docs/screenshots/overview.png" alt="aidit overview" width="880" />
</p>

```bash
npx aidit start
```

That one command scans your machine, finds every AI agent it knows about, and opens a dashboard. From there you can read, edit, diff and sync MCP server configs and Agent Skills across all of them.

---

## Why aidit?

Every agent keeps MCP servers in its own file, and the formats differ:

- `mcpServers` in JSON for Claude, Cursor, Kiro and others
- `servers` for VS Code
- `mcp` for opencode, Kilo Code and Crush
- `[mcp_servers]` TOML tables for Codex
- `context_servers` for Zed
- `extensions:` YAML for Goose
- a YAML list for Continue

Skills are spread across `~/.claude/skills`, `~/.agents/skills`, `~/.cursor/skills`, `~/.kiro/skills` and more. If you run three agents, you keep three configs in sync by hand.

aidit shows all of it in one window. It also writes changes back **in each agent's own format**, keeping your comments and formatting.

## Features

- **Agent overview.** See every agent installed on your machine and the files that belong to it.
- **MCP editor that understands each dialect.** Add, edit, rename, enable/disable and delete servers in nine config layouts across JSON, JSONC, YAML and TOML.
  - JSON/JSONC edits are surgical, so comments and key order survive.
- **Diff & Sync.** Compare two agents side by side and copy servers between them. Copying from Cursor to Codex is translated from JSON to TOML for you.
- **Skills browser.** View, edit and create `SKILL.md` skills in every agent's skills folders, including the shared `~/.agents/skills`.
- **Safe writes.** Every write follows the same steps: validate, back up, write atomically, log. Each file keeps its own history and can be restored with one click.
- **Live updates.** Edits made on disk show up in the UI immediately, over WebSocket.
- **Path registry.** Comes with ~100 built-in paths. You can add your own paths per project or per OS, and import or export the registry.
- **Command palette** for keyboard-driven navigation.

## Supported agents

| Agent                    | MCP config                                                           | Format / key                    | Skills                                                          |
| ------------------------ | -------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| Claude Code              | `~/.claude.json`, `.mcp.json`                                        | JSON `mcpServers`               | `~/.claude/skills`, `.claude/skills`                            |
| Claude Desktop           | `claude_desktop_config.json` (macOS, Windows via WSL)                | JSON `mcpServers`               | —                                                               |
| OpenAI Codex             | `~/.codex/config.toml`, `.codex/config.toml`                         | TOML `mcp_servers`              | `~/.agents/skills`, `~/.codex/skills`                           |
| Google Antigravity       | `~/.gemini/config/mcp_config.json`, `.agents/mcp_config.json`        | JSON `mcpServers` (`serverUrl`) | `~/.gemini/config/skills`                                       |
| Gemini CLI (legacy)      | `~/.gemini/settings.json`, `.gemini/settings.json`                   | JSON `mcpServers` (`httpUrl`)   | `~/.gemini/skills`                                              |
| GitHub Copilot CLI       | `~/.copilot/mcp-config.json`, `.github/mcp.json`                     | JSON `mcpServers`               | `~/.copilot/skills`, `.github/skills`                           |
| VS Code (Copilot)        | user `mcp.json`, `.vscode/mcp.json`                                  | JSON `servers`                  | —                                                               |
| Cursor                   | `~/.cursor/mcp.json`, `.cursor/mcp.json`                             | JSON `mcpServers`               | `~/.cursor/skills`, `.cursor/skills`                            |
| Devin Desktop (Windsurf) | `~/.config/devin/mcp_config.json`, legacy `~/.codeium/windsurf/`     | JSON `mcpServers` (`serverUrl`) | `~/.config/devin/skills`, `.devin/skills`                       |
| Kiro                     | `~/.kiro/settings/mcp.json`, `.kiro/settings/mcp.json`               | JSON `mcpServers`               | `~/.kiro/skills`, `.kiro/skills`                                |
| Amazon Q Developer       | `~/.aws/amazonq/mcp.json`, `.amazonq/mcp.json`                       | JSON `mcpServers`               | —                                                               |
| Cline                    | CLI + VS Code extension settings                                     | JSON `mcpServers`               | `~/.cline/skills`, `.cline/skills`                              |
| Roo Code (archived)      | VS Code extension settings, `.roo/mcp.json`                          | JSON `mcpServers`               | `~/.roo/skills`, `.roo/skills`                                  |
| Kilo Code                | `~/.config/kilo/kilo.jsonc`, `.kilo/kilo.jsonc`                      | JSONC `mcp`                     | —                                                               |
| Continue                 | `~/.continue/config.yaml`, `.continue/config.yaml`                   | YAML `mcpServers` list          | —                                                               |
| Zed                      | `~/.config/zed/settings.json`                                        | JSONC `context_servers`         | —                                                               |
| opencode                 | `~/.config/opencode/opencode.json[c]`, `opencode.json`               | JSON `mcp`                      | `~/.config/opencode/skills`, `.opencode/skills`                 |
| Crush                    | `~/.config/crush/crush.json`, `.crush.json` (legacy JSON)            | JSON `mcp`                      | `~/.config/crush/skills`, `.crush/skills`                       |
| Amp                      | `~/.config/amp/settings.json`, `.amp/settings.json`                  | JSON `amp.mcpServers`           | `~/.config/amp/skills`                                          |
| Goose                    | `~/.config/goose/config.yaml`                                        | YAML `extensions`               | `.goose/skills`                                                 |
| Qwen Code                | `~/.qwen/settings.json`, `.qwen/settings.json`                       | JSON `mcpServers`               | —                                                               |
| Factory Droid            | `~/.factory/mcp.json`, `.factory/mcp.json`                           | JSON `mcpServers`               | `~/.factory/skills`, `.factory/skills`                          |
| Augment (Auggie)         | `~/.augment/settings.json`                                           | JSON `mcpServers`               | —                                                               |
| JetBrains Junie          | `~/.junie/mcp/mcp.json`, `.junie/mcp/mcp.json`                       | JSON `mcpServers`               | —                                                               |
| Warp                     | `~/.warp/.mcp.json`, `.warp/.mcp.json`                               | JSON `mcpServers`               | —                                                               |
| Mistral Vibe             | `~/.vibe/config.toml`, `.vibe/config.toml`                           | TOML `[[mcp_servers]]`          | `~/.vibe/skills`, `.vibe/skills`                                |
| Kimi Code                | `~/.kimi/mcp.json`                                                   | JSON `mcpServers`               | —                                                               |
| Grok Build               | `~/.grok/config.toml`, `.grok/config.toml`                           | TOML `mcp_servers`              | `~/.grok/skills`                                                |
| Trae                     | `~/Library/Application Support/Trae/User/mcp.json`, `.trae/mcp.json` | JSON `mcpServers`               | —                                                               |
| LM Studio                | `~/.lmstudio/mcp.json`                                               | JSON `mcpServers`               | —                                                               |
| Shared Agent Skills      | —                                                                    | —                               | `~/.agents/skills`, `~/.config/agents/skills`, `.agents/skills` |

Project paths resolve against the directory you run aidit from. Paths that are missing on your machine are skipped. You can add any other file under **Settings → Paths**: aidit detects its MCP layout from the content and the file name.

Is your agent missing, or has a path changed? [Open an agent-support issue](https://github.com/onurceri/aidit/issues/new?template=agent_support.yml). Adding an agent usually takes three small edits; see [CONTRIBUTING.md](./CONTRIBUTING.md#adding-a-new-agent).

## Installation

```bash
npx aidit start          # no install needed
# or
npm install -g aidit
aidit start
```

Requirements:

- **Node.js 22.13 or later.** aidit uses the built-in `node:sqlite`, so nothing native has to compile.
- macOS or Linux. Windows works through WSL.

To install from source:

```bash
git clone https://github.com/onurceri/aidit.git
cd aidit
pnpm install
pnpm build
node bin/aidit.js start
```

## Usage

```bash
aidit start                  # start the server and open the dashboard
aidit start --port 4000      # custom port (if it's taken, the next free one is used)
aidit start --no-open        # don't open a browser
aidit start --token          # require a random auth token for API requests
aidit scan > agents.json     # print a JSON scan of all agents and exit
aidit --help | --version
```

The dashboard is served at <http://127.0.0.1:3001> by default.

| Environment variable | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `AIDIT_DATA_DIR`     | Where aidit keeps its state (default `~/.config/aidit`) |
| `XDG_CONFIG_HOME`    | Base for `$XDG_CONFIG_HOME` paths (default `~/.config`) |
| `EDITOR`             | Editor used by "Open in editor" for skills              |

## How it works

```
┌─────────────────────┐         ┌──────────────────────────────┐
│  packages/frontend  │  HTTP   │  packages/backend            │
│  React + Vite       │ ◀────▶  │  Express on 127.0.0.1        │
│  Tailwind + Monaco  │  /api   │  scanner → dialects → writer │
│                     │  /ws    │  node:sqlite + chokidar      │
└─────────────────────┘         └──────────────────────────────┘
                                       │
                                       ▼
                                ~/.config/aidit/
                                ├── aidit.db    # path registry, settings, scan + write history
                                ├── backups/    # per-file backups before every write
                                └── token       # only with --token
```

- **Scanner.** Resolves the path registry for the current OS and project, then parses each file (JSON, JSONC, YAML or TOML).
- **Dialects** (`packages/backend/src/scanner/dialects.ts`). Each dialect decodes one agent's MCP layout into a common server model and encodes it back. One mutation API (`POST /api/config/:id/servers`) therefore works for every agent.
- **Safe writer.** Validates, backs up, writes to a temp file next to the target and renames it into place. The file mode is preserved and every write is logged.
- **Watcher.** Pushes file changes to the UI over WebSocket.

## Security

aidit edits files that tell your agents **which commands to run**, so it is locked down:

- **Localhost only.** The server binds to `127.0.0.1` and is never exposed to your LAN.
- **Blocks drive-by and DNS-rebinding attacks.** Requests with a foreign `Host` or `Origin` are rejected, and writes must be `application/json`. A website you visit can't reach your aidit and change your MCP config. WebSocket upgrades get the same checks.
- **Optional token auth.** `aidit start --token` requires a bearer token on every API and WebSocket request. The CLI hands the token to the browser once, via the URL fragment.
- **No telemetry, no outbound requests.** The editor (Monaco) is bundled with the app, not loaded from a CDN.
- **Safe writes.** Every change is validated and backed up first, and can be restored from history.
- **Confined file access.** Skills are only read or written inside registered skills folders, and symlinks are resolved before that check.

Please report vulnerabilities through a [private security advisory](https://github.com/onurceri/aidit/security/advisories/new), not a public issue. See [SECURITY.md](./.github/SECURITY.md).

## Development

```bash
pnpm install
pnpm dev          # frontend on :3000 (proxied), backend on :3001
pnpm test         # vitest (backend)
pnpm lint         # eslint
pnpm typecheck    # tsc --noEmit for both packages
pnpm format       # prettier
pnpm build        # production build
```

Tests never touch your real `~/.config/aidit`: `packages/backend/src/test/setup.ts` points aidit at a temp directory and an in-memory database.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the project layout, commit conventions and how to add an agent.

## Roadmap

- Claude Code local-scope servers (`projects[...]` in `~/.claude.json`) and Continue's `.continue/mcpServers/*.yaml`
- Structured editing for headers and OAuth settings of remote servers
- Secrets masking for `env` values in the UI
- Export and import of MCP server bundles across machines
- Windows-native paths (outside WSL)

## License

[MIT](./LICENSE) © 2026 Onur Ceri and aidit contributors
