import { Router } from 'express';
import { existsSync } from 'node:fs';
import { getEntryById } from '../db/pathRegistry.js';
import { resolvePath } from '../scanner/pathResolver.js';
import { parseConfigFile, readConfigMeta } from '../scanner/configParser.js';
import { extractMcpServers } from '../scanner/mcpExtractor.js';
import { safeWrite, SafeWriteError } from '../writer/safeWriter.js';
import { validateConfig } from '../validation/validator.js';
import { getHistory, getById as getWriteLogById } from '../db/writeLog.js';
import { getByAbsolutePath as getDiscoveredFile } from '../db/discoveredFiles.js';
import type { ConfigResult } from '../scanner/types.js';

const router: ReturnType<typeof Router> = Router();

function buildConfigResult(
  row: ReturnType<typeof getEntryById>,
  pathEntryId: string,
): ConfigResult | null {
  if (!row) return null;

  const absolutePath = resolvePath(row.path);

  if (!existsSync(absolutePath)) return null;

  const parseResult = parseConfigFile(absolutePath);
  const meta = readConfigMeta(absolutePath);

  let mcpServers: ConfigResult['mcpServers'] = [];
  if (parseResult.parsed) {
    try {
      mcpServers = extractMcpServers(parseResult.parsed);
    } catch {
      // Return empty mcpServers on extraction failure
    }
  }

  const df = getDiscoveredFile(absolutePath);

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
    firstSeenAt: df?.first_seen_at,
  };
}

router.get('/:pathEntryId', (req, res) => {
  const { pathEntryId } = req.params;
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;

  const row = getEntryById(pathEntryId);

  if (!row) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  const absolutePath = resolvePath(row.path, cwd);

  if (!existsSync(absolutePath)) {
    res.status(404).json({
      error: 'file_not_found',
      message: `Resolved path "${absolutePath}" does not exist on disk`,
      pathEntryId,
      absolutePath,
    });
    return;
  }

  const result = buildConfigResult(row, pathEntryId);
  if (!result) {
    res.status(500).json({ error: 'read_failed', message: 'Failed to read config file' });
    return;
  }

  res.status(200).json(result);
});

router.patch('/:pathEntryId', (req, res) => {
  const { pathEntryId } = req.params;
  const { content, format } = req.body as {
    content?: string;
    format?: string;
  };

  if (!content || typeof content !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "content" as a string',
    });
    return;
  }

  const resolvedFormat = format === 'yaml' ? 'yaml' : 'json';

  const validation = validateConfig(content, resolvedFormat);
  if (!validation.valid) {
    res.status(400).json({
      error: 'validation_failed',
      message: 'Config content failed validation',
      errors: validation.errors,
    });
    return;
  }

  try {
    const result = safeWrite(pathEntryId, content, resolvedFormat, 'user_form');
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof SafeWriteError) {
      res.status(err.statusCode).json({
        error: 'write_failed',
        message: err.message,
      });
      return;
    }
    res.status(500).json({
      error: 'write_failed',
      message: err instanceof Error ? err.message : 'Unknown write error',
    });
  }
});

router.get('/:pathEntryId/history', (req, res) => {
  const { pathEntryId } = req.params;

  const row = getEntryById(pathEntryId);
  if (!row) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  const entries = getHistory(pathEntryId);

  const mapped = entries.map((e) => ({
    id: e.id,
    writtenAt: e.written_at,
    trigger: e.triggered_by,
    backupPath: e.backup_path,
    contentBeforePreview: e.content_before.slice(0, 200),
    contentAfterPreview: e.content_after.slice(0, 200),
  }));

  res.status(200).json({ pathEntryId, entries: mapped });
});

router.get('/:pathEntryId/history/:writeLogId', (req, res) => {
  const { pathEntryId, writeLogId } = req.params;

  const row = getEntryById(pathEntryId);
  if (!row) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  const entry = getWriteLogById(Number(writeLogId));
  if (!entry || entry.path_entry_id !== pathEntryId) {
    res.status(404).json({ error: 'not_found', message: 'Write log entry not found' });
    return;
  }

  res.status(200).json({
    id: entry.id,
    writtenAt: entry.written_at,
    trigger: entry.triggered_by,
    contentBefore: entry.content_before,
    contentAfter: entry.content_after,
  });
});

router.post('/:pathEntryId/history/:writeLogId/restore', (req, res) => {
  const { pathEntryId, writeLogId } = req.params;

  const row = getEntryById(pathEntryId);
  if (!row) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  const entry = getWriteLogById(Number(writeLogId));
  if (!entry || entry.path_entry_id !== pathEntryId) {
    res.status(404).json({ error: 'not_found', message: 'Write log entry not found' });
    return;
  }

  try {
    const absolutePath = resolvePath(row.path);
    const format: 'json' | 'jsonc' | 'yaml' | undefined =
      absolutePath.endsWith('.yaml') || absolutePath.endsWith('.yml')
        ? 'yaml'
        : absolutePath.endsWith('.jsonc')
          ? 'jsonc'
          : undefined;

    const result = safeWrite(pathEntryId, entry.content_after, format, 'restore');
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof SafeWriteError) {
      res.status(err.statusCode).json({
        error: 'restore_failed',
        message: err.message,
      });
      return;
    }
    res.status(500).json({
      error: 'restore_failed',
      message: err instanceof Error ? err.message : 'Unknown restore error',
    });
  }
});

export default router;
