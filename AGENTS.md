# AGENTS.md

## Project

**aidit** — local web dashboard for managing AI agent MCP configs and skills across multiple tools (Claude Desktop, Cursor, etc.). Runs entirely on localhost, no cloud. Requires **Node.js 20+**.

Canonical product spec is `aidit-product-spec.md` (data models, API routes, UI structure, safe-write pipeline, security). Per-task build notes live in `tasks/01-…22-*.md`.

## Commands

```bash
pnpm dev          # Start both packages in parallel (frontend :3000, backend :3001)
pnpm build        # Build all packages sequentially (backend: tsc + copies SQL migrations)
pnpm lint         # ESLint on .ts/.tsx files
pnpm format       # Prettier write
pnpm typecheck    # TypeScript --noEmit across all packages
```

Run a single package:

```bash
pnpm --filter @aidit/backend dev        # tsx watch src/index.ts
pnpm --filter @aidit/backend test       # Vitest (no config file; uses defaults)
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
- **Backend** (`@aidit/backend`): Express 4 on `127.0.0.1:3001`. Scanner reads agent config files from local filesystem. SQLite via `better-sqlite3` for persistence. WebSocket push via `ws` attached to the same HTTP server.
- **Frontend** (`@aidit/frontend`): React 18 + Vite + Tailwind. Dev server on `:3000` proxies `/api` → `http://127.0.0.1:3001` and `/ws` → `ws://127.0.0.1:3001`.
- **Data directory**: `~/.config/aidit/` — stores `aidit.db` (SQLite, all persistent state including the path registry, settings, scan history, write log) and `backups/<pathEntryId>/*.bak` (per-file backup before each safe write). `token` is written here only when `aidit start --token` is used.

## Key conventions

- **ESM throughout** — both packages use `"type": "module"`. Backend imports must use `.js` extensions (e.g. `import { x } from './server.js'`).
- **Backend dev**: `tsx watch src/index.ts` (not ts-node/nodemon).
- **Frontend build**: `tsc -b && vite build` — typecheck runs before Vite bundles.
- **TypeScript strict mode** — inherited from `tsconfig.base.json`. No `any`.
- **ESLint** ignores `dist/`, `node_modules/`, `*.js`. Extends `@typescript-eslint/recommended` + `prettier`.
- **Prettier**: semi, single quotes, trailing commas, printWidth 100, tabWidth 2.
- **Test runner**: Vitest (not Jest). No vitest config file — uses defaults. Test files matched by `**/*.test.ts` / `**/*.spec.ts`.
- **Backend must bind to `127.0.0.1` only** — never `0.0.0.0`. Security requirement from spec.
- **Backend build copies SQL migrations** — `tsc` then `mkdir -p dist/db/migrations && cp src/db/migrations/*.sql dist/db/migrations/`. The DB loader reads the SQL from the compiled `dist/db/migrations/` directory at runtime (`db.ts:19`), so migrations must be in dist. After editing `001_init.sql`, run `pnpm --filter @aidit/backend build`.
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
  scanner/                # pathResolver, configParser, mcpExtractor, skillsScanner, types
  writer/                 # safeWriter (backup → validate → atomic write), backupManager
  watcher/                # fileWatcher (chokidar), wsServer (WebSocket push, /ws/watch)
  validation/             # schemas (AJV), validator
  db/                     # SQLite tables: db, settings, pathRegistry, scanRuns, discoveredFiles, writeLog
  registry/               # pathRegistry, builtins (~50+ agent path defaults)
```

## Frontend module map

```
src/
  main.tsx, App.tsx       # App is the layout shell; routes registered in App.tsx (paths /, /mcp, /skills, /diff, /settings, /settings/paths)
  routes/                 # Overview, McpConfig, Skills, DiffSync, Settings, PathRegistry
  components/             # AgentCard, McpServerForm, JsonEditor, SkillPreview, SkillEditor, DiffView, PathTable, LiveIndicator, ConfirmModal, ConfigHistory, CommandPalette
  context/                # ScanContext, WsContext, ToastContext
  hooks/                  # useScan, useWatcher (incl. useConfigWatch for per-path subscription)
  lib/                    # time.ts (relative-time helpers), icons.ts (agent→icon map), mcpConfig.ts (collection-path editor logic)
  api/client.ts           # Typed fetch wrappers for all endpoints; uses relative /api/... URLs (Vite proxy in dev, same-origin in prod)
```

## Important constraints

- **No date formatting library** (no `date-fns`, `dayjs`, etc.). Use `lib/time.ts` for relative time.
- **No UI component library** (no shadcn/ui, Radix, Headless UI). Build everything with Tailwind + Lucide icons (`lucide-react`).
- **Scanner behavior**: All agents with registry entries are returned in `ScanResult.agents` with a `found` boolean. The UI typically separates/filters by `found` — agents with no config files or skills dirs on disk show `found: false`.
- **Agent icon mapping**: `lib/icons.ts` maps agent IDs to Lucide icons. Add new agent icons there.
- **Startup sequence** (see `index.ts`): `initializeRegistry()` → `createServer()` → `attachWsServer(httpServer)` → `initializeWatcher()` → `listen()`. Order matters — registry must exist before watcher starts.
