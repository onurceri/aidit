import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
} from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';
import { load as parseYaml } from 'js-yaml';
import { getEntryById } from '../db/pathRegistry.js';
import { resolvePath } from '../scanner/pathResolver.js';
import { extractMcpServers } from '../scanner/mcpExtractor.js';
import { insertWriteLog } from '../db/writeLog.js';
import { createBackup, pruneBackups, readBackupContent } from './backupManager.js';
import { parseConfigFile, readConfigMeta } from '../scanner/configParser.js';
import type { ConfigResult } from '../scanner/types.js';

export class SafeWriteError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
  ) {
    super(message);
    this.name = 'SafeWriteError';
  }
}

function detectFormat(filePath: string): 'json' | 'jsonc' | 'yaml' {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jsonc') return 'jsonc';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  return 'json';
}

function validateContent(content: string, format: 'json' | 'jsonc' | 'yaml'): object {
  if (format === 'yaml') {
    try {
      const parsed = parseYaml(content);
      if (parsed === undefined || parsed === null) {
        throw new SafeWriteError('YAML content is empty', 400);
      }
      if (typeof parsed !== 'object') {
        throw new SafeWriteError('YAML content must be an object', 400);
      }
      return parsed as object;
    } catch (err) {
      if (err instanceof SafeWriteError) throw err;
      throw new SafeWriteError(
        `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
        400,
      );
    }
  }

  const errors: ParseError[] = [];
  const parsed = parseJsonc(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  if (errors.length > 0) {
    const messages = errors.map((e) => printParseErrorCode(e.error));
    throw new SafeWriteError(`Invalid JSON: ${messages.join('; ')}`, 400);
  }

  if (parsed === null || parsed === undefined) {
    throw new SafeWriteError('Content is empty or contains only comments', 400);
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SafeWriteError('JSON content must be an object', 400);
  }

  return parsed as object;
}

export function safeWrite(
  pathEntryId: string,
  content: string,
  format?: 'json' | 'jsonc' | 'yaml',
  triggeredBy: 'user_form' | 'user_json' | 'sync' | 'restore' = 'user_json',
): ConfigResult {
  const row = getEntryById(pathEntryId);
  if (!row) {
    throw new SafeWriteError(`Path entry "${pathEntryId}" not found`, 404);
  }

  const absolutePath = resolvePath(row.path);
  const resolvedFormat = format ?? detectFormat(absolutePath);

  validateContent(content, resolvedFormat);

  let contentBefore = '';
  if (existsSync(absolutePath)) {
    contentBefore = readFileSync(absolutePath, 'utf-8');
  }

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

  const tmpName = `.aidit_tmp_${randomBytes(8).toString('hex')}`;
  const tempPath = join(targetDir, tmpName);

  try {
    writeFileSync(tempPath, content, 'utf-8');
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw new SafeWriteError(
      `Failed to write temp file: ${err instanceof Error ? err.message : String(err)}`,
      500,
    );
  }

  try {
    renameSync(tempPath, absolutePath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      /* ignore */
    }
    throw new SafeWriteError(
      `Failed to atomically rename temp file: ${err instanceof Error ? err.message : String(err)}`,
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
    triggered_by: triggeredBy,
  });

  const parseResult = parseConfigFile(absolutePath);
  const meta = readConfigMeta(absolutePath);

  let mcpServers: ConfigResult['mcpServers'] = [];
  if (parseResult.parsed) {
    try {
      mcpServers = extractMcpServers(parseResult.parsed);
    } catch {
      /* empty on extraction failure */
    }
  }

  return {
    pathEntryId,
    absolutePath,
    scope: row.scope,
    format: parseResult.format,
    raw: parseResult.raw,
    parsed: parseResult.parsed,
    mcpServers,
    parseError: parseResult.parseError,
    lastModified: meta.lastModified,
    sizeBytes: meta.sizeBytes,
  };
}

export function restoreBackup(pathEntryId: string, filename: string): ConfigResult {
  const content = readBackupContent(pathEntryId, filename);
  return safeWrite(pathEntryId, content, undefined, 'restore');
}
