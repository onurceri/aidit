import { db } from './db.js';

export interface WriteLogRow {
  id: number;
  written_at: string;
  path_entry_id: string;
  absolute_path: string;
  backup_path: string;
  content_before: string;
  content_after: string;
  triggered_by: 'user_form' | 'user_json' | 'sync' | 'restore';
}

export interface WriteLogInput {
  path_entry_id: string;
  absolute_path: string;
  backup_path: string;
  content_before: string;
  content_after: string;
  triggered_by: 'user_form' | 'user_json' | 'sync' | 'restore';
}

const insertStmt = db.prepare(`
  INSERT INTO write_log (written_at, path_entry_id, absolute_path, backup_path, content_before, content_after, triggered_by)
  VALUES (@written_at, @path_entry_id, @absolute_path, @backup_path, @content_before, @content_after, @triggered_by)
`);

const historyStmt = db.prepare<[string], WriteLogRow>(
  `SELECT * FROM write_log WHERE path_entry_id = ? ORDER BY written_at DESC`,
);

const getByTimestampStmt = db.prepare<[string], WriteLogRow>(
  `SELECT * FROM write_log WHERE written_at = ?`,
);

const getByIdStmt = db.prepare<[number], WriteLogRow>(`SELECT * FROM write_log WHERE id = ?`);

export function insertWriteLog(input: WriteLogInput): number {
  const result = insertStmt.run({ ...input, written_at: new Date().toISOString() });
  return Number(result.lastInsertRowid);
}

export function getHistory(pathEntryId: string): WriteLogRow[] {
  return historyStmt.all(pathEntryId);
}

export function getByTimestamp(timestamp: string): WriteLogRow | undefined {
  return getByTimestampStmt.get(timestamp);
}

export function getById(id: number): WriteLogRow | undefined {
  return getByIdStmt.get(id);
}
