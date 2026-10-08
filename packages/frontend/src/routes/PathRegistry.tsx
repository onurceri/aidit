import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Plus,
  Loader,
  AlertTriangle,
  TestTube2,
  Info,
  X,
  Download,
  Upload,
  ArrowLeft,
} from 'lucide-react';
import { PathTable, type PathStatus } from '../components/PathTable';
import { ConfirmModal } from '../components/ConfirmModal';
import { Page } from '../components/Layout';
import { useToast } from '../context/ToastContext';
import {
  fetchPaths,
  putPaths,
  testPath,
  resetEntry,
  resetBuiltins,
  exportPaths,
  importPaths,
  type PathEntry,
  type PathRegistry,
} from '../api/client';

type AddFormState = {
  label: string;
  path: string;
  type: PathEntry['type'];
  agent: string;
  scope: 'global' | 'project';
  enabled: boolean;
};

const EMPTY_FORM: AddFormState = {
  label: '',
  path: '',
  type: 'mcp-config',
  agent: '',
  scope: 'global',
  enabled: true,
};

function entryId(): string {
  return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function PathRegistry() {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<PathEntry[]>([]);
  const [pathStatuses, setPathStatuses] = useState<Map<string, PathStatus>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState<AddFormState>(EMPTY_FORM);
  const [testResult, setTestResult] = useState<{
    found: boolean;
    resolved: string;
    matches: string[];
  } | null>(null);
  const [testing, setTesting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [showResetAllModal, setShowResetAllModal] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    added: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedRef = useRef(false);

  const loadRegistry = useCallback(async () => {
    try {
      setError(null);
      const data = await fetchPaths();
      setEntries(data.entries);
      return data.entries;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load path registry');
      return [];
    }
  }, []);

  const checkStatuses = useCallback(async (entries: PathEntry[]) => {
    const statuses = new Map<string, PathStatus>();
    const results = await Promise.allSettled(
      entries
        .filter((e) => e.enabled)
        .map(async (entry) => {
          const result = await testPath(entry.path);
          return { id: entry.id, ...result };
        }),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        statuses.set(r.value.id, {
          found: r.value.found,
          resolved: r.value.resolved,
          matches: r.value.matches,
        });
      }
    }
    setPathStatuses(statuses);
  }, []);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;

    (async () => {
      setLoading(true);
      const loaded = await loadRegistry();
      await checkStatuses(loaded);
      setLoading(false);
    })();
  }, [loadRegistry, checkStatuses]);

  const saveEntries = useCallback(
    async (updated: PathEntry[]) => {
      setSaving(true);
      setError(null);
      try {
        const registry: PathRegistry = { version: 1, entries: updated };
        const result = await putPaths(registry);
        setEntries(result.entries);
        await checkStatuses(result.entries);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save');
        addToast('error', err instanceof Error ? err.message : 'Failed to save');
      } finally {
        setSaving(false);
      }
    },
    [checkStatuses, addToast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const updated = entries.filter((e) => e.id !== id);
      await saveEntries(updated);
    },
    [entries, saveEntries],
  );

  const handleResetEntry = useCallback(
    async (id: string) => {
      setSaving(true);
      setError(null);
      try {
        const result = await resetEntry(id);
        setEntries(result.entries);
        await checkStatuses(result.entries);
        addToast('success', 'Entry reset to default');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to reset entry');
        addToast('error', err instanceof Error ? err.message : 'Failed to reset entry');
      } finally {
        setSaving(false);
      }
    },
    [checkStatuses, addToast],
  );

  const handleResetAllBuiltins = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await resetBuiltins();
      setEntries(result.entries);
      await checkStatuses(result.entries);
      addToast('success', 'Built-in entries reset to defaults');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset built-ins');
      addToast('error', err instanceof Error ? err.message : 'Failed to reset built-ins');
    } finally {
      setSaving(false);
    }
  }, [checkStatuses, addToast]);

  const handleTestPath = useCallback(async () => {
    if (!addForm.path.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testPath(addForm.path.trim());
      setTestResult(result);
    } catch {
      setTestResult({ found: false, resolved: '', matches: [] });
    } finally {
      setTesting(false);
    }
  }, [addForm.path]);

  const handleAddEntry = useCallback(async () => {
    if (!addForm.label.trim() || !addForm.path.trim()) return;

    const newEntry: PathEntry = {
      id: entryId(),
      label: addForm.label.trim(),
      path: addForm.path.trim(),
      type: addForm.type,
      agent: addForm.agent.trim() || null,
      scope: addForm.scope,
      source: 'user',
      enabled: addForm.enabled,
    };

    const updated = [...entries, newEntry];
    await saveEntries(updated);
    setAddForm(EMPTY_FORM);
    setShowAddForm(false);
    setTestResult(null);
  }, [addForm, entries, saveEntries]);

  const handleExport = useCallback(async () => {
    try {
      await exportPaths();
      addToast('success', 'Registry exported');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Export failed');
    }
  }, [addToast]);

  const handleImport = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setImporting(true);
      setImportResult(null);
      setError(null);

      try {
        const result = await importPaths(file);
        setImportResult(result);
        setEntries(result.registry.entries);
        await checkStatuses(result.registry.entries);
        addToast('success', `Imported ${result.added} entries`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Import failed');
        addToast('error', err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [checkStatuses, addToast],
  );

  const builtinCount = entries.filter((e) => e.source === 'builtin').length;
  const enabledCount = entries.filter((e) => e.enabled).length;

  if (loading) {
    return (
      <Page title="Path registry">
        <div className="flex items-center justify-center min-h-[50vh]">
          <Loader className="w-5 h-5 text-fg-2 animate-spin" />
        </div>
      </Page>
    );
  }

  return (
    <Page
      title="Path registry"
      description={`${entries.length} entries · ${builtinCount} built-in · ${enabledCount} enabled`}
      actions={
        <>
          <Link to="/settings" className="btn-ghost btn-sm">
            <ArrowLeft className="w-3.5 h-3.5" />
            Settings
          </Link>
          <div className="flex items-center gap-2">
            <button onClick={handleExport} className="btn-secondary btn-sm">
              <Download className="w-3.5 h-3.5" />
              Export
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="btn-secondary btn-sm"
            >
              <Upload className="w-3.5 h-3.5" />
              {importing ? 'Importing' : 'Import'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => setShowResetAllModal(true)}
              disabled={saving}
              className="btn-secondary btn-sm"
            >
              Reset built-ins
            </button>
            <button
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (showAddForm) {
                  setAddForm(EMPTY_FORM);
                  setTestResult(null);
                }
              }}
              className="btn-primary btn-sm"
            >
              <Plus className="w-3.5 h-3.5" />
              Add entry
            </button>
          </div>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {error ? (
          <div className="card p-4 flex items-start gap-3 border-border-strong">
            <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0 mt-0.5" />
            <p className="text-sm text-fg">{error}</p>
          </div>
        ) : null}

        {importResult ? (
          <div className="card p-4 border-border-strong">
            <p className="text-sm text-fg">
              Import complete: {importResult.added} added, {importResult.skipped} skipped
            </p>
            {importResult.errors.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-fg-2 list-disc list-inside">
                {importResult.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <PathTable
          entries={entries}
          pathStatuses={pathStatuses}
          onUpdate={saveEntries}
          onDelete={(id) => setDeleteTarget(id)}
          onResetEntry={(id) => setResetTarget(id)}
          saving={saving}
        />

        {showAddForm ? (
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-fg">Add new entry</h2>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setAddForm(EMPTY_FORM);
                  setTestResult(null);
                }}
                className="btn-icon"
                aria-label="Close add form"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label">Label</label>
                <input
                  value={addForm.label}
                  onChange={(e) => setAddForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="My custom config"
                  className="input"
                />
              </div>
              <div>
                <label className="label">Agent</label>
                <input
                  value={addForm.agent}
                  onChange={(e) => setAddForm((f) => ({ ...f, agent: e.target.value }))}
                  placeholder="claude-code"
                  className="input"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="label">Path</label>
              <div className="flex gap-2">
                <input
                  value={addForm.path}
                  onChange={(e) => {
                    setAddForm((f) => ({ ...f, path: e.target.value }));
                    setTestResult(null);
                  }}
                  placeholder="~/.config/custom/mcp.json"
                  className="input flex-1 font-mono"
                />
                <button
                  onClick={handleTestPath}
                  disabled={testing || !addForm.path.trim()}
                  className="btn-secondary"
                >
                  <TestTube2 className="w-4 h-4" />
                  {testing ? 'Testing' : 'Test path'}
                </button>
              </div>
              {testResult ? (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-fg-2">
                  <Info className="w-3.5 h-3.5" />
                  {testResult.found
                    ? `Found: ${testResult.resolved}${
                        testResult.matches.length > 1
                          ? ` (${testResult.matches.length} matches)`
                          : ''
                      }`
                    : 'No files found at this path. You can still save.'}
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="label">Type</label>
                <div className="flex gap-1 p-0.5 rounded-md border border-border bg-surface-2 w-fit">
                  {(['mcp-config', 'skills-dir', 'unknown'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setAddForm((f) => ({ ...f, type: t }))}
                      className={`h-7 px-2.5 rounded text-xs font-medium transition-colors ${
                        addForm.type === t ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Scope</label>
                <div className="flex gap-1 p-0.5 rounded-md border border-border bg-surface-2 w-fit">
                  {(['global', 'project'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setAddForm((f) => ({ ...f, scope: s }))}
                      className={`h-7 px-2.5 rounded text-xs font-medium transition-colors ${
                        addForm.scope === s ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="label">Enabled</label>
                <button
                  onClick={() => setAddForm((f) => ({ ...f, enabled: !f.enabled }))}
                  role="switch"
                  aria-checked={addForm.enabled}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                    addForm.enabled ? 'bg-fg' : 'bg-fg-3'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                      addForm.enabled ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={handleAddEntry}
                disabled={saving || !addForm.label.trim() || !addForm.path.trim()}
                className="btn-primary"
              >
                <Plus className="w-4 h-4" />
                {saving ? 'Adding' : 'Add entry'}
              </button>
            </div>
          </div>
        ) : null}

        <ConfirmModal
          open={deleteTarget !== null}
          title="Delete path entry"
          description="Are you sure you want to delete this entry? This action cannot be undone."
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => {
            if (deleteTarget) {
              handleDelete(deleteTarget);
              setDeleteTarget(null);
            }
          }}
          onCancel={() => setDeleteTarget(null)}
        />

        <ConfirmModal
          open={resetTarget !== null}
          title="Reset to default"
          description="Reset this entry to its original shipped values? Any custom edits will be lost."
          confirmLabel="Reset"
          variant="default"
          onConfirm={() => {
            if (resetTarget) {
              handleResetEntry(resetTarget);
              setResetTarget(null);
            }
          }}
          onCancel={() => setResetTarget(null)}
        />

        <ConfirmModal
          open={showResetAllModal}
          title="Reset all built-ins"
          description={`This will reset all ${builtinCount} built-in entries to their default values. User-added entries will not be affected.`}
          confirmLabel="Reset all"
          variant="default"
          onConfirm={() => {
            handleResetAllBuiltins();
            setShowResetAllModal(false);
          }}
          onCancel={() => setShowResetAllModal(false)}
        />
      </div>
    </Page>
  );
}
