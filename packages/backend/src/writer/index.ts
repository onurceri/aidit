export { safeWrite, applyServerChange, restoreBackup, SafeWriteError } from './safeWriter.js';
export type { ServerOperation } from './mcpMutations.js';
export {
  BACKUP_BASE,
  createBackup,
  listBackups,
  pruneBackups,
  readBackupContent,
  ensureBackupBaseDir,
} from './backupManager.js';
export type { BackupEntry } from './backupManager.js';
