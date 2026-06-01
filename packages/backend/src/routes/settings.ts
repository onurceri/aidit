import { Router } from 'express';
import { exec } from 'node:child_process';
import { getAllSettings, setSetting } from '../db/settings.js';
import { BACKUP_BASE } from '../writer/backupManager.js';

const router: ReturnType<typeof Router> = Router();

router.get('/', (_req, res) => {
  try {
    const settings = getAllSettings();
    res.status(200).json(settings);
  } catch (err) {
    res.status(500).json({
      error: 'settings_read_failed',
      message: err instanceof Error ? err.message : 'Failed to read settings',
    });
  }
});

router.put('/', (req, res) => {
  const { key, value } = req.body as { key?: string; value?: unknown };

  if (!key || typeof key !== 'string') {
    res.status(400).json({
      error: 'invalid_body',
      message: 'Request body must include "key" as a string and "value"',
    });
    return;
  }

  try {
    setSetting(key, value);
    res.status(200).json({ [key]: value });
  } catch (err) {
    res.status(500).json({
      error: 'settings_write_failed',
      message: err instanceof Error ? err.message : 'Failed to save setting',
    });
  }
});

router.post('/open-backup-folder', (_req, res) => {
  const cmd = process.platform === 'darwin' ? `open "${BACKUP_BASE}"` : `xdg-open "${BACKUP_BASE}"`;

  exec(cmd, (err) => {
    if (err) {
      res.status(500).json({
        error: 'open_folder_failed',
        message: err.message,
      });
      return;
    }
    res.status(200).json({ success: true });
  });
});

export default router;
