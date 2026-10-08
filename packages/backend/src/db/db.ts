import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../dataDir.js';
import { MIGRATIONS } from './migrations.js';

type Params = object;

export interface Statement<P extends Params, R> {
  run(params?: P): { changes: number | bigint; lastInsertRowid: number | bigint };
  get(params?: P): R | undefined;
  all(params?: P): R[];
}

function openDatabase(): DatabaseSync {
  const location = process.env.AIDIT_DB_PATH ?? join(DATA_DIR, 'aidit.db');
  if (location !== ':memory:') {
    mkdirSync(DATA_DIR, { recursive: true });
  }
  const database = new DatabaseSync(location);
  database.exec('PRAGMA journal_mode = WAL');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);
  return database;
}

function migrate(database: DatabaseSync): void {
  const row = database.prepare('PRAGMA user_version').get() as { user_version: number };
  for (let version = row.user_version; version < MIGRATIONS.length; version++) {
    database.exec('BEGIN');
    try {
      database.exec(MIGRATIONS[version]);
      database.exec(`PRAGMA user_version = ${version + 1}`);
      database.exec('COMMIT');
    } catch (err) {
      database.exec('ROLLBACK');
      throw err;
    }
  }
}

export const db = openDatabase();

/**
 * Typed wrapper around node:sqlite statements. Positional params are passed as
 * an array, named params (`@name`) as an object.
 */
export function prepare<P extends Params = SQLInputValue[], R = unknown>(
  sql: string,
): Statement<P, R> {
  const stmt = db.prepare(sql);
  const spread = (params?: P): SQLInputValue[] => {
    if (params === undefined) return [];
    return Array.isArray(params)
      ? (params as SQLInputValue[])
      : [params as unknown as SQLInputValue];
  };
  return {
    run: (params) => stmt.run(...spread(params)),
    get: (params) => stmt.get(...spread(params)) as R | undefined,
    all: (params) => stmt.all(...spread(params)) as R[],
  };
}

export function transaction(fn: () => void): void {
  db.exec('BEGIN');
  try {
    fn();
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
