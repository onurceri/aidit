import { Router } from 'express';
import { execFile } from 'node:child_process';
import { mkdirSync } from 'node:fs';
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

  if (!key || typeof key !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/.test(key)) {
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
  // Fixed binary + argv array: no shell, so the path can never be interpreted as a command.
  const opener =
    process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';

  try {
    mkdirSync(BACKUP_BASE, { recursive: true });
  } catch {
    /* reported by the opener below */
  }

  execFile(opener, [BACKUP_BASE], (err) => {
    // explorer.exe exits with code 1 even on success.
    if (err && process.platform !== 'win32') {
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
