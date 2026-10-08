import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getSetting } from '../db/settings.js';

import { BACKUP_BASE } from '../dataDir.js';

export { BACKUP_BASE };

function backupDir(pathEntryId: string): string {
  return join(BACKUP_BASE, pathEntryId);
}

export interface BackupEntry {
  filename: string;
  absolutePath: string;
  sizeBytes: number;
  createdAt: string;
}

export function ensureBackupBaseDir(): void {
  mkdirSync(BACKUP_BASE, { recursive: true });
}

export function createBackup(pathEntryId: string, content: string): string {
  const dir = backupDir(pathEntryId);
  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}.bak`;
  const absolutePath = join(dir, filename);

  writeFileSync(absolutePath, content, 'utf-8');
  return absolutePath;
}

export function listBackups(pathEntryId: string): BackupEntry[] {
  const dir = backupDir(pathEntryId);
  if (!existsSync(dir)) return [];

  return readdirSync(dir)
    .filter((f) => f.endsWith('.bak'))
    .map((f) => {
      const absolutePath = join(dir, f);
      const stat = statSync(absolutePath);
      return {
        filename: f,
        absolutePath,
        sizeBytes: stat.size,
        createdAt: stat.birthtime.toISOString(),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function pruneBackups(pathEntryId: string, maxCount?: number): void {
  const retention = maxCount ?? getSetting<number>('backup_retention') ?? 10;
  const backups = listBackups(pathEntryId);

  if (backups.length <= retention) return;

  const toDelete = backups.slice(retention);
  for (const backup of toDelete) {
    unlinkSync(backup.absolutePath);
  }
}

export function readBackupContent(pathEntryId: string, filename: string): string {
  const dir = backupDir(pathEntryId);
  const absolutePath = join(dir, filename);

  if (!existsSync(absolutePath)) {
    throw new Error(`Backup file not found: ${filename}`);
  }

  return readFileSync(absolutePath, 'utf-8');
}
