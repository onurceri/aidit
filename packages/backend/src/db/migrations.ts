/**
 * Ordered schema migrations. Index N upgrades `PRAGMA user_version` from N to N+1.
 * Never edit a shipped migration — append a new one instead.
 */
export const MIGRATIONS: string[] = [
  `
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL,
  duration_ms  INTEGER NOT NULL,
  agents_found INTEGER NOT NULL,
  mcp_total    INTEGER NOT NULL,
  skills_total INTEGER NOT NULL,
  triggered_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS discovered_files (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  path_entry_id   TEXT NOT NULL,
  absolute_path   TEXT NOT NULL,
  type            TEXT NOT NULL,
  agent_id        TEXT,
  first_seen_at   TEXT NOT NULL,
  last_seen_at    TEXT NOT NULL,
  last_modified   TEXT NOT NULL,
  size_bytes      INTEGER NOT NULL,
  UNIQUE(absolute_path)
);

CREATE TABLE IF NOT EXISTS write_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  written_at      TEXT NOT NULL,
  path_entry_id   TEXT NOT NULL,
  absolute_path   TEXT NOT NULL,
  backup_path     TEXT NOT NULL,
  content_before  TEXT NOT NULL,
  content_after   TEXT NOT NULL,
  triggered_by    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS path_registry (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  path       TEXT NOT NULL,
  type       TEXT NOT NULL,
  agent      TEXT,
  scope      TEXT NOT NULL,
  source     TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
`,
  `
CREATE INDEX IF NOT EXISTS idx_write_log_path_entry ON write_log (path_entry_id, written_at);
CREATE INDEX IF NOT EXISTS idx_scan_runs_started ON scan_runs (started_at);
`,
];
