import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  statSync,
} from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';
import { getEntryById } from '../db/pathRegistry.js';
import { resolvePath } from '../scanner/pathResolver.js';
import { insertWriteLog } from '../db/writeLog.js';
import { createBackup, pruneBackups, readBackupContent } from './backupManager.js';
import { detectFormat } from '../scanner/formats.js';
import { readConfig, preferredDialect } from '../scanner/readConfig.js';
import { validateConfig } from '../validation/validator.js';
import { applyServerOperation, type ServerOperation } from './mcpMutations.js';
import { SafeWriteError } from './errors.js';
import type { ConfigResult } from '../scanner/types.js';

export { SafeWriteError };

export type WriteTrigger = 'user_form' | 'user_json' | 'sync' | 'restore';

interface WriteTarget {
  pathEntryId: string;
  absolutePath: string;
  scope: 'global' | 'project';
  agent: string | null;
}

function resolveTarget(pathEntryId: string, cwd?: string): WriteTarget {
  const row = getEntryById(pathEntryId);
  if (!row) {
    throw new SafeWriteError(`Path entry "${pathEntryId}" not found`, 404);
  }
  if (row.type !== 'mcp-config') {
    throw new SafeWriteError(`Path entry "${pathEntryId}" is not an MCP config file`, 400);
  }
  return {
    pathEntryId,
    absolutePath: resolvePath(row.path, cwd),
    scope: row.scope,
    agent: row.agent,
  };
}

function readCurrent(absolutePath: string): string {
  return existsSync(absolutePath) ? readFileSync(absolutePath, 'utf-8') : '';
}

/**
 * Backup → validate → atomic write. The temp file is created next to the target so
 * the final rename stays on one filesystem, and keeps the original file mode.
 */
function writeAtomically(
  target: WriteTarget,
  content: string,
  trigger: WriteTrigger,
): ConfigResult {
  const { pathEntryId, absolutePath } = target;
  const format = detectFormat(absolutePath);
  const { dialect } = preferredDialect(target.agent, absolutePath);

  const validation = validateConfig(content, format, dialect);
  if (!validation.valid) {
    const error = new SafeWriteError(
      validation.errors.map((e) => `${e.field}: ${e.message}`).join('; '),
      400,
    );
    throw Object.assign(error, { errors: validation.errors });
  }

  const contentBefore = readCurrent(absolutePath);

  let backupPath = '';
  if (contentBefore) {
    try {
      backupPath = createBackup(pathEntryId, contentBefore);
    } catch (err) {
      throw new SafeWriteError(
        `Failed to create backup: ${err instanceof Error ? err.message : String(err)}`,
        500,
      );
    }
  }

  const targetDir = dirname(absolutePath);
  mkdirSync(targetDir, { recursive: true });
  const tempPath = join(
    targetDir,
    `.${basename(absolutePath)}.aidit-${randomBytes(6).toString('hex')}`,
  );
  const mode = existsSync(absolutePath) ? statSync(absolutePath).mode & 0o777 : 0o600;

  try {
    writeFileSync(tempPath, content, { encoding: 'utf-8', mode });
    renameSync(tempPath, absolutePath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw new SafeWriteError(
      `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  try {
    pruneBackups(pathEntryId);
  } catch {
    /* non-fatal */
  }

  insertWriteLog({
    path_entry_id: pathEntryId,
    absolute_path: absolutePath,
    backup_path: backupPath,
    content_before: contentBefore,
    content_after: content,
    triggered_by: trigger,
  });

  return readConfig(target);
}

/** Replaces the whole file with `content` (raw editor saves, restores). */
export function safeWrite(
  pathEntryId: string,
  content: string,
  triggeredBy: WriteTrigger = 'user_json',
  cwd?: string,
): ConfigResult {
  return writeAtomically(resolveTarget(pathEntryId, cwd), content, triggeredBy);
}

/** Applies a structured server change (add / edit / delete / toggle). */
export function applyServerChange(
  pathEntryId: string,
  operation: ServerOperation,
  triggeredBy: WriteTrigger = 'user_form',
  cwd?: string,
): ConfigResult {
  const target = resolveTarget(pathEntryId, cwd);
  const { dialect, options } = preferredDialect(target.agent, target.absolutePath);
  const current = readCurrent(target.absolutePath);
  const next = applyServerOperation(
    current,
    detectFormat(target.absolutePath),
    dialect,
    options,
    operation,
  );
  return writeAtomically(target, next, triggeredBy);
}

export function restoreBackup(pathEntryId: string, filename: string): ConfigResult {
  const content = readBackupContent(pathEntryId, filename);
  return safeWrite(pathEntryId, content, 'restore');
}
