import { Router } from 'express';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from '../dataDir.js';
import { loadRegistry, saveRegistry } from '../registry/pathRegistry.js';
import type { PathEntry } from '../registry/pathRegistry.js';
import { BUILTIN_PATHS } from '../registry/builtins.js';
import {
  resetBuiltins as dbResetBuiltins,
  upsertEntry,
  getAllEntries,
} from '../db/pathRegistry.js';
import { resolvePath, isGlobPattern, expandGlob } from '../scanner/pathResolver.js';
import { reinitializeWatcher } from '../watcher/fileWatcher.js';
import { broadcast } from '../watcher/wsServer.js';

const router: ReturnType<typeof Router> = Router();

const BACKUP_BASE = join(DATA_DIR, 'backups', 'path-registry');

const REQUIRED_FIELDS = ['id', 'label', 'path', 'type', 'scope', 'source'] as const;

/** Entry ids become backup directory names, so they must be plain path segments. */
const ENTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENTRY_TYPES = new Set(['mcp-config', 'skills-dir', 'unknown']);
const ENTRY_SCOPES = new Set(['global', 'project']);
const ENTRY_SOURCES = new Set(['builtin', 'user']);

function validateEntryValues(entry: Record<string, unknown>): string | null {
  const id = entry.id as string;
  if (!ENTRY_ID.test(id) || id.includes('..')) return 'id';
  if (!ENTRY_TYPES.has(entry.type as string)) return 'type';
  if (!ENTRY_SCOPES.has(entry.scope as string)) return 'scope';
  if (!ENTRY_SOURCES.has(entry.source as string)) return 'source';
  if (entry.agent !== undefined && entry.agent !== null && typeof entry.agent !== 'string') {
    return 'agent';
  }
  return null;
}

function backupRegistry(): string {
  mkdirSync(BACKUP_BASE, { recursive: true });
  const registry = loadRegistry();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}.json`;
  const backupPath = join(BACKUP_BASE, filename);
  writeFileSync(backupPath, JSON.stringify(registry, null, 2), 'utf-8');
  return backupPath;
}

function asyncReinit(): void {
  reinitializeWatcher()
    .then(() => {
      broadcast({ event: 'registry:updated', timestamp: new Date().toISOString() });
    })
    .catch((err: unknown) => {
      console.error('[paths] watcher reinit error:', err);
    });
}

router.get('/', (_req, res) => {
  const registry = loadRegistry();
  res.status(200).json(registry);
});

router.put('/', (req, res) => {
  const body = req.body;

  if (!body || !Array.isArray(body.entries)) {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include an "entries" array',
    });
    return;
  }

  const entries = body.entries as unknown[];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i] as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} must be an object`,
        index: i,
      });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof entry[field] !== 'string' || !entry[field]) {
        res.status(400).json({
          error: 'invalid_entry',
          message: `Entry at index ${i} is missing required field "${field}"`,
          field,
          index: i,
        });
        return;
      }
    }
    if (typeof entry.enabled !== 'boolean') {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} is missing required field "enabled"`,
        field: 'enabled',
        index: i,
      });
      return;
    }
    const invalidField = validateEntryValues(entry);
    if (invalidField) {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} has an invalid "${invalidField}"`,
        field: invalidField,
        index: i,
      });
      return;
    }
  }

  try {
    backupRegistry();
    saveRegistry(entries as PathEntry[]);
  } catch (err) {
    res.status(500).json({
      error: 'registry_write_failed',
      message: err instanceof Error ? err.message : 'Failed to write registry',
    });
    return;
  }

  asyncReinit();

  const updated = loadRegistry();
  res.status(200).json(updated);
});

router.post('/test', (req, res) => {
  const { path } = (req.body as { path?: string }) ?? {};

  if (!path || typeof path !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "path" as a string',
    });
    return;
  }

  try {
    const resolved = resolvePath(path);

    let found = false;
    let matches: string[] = [];

    if (isGlobPattern(path)) {
      matches = expandGlob(path, { absolute: true, deep: 4 });
      found = matches.length > 0;
    } else {
      found = existsSync(resolved);
      if (found) {
        matches = [resolved];
      }
    }

    res.status(200).json({ resolved, found, matches });
  } catch (err) {
    res.status(500).json({
      error: 'path_test_failed',
      message: err instanceof Error ? err.message : 'Failed to test path',
    });
  }
});

router.get('/export', (_req, res) => {
  const registry = loadRegistry();
  const exportData = {
    exportedAt: new Date().toISOString(),
    version: registry.version,
    entries: registry.entries,
  };

  res
    .setHeader('Content-Type', 'application/json')
    .setHeader('Content-Disposition', 'attachment; filename="aidit-path-registry.json"')
    .status(200)
    .json(exportData);
});

router.post('/import', (req, res) => {
  const body = req.body;

  if (!body || !Array.isArray(body.entries)) {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include an "entries" array',
    });
    return;
  }

  const fileEntries = body.entries as unknown[];

  for (let i = 0; i < fileEntries.length; i++) {
    const entry = fileEntries[i] as Record<string, unknown>;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} must be an object`,
        index: i,
      });
      return;
    }
    for (const field of REQUIRED_FIELDS) {
      if (typeof entry[field] !== 'string' || !entry[field]) {
        res.status(400).json({
          error: 'invalid_entry',
          message: `Entry at index ${i} is missing required field "${field}"`,
          field,
          index: i,
        });
        return;
      }
    }
    if (typeof entry.enabled !== 'boolean') {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} is missing required field "enabled"`,
        field: 'enabled',
        index: i,
      });
      return;
    }
    const invalidField = validateEntryValues(entry);
    if (invalidField) {
      res.status(400).json({
        error: 'invalid_entry',
        message: `Entry at index ${i} has an invalid "${invalidField}"`,
        field: invalidField,
        index: i,
      });
      return;
    }
  }

  const existingEntries = getAllEntries();
  const existingIds = new Set(existingEntries.map((e) => e.id));

  let added = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of fileEntries) {
    const entry = raw as Record<string, unknown>;

    if (typeof entry.source === 'string' && entry.source === 'builtin') {
      skipped += 1;
      continue;
    }

    const id = entry.id as string;

    if (existingIds.has(id)) {
      skipped += 1;
      continue;
    }

    try {
      upsertEntry({
        id,
        label: entry.label as string,
        path: entry.path as string,
        type: (entry.type as PathEntry['type']) || 'mcp-config',
        agent: (entry.agent as string | null) || null,
        scope: (entry.scope as PathEntry['scope']) || 'global',
        source: 'user',
        enabled: entry.enabled as boolean,
        sort_order: 0,
      });
      added += 1;
    } catch (err) {
      errors.push(`Failed to import "${id}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  asyncReinit();

  const updated = loadRegistry();
  res.status(200).json({
    added,
    skipped,
    errors,
    registry: updated,
  });
});

router.post('/reset-builtins', (_req, res) => {
  try {
    dbResetBuiltins(BUILTIN_PATHS);
  } catch (err) {
    res.status(500).json({
      error: 'reset_builtins_failed',
      message: err instanceof Error ? err.message : 'Failed to reset builtins',
    });
    return;
  }

  asyncReinit();

  const updated = loadRegistry();
  res.status(200).json(updated);
});

router.post('/reset-entry', (req, res) => {
  const { id } = (req.body as { id?: string }) ?? {};

  if (!id || typeof id !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "id" as a string',
    });
    return;
  }

  const builtin = BUILTIN_PATHS.find((b) => b.id === id);
  if (!builtin) {
    res.status(404).json({
      error: 'not_builtin',
      message: `No builtin entry found with id "${id}"`,
    });
    return;
  }

  try {
    upsertEntry({ ...builtin, source: 'builtin' });
  } catch (err) {
    res.status(500).json({
      error: 'reset_entry_failed',
      message: err instanceof Error ? err.message : 'Failed to reset entry',
    });
    return;
  }

  asyncReinit();

  const updated = loadRegistry();
  res.status(200).json(updated);
});

export default router;
