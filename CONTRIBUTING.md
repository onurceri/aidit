# Contributing to aidit

Thanks for helping out. This guide covers setup, project layout, the checks CI runs, and the most common contribution: adding support for a new AI agent.

For non-trivial changes, open an issue first so we can agree on the approach before you write code.

## Development setup

Requirements:

- **Node.js 22.13+** (aidit uses the built-in `node:sqlite` module, so there are no native dependencies to compile)
- **pnpm 9** (`corepack enable` picks up the version pinned in `package.json`)

```bash
git clone https://github.com/onurceri/aidit.git
cd aidit
pnpm install
pnpm dev        # backend on 127.0.0.1:3001, frontend on :3000 (proxies /api and /ws)
```

Open <http://localhost:3000>. The backend must be running for the UI to work.

To keep your real `~/.config/aidit` untouched while developing, point aidit at a scratch directory:

```bash
AIDIT_DATA_DIR=/tmp/aidit-dev pnpm dev
```

## Project layout

```
aidit/
├── bin/aidit.js                # CLI entry point (start | scan)
├── packages/
│   ├── backend/                # Express API, scanner, safe writer, file watcher, SQLite
│   │   └── src/
│   │       ├── registry/       # agent catalog (agents.ts) + built-in paths (builtins.ts)
│   │       ├── scanner/        # path resolution, config parsing, MCP/skills extraction
│   │       ├── writer/         # safe writer (backup → validate → atomic write)
│   │       ├── watcher/        # chokidar + WebSocket push
│   │       ├── validation/     # AJV schemas
│   │       ├── db/             # node:sqlite tables and migrations
│   │       └── routes/         # HTTP API
│   └── frontend/               # React 18 + Vite + Tailwind + Lucide
│       └── src/
│           ├── routes/         # Overview, MCP config, Skills, Diff & Sync, Settings, Paths
│           ├── components/
│           ├── context/
│           ├── hooks/
│           └── lib/            # icons.ts (agent → icon), time helpers, …
└── docs/screenshots/           # README images
```

[`AGENTS.md`](./AGENTS.md) documents codebase conventions in more detail (ESM imports with `.js` extensions, strict TypeScript, no UI component library, no date library, localhost-only binding).

## Checks

CI runs all of these on every pull request. Run them locally before pushing:

```bash
pnpm format:check   # Prettier (pnpm format to fix)
pnpm lint           # ESLint (flat config in eslint.config.js)
pnpm typecheck      # tsc --noEmit in both packages
pnpm test           # Vitest (backend)
pnpm build          # production build of both packages
```

Tests live next to the code as `*.test.ts`. Backend tests must not touch the real home directory: use temp directories and set `AIDIT_DATA_DIR` / `AIDIT_DB_PATH=:memory:` where needed.

## Adding a new agent

Most agent requests boil down to three edits:

1. **Agent catalog** — `packages/backend/src/registry/agents.ts`
   Add an entry with the agent's `id` (kebab-case, stable — it is stored in users' databases), display `label`, `homepage`, and the MCP **dialect** its config file uses (for example `mcpServers` JSON, VS Code `servers`, opencode `mcp`, Codex TOML `mcp_servers`, Zed `context_servers`, Goose `extensions`). If the agent uses a format no existing dialect covers, add one in the scanner and include tests for reading _and_ writing it.

2. **Built-in paths** — `packages/backend/src/registry/builtins.ts`
   Add one entry per config file or skills directory, per OS where paths differ. Use `~`, `$HOME`, `$XDG_CONFIG_HOME`, or `{WIN_HOME}` (WSL) rather than hard-coded home directories. Each entry is a tuple `[agent, id, label, path, type, scope]`; relative paths must use scope `'project'`. Never rename an existing id — retired ids are removed from users' registries on startup. Only add paths that are documented by the agent's vendor — link the docs in your PR.

3. **Icon** — `packages/frontend/src/lib/icons.ts`
   Map the agent id to a Lucide icon (and a family, if it belongs to one).

Then update the supported-agents table in `README.md` and add a line to `CHANGELOG.md` under `[Unreleased]`.

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(registry): add Kiro MCP and steering paths
fix(writer): preserve JSONC comments when toggling a server
docs: clarify WSL path resolution
```

Common types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`, `build`. Breaking changes get a `!` after the type (`feat!: …`) and a `BREAKING CHANGE:` footer.

## Pull requests

- Branch from `main` and keep PRs focused on one change.
- Fill in the PR template, including how you tested.
- Include before/after screenshots for UI changes.
- Do not add outbound network calls or telemetry — aidit is local-only by design.
- New runtime dependencies need a justification in the PR description.

## Updating README screenshots

Screenshots are taken against **demo data**, never your own configs.
`scripts/demo/run.sh` seeds a throwaway home directory (`scripts/demo/seed.mjs`) and starts
aidit with `HOME`, `XDG_CONFIG_HOME` and `AIDIT_DATA_DIR` pointing at it:

```bash
pnpm build
scripts/demo/run.sh 4511 &            # demo instance on :4511
pip install playwright                # uses installed Chrome if Playwright's browser is missing
python3 scripts/take-screenshots.py   # writes docs/screenshots/*.png
```

The demo instance is also handy for trying UI changes without touching your real setup.

## Security issues

Do not open public issues for vulnerabilities. See [SECURITY.md](./.github/SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
