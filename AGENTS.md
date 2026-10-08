# AGENTS.md

## Project

**aidit** — local web dashboard for managing AI agent MCP configs and skills across ~30 tools (Claude Code, Codex, Cursor, Copilot, Antigravity, Kiro, opencode, Goose, Zed, …). Runs entirely on localhost, no cloud. Requires **Node.js 22.13+** (uses built-in `node:sqlite`).

User-facing docs: `README.md`. Contributor guide: `CONTRIBUTING.md`. Release notes: `CHANGELOG.md` (update `[Unreleased]` with user-visible changes).

## Commands

```bash
pnpm dev          # Start both packages in parallel (frontend :3000, backend :3001)
pnpm build        # Build all packages sequentially
pnpm test         # Backend Vitest suite (run once)
pnpm lint         # ESLint on .ts/.tsx files
pnpm format       # Prettier write
pnpm typecheck    # TypeScript --noEmit across all packages
```

Run a single package:

```bash
pnpm --filter @aidit/backend dev        # tsx watch src/index.ts
pnpm --filter @aidit/backend exec vitest run   # Vitest
pnpm --filter @aidit/backend typecheck  # tsc --noEmit
pnpm --filter @aidit/frontend dev       # Vite dev server with proxy to backend
```

Production entry points:

```bash
node bin/aidit.js start                 # CLI (sets AIDIT_CLI=true; opens browser)
node packages/backend/dist/index.js     # Direct backend (only auto-starts if AIDIT_CLI not set)
```

## Architecture

- **pnpm workspace monorepo**: `packages/backend` + `packages/frontend`
- **Backend** (`@aidit/backend`): Express 4 on `127.0.0.1:3001`. Scanner reads agent config files from local filesystem. SQLite via built-in `node:sqlite` (`db/db.ts` wraps it with typed `prepare()` / `transaction()`). WebSocket push via `ws` attached to the same HTTP server.
- **Frontend** (`@aidit/frontend`): React 18 + Vite + Tailwind. Dev server on `:3000` proxies `/api` → `http://127.0.0.1:3001` and `/ws` → `ws://127.0.0.1:3001`.
- **Data directory**: `~/.config/aidit/` — stores `aidit.db` (SQLite, all persistent state including the path registry, settings, scan history, write log) and `backups/<pathEntryId>/*.bak` (per-file backup before each safe write). `token` is written here only when `aidit start --token` is used.

## Key conventions

- **ESM throughout** — both packages use `"type": "module"`. Backend imports must use `.js` extensions (e.g. `import { x } from './server.js'`).
- **Backend dev**: `tsx watch src/index.ts` (not ts-node/nodemon).
- **Frontend build**: `tsc -b && vite build` — typecheck runs before Vite bundles.
- **TypeScript strict mode** — inherited from `tsconfig.base.json`. No `any`.
- **ESLint** ignores `dist/`, `node_modules/`, `*.js`. Extends `@typescript-eslint/recommended` + `prettier`.
- **Prettier**: semi, single quotes, trailing commas, printWidth 100, tabWidth 2.
- **Test runner**: Vitest (not Jest). `packages/backend/vitest.config.ts` loads `src/test/setup.ts`, which sets `AIDIT_DATA_DIR` to a temp dir and `AIDIT_DB_PATH=:memory:` — never let tests touch the real `~/.config/aidit`. Env is read at import time, so set env before importing modules.
- **Backend must bind to `127.0.0.1` only** — never `0.0.0.0`. `security.ts` also enforces Host/Origin checks (DNS rebinding / drive-by protection) — keep them.
- **DB migrations** live in `db/migrations.ts` as an ordered array applied via `PRAGMA user_version`. Never edit a shipped migration; append a new one.
- **`AIDIT_CLI` env var**: Set to `'true'` by `bin/aidit.js`. The backend's `dist/index.js` only auto-starts when this is NOT set. The CLI explicitly calls `startServer({port, token, frontendDistPath})` after importing.
- **Vite dev proxy**: Frontend dev on `:3000` proxies `/api` → `http://127.0.0.1:3001` and `/ws` → `ws://127.0.0.1:3001` (the actual WS endpoint is `/ws/watch`). Backend must be running first for UI to work in dev.
- **Path resolver env vars**: `~` and `$HOME` expand to the user home; `$XDG_CONFIG_HOME` defaults to `~/.config`. WSL is detected via `WSLENV` env or `/proc/sys/fs/binfmt_misc/WSLInterop`, and supports `{WIN_HOME}` in paths (`scanner/pathResolver.ts`).
- **`$EDITOR` env var**: Used by the `/api/skills/open-in-editor` route. Falls back to `open` (macOS).

## Backend module map

```
src/
  index.ts                # Entry: initializes registry → creates server → attaches WS → starts watcher → listens
  server.ts               # createServer() returns { app, httpServer } — WS needs the httpServer
  routes/                 # scan, config, skills, paths, backups, settings
  scanner/                # pathResolver, formats (json/jsonc/yaml/toml parse+serialize), dialects (per-agent MCP layouts), mcpExtractor, readConfig, skillsScanner, types
  writer/                 # safeWriter (validate → backup → atomic write), mcpMutations (structured server ops), backupManager
  watcher/                # fileWatcher (chokidar), wsServer (WebSocket push, /ws/watch)
  validation/             # dialect-aware validator
  db/                     # SQLite tables: db, settings, pathRegistry, scanRuns, discoveredFiles, writeLog
  registry/               # agents (catalog: label, homepage, dialect), builtins (~100 paths), pathRegistry (sync on startup)
```

## Frontend module map

```
src/
  main.tsx, App.tsx       # App is the layout shell; routes registered in App.tsx (paths /, /mcp, /skills, /diff, /settings, /settings/paths)
  routes/                 # Overview, McpConfig, Skills, DiffSync, Settings, PathRegistry
  components/             # AgentCard, McpServerForm, JsonEditor, SkillPreview, SkillEditor, DiffView, PathTable, LiveIndicator, ConfirmModal, ConfigHistory, CommandPalette
  context/                # ScanContext, WsContext, ToastContext
  hooks/                  # useScan, useWatcher (incl. useConfigWatch for per-path subscription)
  lib/                    # time.ts (relative-time helpers), icons.ts (agent→icon map), mcpPresentation.ts (server badges), monaco.ts (bundles Monaco locally — no CDN)
  api/client.ts           # Typed fetch wrappers for all endpoints; uses relative /api/... URLs (Vite proxy in dev, same-origin in prod)
```

## Important constraints

- **No date formatting library** (no `date-fns`, `dayjs`, etc.). Use `lib/time.ts` for relative time.
- **No UI component library** (no shadcn/ui, Radix, Headless UI). Build everything with Tailwind + Lucide icons (`lucide-react`).
- **Scanner behavior**: All agents with registry entries are returned in `ScanResult.agents` with a `found` boolean. The UI typically separates/filters by `found` — agents with no config files or skills dirs on disk show `found: false`.
- **Adding an agent**: catalog entry in `registry/agents.ts`, paths in `registry/builtins.ts`, icon in frontend `lib/icons.ts`, README table, CHANGELOG. Never rename a builtin id.
- **MCP edits go through the backend**: the frontend calls `changeServer()` (`POST /api/config/:id/servers`); it must not mutate config JSON itself. New config layouts = new dialect in `scanner/dialects.ts` + read _and_ write tests in `mcpExtractor.test.ts`.
- **Startup sequence** (see `index.ts`): `initializeRegistry()` → `createServer()` → `attachWsServer(httpServer)` → `initializeWatcher()` → `listen()`. Order matters — registry must exist before watcher starts.
