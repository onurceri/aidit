import { prepare } from './db.js';

export interface ScanRunRow {
  id: number;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  agents_found: number;
  mcp_total: number;
  skills_total: number;
  triggered_by: 'startup' | 'manual' | 'file_change' | 'api';
}

export interface ScanRunInput {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  agents_found: number;
  mcp_total: number;
  skills_total: number;
  triggered_by: 'startup' | 'manual' | 'file_change' | 'api';
}

const insertStmt = prepare<object>(`
  INSERT INTO scan_runs (started_at, finished_at, duration_ms, agents_found, mcp_total, skills_total, triggered_by)
  VALUES (@started_at, @finished_at, @duration_ms, @agents_found, @mcp_total, @skills_total, @triggered_by)
`);

const recentStmt = prepare<[number], ScanRunRow>(
  `SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT ?`,
);

const latestStmt = prepare<[], ScanRunRow>(
  `SELECT * FROM scan_runs ORDER BY started_at DESC LIMIT 1`,
);

export function insertScanRun(input: ScanRunInput): number {
  const result = insertStmt.run(input);
  return Number(result.lastInsertRowid);
}

export function getRecentRuns(limit = 20): ScanRunRow[] {
  return recentStmt.all([limit]);
}

export function getLatestRun(): ScanRunRow | undefined {
  return latestStmt.get();
}
