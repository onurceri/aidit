import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Root directory for all aidit state (database, backups, token).
 * Override with AIDIT_DATA_DIR — used by tests and by users who want
 * to keep state somewhere other than ~/.config/aidit.
 */
export const DATA_DIR = process.env.AIDIT_DATA_DIR || join(homedir(), '.config', 'aidit');

export const BACKUP_BASE = join(DATA_DIR, 'backups');
