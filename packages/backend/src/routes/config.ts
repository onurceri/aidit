import { Router, type Response } from 'express';
import { existsSync } from 'node:fs';
import { getEntryById } from '../db/pathRegistry.js';
import { resolvePath } from '../scanner/pathResolver.js';
import { readConfig } from '../scanner/readConfig.js';
import { safeWrite, applyServerChange, SafeWriteError } from '../writer/safeWriter.js';
import type { ServerOperation } from '../writer/mcpMutations.js';
import type { NormalizedServer } from '../scanner/dialects.js';
import { getHistory, getById as getWriteLogById } from '../db/writeLog.js';
import { getByAbsolutePath as getDiscoveredFile } from '../db/discoveredFiles.js';

const router: ReturnType<typeof Router> = Router();

function queryCwd(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function sendWriteError(res: Response, err: unknown, code = 'write_failed'): void {
  if (err instanceof SafeWriteError) {
    const errors = (err as SafeWriteError & { errors?: unknown }).errors;
    res.status(err.statusCode).json({ error: code, message: err.message, errors });
    return;
  }
  res.status(500).json({
    error: code,
    message: err instanceof Error ? err.message : 'Unknown write error',
  });
}

router.get('/:pathEntryId', (req, res) => {
  const { pathEntryId } = req.params;
  const cwd = queryCwd(req.query.cwd);

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

  const result = readConfig({ pathEntryId, absolutePath, scope: row.scope, agent: row.agent });
  res.status(200).json({
    ...result,
    firstSeenAt: getDiscoveredFile(absolutePath)?.first_seen_at,
  });
});

/** Replace the whole file (raw editor). */
router.patch('/:pathEntryId', (req, res) => {
  const { pathEntryId } = req.params;
  const { content } = req.body as { content?: unknown };

  if (typeof content !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "content" as a string',
    });
    return;
  }

  try {
    res.status(200).json(safeWrite(pathEntryId, content, 'user_json', queryCwd(req.query.cwd)));
  } catch (err) {
    sendWriteError(res, err);
  }
});

function parseServer(value: unknown): NormalizedServer | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const transport = v.transport;
  if (typeof v.name !== 'string' || !['stdio', 'sse', 'http'].includes(String(transport))) {
    return null;
  }
  const strings = (x: unknown): string[] | undefined =>
    Array.isArray(x) ? x.filter((s): s is string => typeof s === 'string') : undefined;
  const record = (x: unknown): Record<string, string> | undefined => {
    if (!x || typeof x !== 'object' || Array.isArray(x)) return undefined;
    return Object.fromEntries(
      Object.entries(x as Record<string, unknown>).filter(
        (e): e is [string, string] => typeof e[1] === 'string',
      ),
    );
  };
  return {
    name: v.name,
    transport: transport as NormalizedServer['transport'],
    command: typeof v.command === 'string' ? v.command : undefined,
    args: strings(v.args),
    env: record(v.env),
    url: typeof v.url === 'string' ? v.url : undefined,
    headers: record(v.headers),
    enabled: v.enabled !== false,
  };
}

/**
 * Structured server edits. Body:
 *   { op: 'upsert', server, originalName? } | { op: 'delete', name } | { op: 'toggle', name, enabled }
 * The backend translates the change into the agent's own config dialect and format.
 */
router.post('/:pathEntryId/servers', (req, res) => {
  const { pathEntryId } = req.params;
  const body = req.body as Record<string, unknown>;
  let operation: ServerOperation | null = null;

  if (body.op === 'upsert') {
    const server = parseServer(body.server);
    if (server) {
      operation = {
        op: 'upsert',
        server,
        originalName: typeof body.originalName === 'string' ? body.originalName : undefined,
      };
    }
  } else if (body.op === 'delete' && typeof body.name === 'string') {
    operation = { op: 'delete', name: body.name };
  } else if (
    body.op === 'toggle' &&
    typeof body.name === 'string' &&
    typeof body.enabled === 'boolean'
  ) {
    operation = { op: 'toggle', name: body.name, enabled: body.enabled };
  }

  if (!operation) {
    res.status(400).json({ error: 'invalid_body', message: 'Invalid server operation' });
    return;
  }

  const trigger = body.trigger === 'sync' ? 'sync' : 'user_form';
  try {
    res
      .status(200)
      .json(applyServerChange(pathEntryId, operation, trigger, queryCwd(req.query.cwd)));
  } catch (err) {
    sendWriteError(res, err);
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
    res.status(200).json(safeWrite(pathEntryId, entry.content_after, 'restore'));
  } catch (err) {
    sendWriteError(res, err, 'restore_failed');
  }
});

export default router;
