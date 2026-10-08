import { Router } from 'express';
import { listBackups, restoreBackup, SafeWriteError, BACKUP_BASE } from '../writer/index.js';
import { getAllEntries, getEntryById, type PathRegistryRow } from '../db/pathRegistry.js';

/** Backup files are always `<ISO timestamp>.bak`, written by backupManager. */
const BACKUP_FILENAME = /^[A-Za-z0-9_-][A-Za-z0-9_.-]*\.bak$/;

const router: ReturnType<typeof Router> = Router();

router.get('/', (_req, res) => {
  try {
    const entries = getAllEntries();
    const entryMap = new Map<string, PathRegistryRow>();
    for (const e of entries) {
      entryMap.set(e.id, e);
    }

    const result = entries.map((entry) => ({
      pathEntryId: entry.id,
      label: entry.label,
      backups: listBackups(entry.id),
    }));

    res.status(200).json({ backups: result, backupDir: BACKUP_BASE });
  } catch (err) {
    res.status(500).json({
      error: 'backups_list_failed',
      message: err instanceof Error ? err.message : 'Failed to list backups',
    });
  }
});

router.get('/:pathEntryId', (req, res) => {
  const { pathEntryId } = req.params;

  if (!getEntryById(pathEntryId)) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  try {
    const backups = listBackups(pathEntryId);
    res.status(200).json({ pathEntryId, backups });
  } catch (err) {
    res.status(500).json({
      error: 'backup_list_failed',
      message: err instanceof Error ? err.message : 'Failed to list backups',
    });
  }
});

router.post('/:pathEntryId/restore', (req, res) => {
  const { pathEntryId } = req.params;
  const { filename } = (req.body ?? {}) as { filename?: string };

  if (!filename || typeof filename !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "filename" as a string',
    });
    return;
  }

  // The filename is joined onto the backup dir; reject anything that could traverse out of it.
  if (!BACKUP_FILENAME.test(filename) || filename.includes('..')) {
    res.status(400).json({ error: 'invalid_filename', message: 'Invalid backup filename' });
    return;
  }

  if (!getEntryById(pathEntryId)) {
    res.status(404).json({ error: 'not_found', message: `Path entry "${pathEntryId}" not found` });
    return;
  }

  try {
    const result = restoreBackup(pathEntryId, filename);
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
      message: err instanceof Error ? err.message : 'Failed to restore backup',
    });
  }
});

export default router;
