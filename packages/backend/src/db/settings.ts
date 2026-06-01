import { db } from './db.js';

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
}

const DEFAULTS: Record<string, string> = {
  api_port: '3001',
  ui_port: '3000',
  backup_retention: '10',
  backup_dir: '~/.config/aidit/backups',
  project_scan_enabled: 'false',
  project_scan_dirs: '[]',
};

const upsertStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (@key, @value, @updated_at)
  ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at
`);

const getStmt = db.prepare<[string], SettingRow>(
  `SELECT key, value, updated_at FROM settings WHERE key = ?`,
);

const getAllStmt = db.prepare<[], SettingRow>(`SELECT key, value, updated_at FROM settings`);

export function initDefaultSettings(): void {
  const existing = new Set(getAllStmt.all().map((r) => r.key));
  const now = new Date().toISOString();
  const insert = db.transaction(() => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      if (!existing.has(key)) {
        upsertStmt.run({ key, value, updated_at: now });
      }
    }
  });
  insert();
}

export function getSetting<T = string>(key: string): T | undefined {
  const row = getStmt.get(key);
  if (!row) return undefined;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return row.value as T;
  }
}

export function setSetting(key: string, value: unknown): void {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  upsertStmt.run({ key, value: serialized, updated_at: new Date().toISOString() });
}

export function getAllSettings(): Record<string, unknown> {
  const rows = getAllStmt.all();
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result;
}
