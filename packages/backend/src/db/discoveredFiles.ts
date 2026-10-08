import { prepare } from './db.js';

export interface DiscoveredFileRow {
  id: number;
  path_entry_id: string;
  absolute_path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent_id: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_modified: string;
  size_bytes: number;
}

export interface DiscoveredFileInput {
  path_entry_id: string;
  absolute_path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent_id: string | null;
  last_modified: string;
  size_bytes: number;
}

const upsertStmt = prepare<object>(`
  INSERT INTO discovered_files (path_entry_id, absolute_path, type, agent_id, first_seen_at, last_seen_at, last_modified, size_bytes)
  VALUES (@path_entry_id, @absolute_path, @type, @agent_id, @now, @now, @last_modified, @size_bytes)
  ON CONFLICT(absolute_path) DO UPDATE SET
    path_entry_id = @path_entry_id,
    type = @type,
    agent_id = @agent_id,
    last_seen_at = @now,
    last_modified = @last_modified,
    size_bytes = @size_bytes
`);

const getByPathEntryStmt = prepare<[string], DiscoveredFileRow>(
  `SELECT * FROM discovered_files WHERE path_entry_id = ?`,
);

const getByAbsolutePathStmt = prepare<[string], DiscoveredFileRow>(
  `SELECT * FROM discovered_files WHERE absolute_path = ?`,
);

export function upsertDiscoveredFile(input: DiscoveredFileInput): DiscoveredFileRow {
  upsertStmt.run({ ...input, now: new Date().toISOString() });
  return getByAbsolutePathStmt.get([input.absolute_path]) as DiscoveredFileRow;
}

export function getByPathEntry(pathEntryId: string): DiscoveredFileRow[] {
  return getByPathEntryStmt.all([pathEntryId]);
}

export function getByAbsolutePath(absolutePath: string): DiscoveredFileRow | undefined {
  return getByAbsolutePathStmt.get([absolutePath]);
}
