import { prepare, transaction } from './db.js';

export interface PathRegistryRow {
  id: string;
  label: string;
  path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent: string | null;
  scope: 'global' | 'project';
  source: 'builtin' | 'user';
  enabled: number;
  sort_order: number;
}

export interface PathRegistryInput {
  id: string;
  label: string;
  path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent: string | null;
  scope: 'global' | 'project';
  source: 'builtin' | 'user';
  enabled?: boolean;
  sort_order?: number;
}

const insertStmt = prepare<object>(`
  INSERT INTO path_registry (id, label, path, type, agent, scope, source, enabled, sort_order)
  VALUES (@id, @label, @path, @type, @agent, @scope, @source, @enabled, @sort_order)
`);

const upsertStmt = prepare<object>(`
  INSERT INTO path_registry (id, label, path, type, agent, scope, source, enabled, sort_order)
  VALUES (@id, @label, @path, @type, @agent, @scope, @source, @enabled, @sort_order)
  ON CONFLICT(id) DO UPDATE SET
    label = @label, path = @path, type = @type, agent = @agent,
    scope = @scope, source = @source, enabled = @enabled, sort_order = @sort_order
`);

const getAllStmt = prepare<[], PathRegistryRow>(
  `SELECT * FROM path_registry ORDER BY sort_order, id`,
);

const getByIdStmt = prepare<[string], PathRegistryRow>(`SELECT * FROM path_registry WHERE id = ?`);

const deleteByIdStmt = prepare<[string]>(`DELETE FROM path_registry WHERE id = ?`);

const deleteAllStmt = prepare(`DELETE FROM path_registry`);

const deleteBuiltinStmt = prepare<object>(`DELETE FROM path_registry WHERE source = 'builtin'`);

function normalizeInput(input: PathRegistryInput) {
  return {
    ...input,
    enabled: input.enabled ? 1 : 0,
    sort_order: input.sort_order ?? 0,
  };
}

export function insertEntry(input: PathRegistryInput): void {
  insertStmt.run(normalizeInput(input));
}

export function upsertEntry(input: PathRegistryInput): void {
  upsertStmt.run(normalizeInput(input));
}

export function getAllEntries(): PathRegistryRow[] {
  return getAllStmt.all();
}

export function getEntryById(id: string): PathRegistryRow | undefined {
  return getByIdStmt.get([id]);
}

export function deleteEntry(id: string): void {
  deleteByIdStmt.run([id]);
}

export function resetBuiltins(builtinEntries: PathRegistryInput[]): void {
  transaction(() => {
    deleteBuiltinStmt.run();
    for (const entry of builtinEntries) {
      insertStmt.run(normalizeInput({ ...entry, source: 'builtin' }));
    }
  });
}

export function replaceAll(entries: PathRegistryInput[]): void {
  transaction(() => {
    deleteAllStmt.run();
    for (const entry of entries) {
      insertStmt.run(normalizeInput(entry));
    }
  });
}
