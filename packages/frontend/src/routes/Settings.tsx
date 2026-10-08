import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader,
  AlertTriangle,
  Trash2,
  Plus,
  FolderOpen,
  RotateCcw,
  ExternalLink,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { Page } from '../components/Layout';
import { displayPath } from '../lib/paths';
import { useScan } from '../hooks/useScan';
import { useToast } from '../context/ToastContext';
import { relativeTime } from '../lib/time';
import {
  fetchSettings,
  updateSetting,
  fetchPaths,
  fetchAllBackups,
  restoreBackup,
  openBackupFolder,
  resetBuiltins,
  type ConfigBackups,
  type BackupEntry,
  type PathEntry,
} from '../api/client';

type FlatBackup = BackupEntry & { pathEntryId: string; label: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function useDebouncedSave(key: string, delay = 500) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const save = useCallback(
    (value: unknown) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        updateSetting(key, value).catch(console.error);
      }, delay);
    },
    [key, delay],
  );

  const saveImmediate = useCallback(
    (value: unknown) => {
      clearTimeout(timerRef.current);
      updateSetting(key, value).catch(console.error);
    },
    [key],
  );

  return { save, saveImmediate };
}

export function Settings() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [apiPort, setApiPort] = useState(3001);
  const [uiPort, setUiPort] = useState(3000);
  const [backupRetention, setBackupRetention] = useState(10);
  useScan(); // re-render once the scan (and home dir) arrives so paths show as ~/…
  const [backupDir, setBackupDir] = useState('~/.config/aidit/backups');
  const [projectScanDirs, setProjectScanDirs] = useState<string[]>([]);
  const [newProjectDir, setNewProjectDir] = useState('');

  const [entries, setEntries] = useState<PathEntry[]>([]);
  const [backups, setBackups] = useState<ConfigBackups[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);

  const [restoreTarget, setRestoreTarget] = useState<FlatBackup | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [showResetBuiltinsModal, setShowResetBuiltinsModal] = useState(false);
  const [resettingBuiltins, setResettingBuiltins] = useState(false);

  const apiPortSave = useDebouncedSave('api_port');
  const uiPortSave = useDebouncedSave('ui_port');
  const retentionSave = useDebouncedSave('backup_retention');
  const { saveImmediate: dirsSave } = useDebouncedSave('project_scan_dirs', 0);

  const loadBackups = useCallback(async () => {
    setBackupsLoading(true);
    setBackupsError(null);
    try {
      const data = await fetchAllBackups();
      setBackups(data.backups);
      setBackupDir(data.backupDir);
    } catch (err) {
      setBackupsError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setBackupsLoading(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchSettings();
        setApiPort(Number(data.api_port) || 3001);
        setUiPort(Number(data.ui_port) || 3000);
        setBackupRetention(Number(data.backup_retention) || 10);
        setBackupDir(String(data.backup_dir || '~/.config/aidit/backups'));
        const dirs = Array.isArray(data.project_scan_dirs)
          ? (data.project_scan_dirs as string[])
          : [];
        setProjectScanDirs(dirs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load settings');
      }

      try {
        const pathData = await fetchPaths();
        setEntries(pathData.entries);
      } catch {
        // non-fatal
      }

      await loadBackups();
      setLoading(false);
    })();
  }, [loadBackups]);

  const handleApiPortChange = useCallback(
    (value: number) => {
      setApiPort(value);
      if (value > 0 && value < 65536) apiPortSave.save(value);
    },
    [apiPortSave],
  );

  const handleUiPortChange = useCallback(
    (value: number) => {
      setUiPort(value);
      if (value > 0 && value < 65536) uiPortSave.save(value);
    },
    [uiPortSave],
  );

  const handleRetentionChange = useCallback(
    (value: number) => {
      setBackupRetention(value);
      if (value > 0) retentionSave.save(value);
    },
    [retentionSave],
  );

  const handleAddProjectDir = useCallback(() => {
    const trimmed = newProjectDir.trim();
    if (!trimmed) return;
    const updated = [...projectScanDirs, trimmed];
    setProjectScanDirs(updated);
    setNewProjectDir('');
    dirsSave(updated);
  }, [newProjectDir, projectScanDirs, dirsSave]);

  const handleRemoveProjectDir = useCallback(
    (index: number) => {
      const updated = projectScanDirs.filter((_, i) => i !== index);
      setProjectScanDirs(updated);
      dirsSave(updated);
    },
    [projectScanDirs, dirsSave],
  );

  const handleOpenBackupFolder = useCallback(async () => {
    try {
      await openBackupFolder();
    } catch (err) {
      addToast(
        'error',
        `Failed to open folder: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    }
  }, [addToast]);

  const handleRestore = useCallback(async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreBackup(restoreTarget.pathEntryId, restoreTarget.filename);
      addToast('success', `Config restored from backup ${restoreTarget.filename}`);
      setRestoreTarget(null);
      await loadBackups();
    } catch (err) {
      addToast(
        'error',
        `Failed to restore: ${err instanceof Error ? err.message : 'backup file is corrupted'}`,
      );
    } finally {
      setRestoring(false);
    }
  }, [restoreTarget, loadBackups, addToast]);

  const handleResetBuiltins = useCallback(async () => {
    setResettingBuiltins(true);
    try {
      const result = await resetBuiltins();
      setEntries(result.entries);
      addToast('success', 'Built-in entries restored to defaults');
    } catch (err) {
      addToast(
        'error',
        `Failed to reset built-ins: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      setResettingBuiltins(false);
      setShowResetBuiltinsModal(false);
    }
  }, [addToast]);

  const builtinCount = entries.filter((e) => e.source === 'builtin').length;
  const userCount = entries.filter((e) => e.source === 'user').length;

  const flatBackups: FlatBackup[] = [];
  for (const cb of backups) {
    for (const b of cb.backups) {
      flatBackups.push({ ...b, pathEntryId: cb.pathEntryId, label: cb.label });
    }
  }
  flatBackups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  if (loading) {
    return (
      <Page title="Settings">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader className="w-5 h-5 text-fg-2 animate-spin" />
        </div>
      </Page>
    );
  }

  return (
    <Page title="Settings" description="Scan paths, backups and the path registry">
      <div className="max-w-4xl flex flex-col gap-6">
        {error ? (
          <div className="card p-4 flex items-start gap-3 border-border-strong">
            <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0 mt-0.5" />
            <p className="text-sm text-fg">{error}</p>
          </div>
        ) : null}

        <section className="card p-6">
          <h2 className="text-sm font-semibold text-fg mb-4">General</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">API port</label>
                <input
                  type="number"
                  value={apiPort || ''}
                  onChange={(e) => handleApiPortChange(Number(e.target.value))}
                  min={1}
                  max={65535}
                  className="input"
                />
              </div>
              <div>
                <label className="label">UI port</label>
                <input
                  type="number"
                  value={uiPort || ''}
                  onChange={(e) => handleUiPortChange(Number(e.target.value))}
                  min={1}
                  max={65535}
                  className="input"
                />
              </div>
            </div>

            <div>
              <label className="label">Project directories</label>
              {projectScanDirs.length > 0 ? (
                <ul className="mb-2 space-y-1.5">
                  {projectScanDirs.map((dir, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between rounded-md border border-border bg-surface-2 px-3 py-2 text-sm font-mono"
                    >
                      <span className="truncate">{dir}</span>
                      <button
                        onClick={() => handleRemoveProjectDir(i)}
                        className="btn-icon flex-shrink-0"
                        aria-label="Remove directory"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="flex gap-2">
                <input
                  value={newProjectDir}
                  onChange={(e) => setNewProjectDir(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddProjectDir()}
                  placeholder="/Users/you/Projects/my-agent"
                  className="input flex-1 font-mono"
                />
                <button
                  onClick={handleAddProjectDir}
                  disabled={!newProjectDir.trim()}
                  className="btn-primary"
                >
                  <Plus className="w-4 h-4" />
                  Add
                </button>
              </div>
              <p className="helper">Leave empty to only scan global configs.</p>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold text-fg">Path registry</h2>
              <p className="mt-1 text-sm text-fg-2">
                {entries.length} entries · {builtinCount} built-in · {userCount} user
              </p>
              <p className="mt-1 text-xs text-fg-3">
                Manage which config files and skills directories aidit scans.
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setShowResetBuiltinsModal(true)}
                disabled={resettingBuiltins || builtinCount === 0}
                className="btn-secondary"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {resettingBuiltins ? 'Resetting' : 'Reset built-ins'}
              </button>
              <Link to="/settings/paths" className="btn-primary">
                Manage
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-semibold text-fg mb-4">Backups</h2>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Backup retention</label>
                <input
                  type="number"
                  value={backupRetention || ''}
                  onChange={(e) => handleRetentionChange(Number(e.target.value))}
                  min={1}
                  className="input"
                />
                <p className="helper">Number of backups to keep per config file.</p>
              </div>
              <div>
                <label className="label">Backup directory</label>
                <div className="flex items-center gap-2">
                  <span className="input flex-1 truncate font-mono" title={backupDir}>
                    {displayPath(backupDir)}
                  </span>
                  <button onClick={handleOpenBackupFolder} className="btn-secondary flex-shrink-0">
                    <FolderOpen className="w-4 h-4" />
                    Open
                  </button>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-medium text-fg-2 mb-2">Recent backups</h3>

              {backupsError ? (
                <div className="card p-3 flex items-start gap-2 border-border-strong">
                  <AlertTriangle className="w-3.5 h-3.5 text-fg flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-fg">{backupsError}</p>
                </div>
              ) : null}

              {backupsLoading && !flatBackups.length ? (
                <div className="flex items-center justify-center py-8">
                  <Loader className="w-5 h-5 text-fg-2 animate-spin" />
                </div>
              ) : null}

              {!backupsLoading && !backupsError && flatBackups.length === 0 ? (
                <p className="helper py-3">No backups yet.</p>
              ) : null}

              {flatBackups.length > 0 ? (
                <div className="rounded-md border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-surface-2 text-fg-2">
                      <tr>
                        <th className="text-left font-medium px-3 py-2 text-xs">Config</th>
                        <th className="text-left font-medium px-3 py-2 text-xs">Filename</th>
                        <th className="text-left font-medium px-3 py-2 text-xs">Date</th>
                        <th className="text-left font-medium px-3 py-2 text-xs">Size</th>
                        <th className="text-right font-medium px-3 py-2 text-xs">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatBackups.map((b) => (
                        <tr
                          key={`${b.pathEntryId}-${b.filename}`}
                          className="border-t border-border"
                        >
                          <td className="px-3 py-2 text-fg">{b.label}</td>
                          <td className="px-3 py-2 text-fg-2 font-mono text-xs">{b.filename}</td>
                          <td className="px-3 py-2 text-fg-2">{relativeTime(b.createdAt)}</td>
                          <td className="px-3 py-2 text-fg-2">{formatBytes(b.sizeBytes)}</td>
                          <td className="px-3 py-2 text-right">
                            <button
                              onClick={() => setRestoreTarget(b)}
                              className="btn-secondary btn-sm"
                            >
                              Restore
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-semibold text-fg mb-4">About</h2>
          <div className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-fg-2">Version</span>
              <span className="font-mono text-fg">{__AIDIT_VERSION__}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-fg-2">GitHub</span>
              <a
                href="https://github.com/onurceri/aidit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-fg inline-flex items-center gap-1 hover:underline"
              >
                github.com/onurceri/aidit
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </section>

        <ConfirmModal
          open={restoreTarget !== null}
          title="Restore backup"
          description={`Restore ${restoreTarget?.filename}? This will overwrite the current config. A backup of the current state will be saved first.`}
          confirmLabel={restoring ? 'Restoring' : 'Restore'}
          variant="default"
          onConfirm={handleRestore}
          onCancel={() => setRestoreTarget(null)}
        />

        <ConfirmModal
          open={showResetBuiltinsModal}
          title="Re-initialize built-ins"
          description={`This will reset all ${builtinCount} built-in entries to their shipped defaults. User-added entries will not be affected.`}
          confirmLabel={resettingBuiltins ? 'Resetting' : 'Reset all'}
          variant="default"
          onConfirm={handleResetBuiltins}
          onCancel={() => setShowResetBuiltinsModal(false)}
        />
      </div>
    </Page>
  );
}
