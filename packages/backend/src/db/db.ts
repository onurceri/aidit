import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_DIR = join(homedir(), '.config', 'aidit');
const DB_PATH = join(DB_DIR, 'aidit.db');

mkdirSync(DB_DIR, { recursive: true });

const db: DatabaseType = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrationSql = readFileSync(join(__dirname, 'migrations', '001_init.sql'), 'utf-8');
db.exec(migrationSql);

export { db };
