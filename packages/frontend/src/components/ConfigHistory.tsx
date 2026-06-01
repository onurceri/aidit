import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X,
  Loader,
  AlertTriangle,
  Clock,
  RotateCcw,
  FileJson,
  Pencil,
  RefreshCw,
  History,
  Check,
  ChevronLeft,
} from 'lucide-react';
import { createPatch } from 'diff';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';
import { JsonEditor } from './JsonEditor';
import { ConfirmModal } from './ConfirmModal';
import { useToast } from '../context/ToastContext';
import {
  fetchConfigHistory,
  fetchConfigHistoryDetail,
  restoreHistory,
  type WriteLogHistoryEntry,
  type ConfigHistoryDetail,
} from '../api/client';
import { relativeTime } from '../lib/time';

interface ConfigHistoryProps {
  pathEntryId: string;
  configLabel: string;
  onClose: () => void;
  onRestoreComplete: () => void;
}

type ViewState = 'timeline' | 'detail' | 'diff';

function triggerLabel(trigger: WriteLogHistoryEntry['trigger']): string {
  switch (trigger) {
    case 'user_form':
      return 'Form edit';
    case 'user_json':
      return 'JSON edit';
    case 'sync':
      return 'Sync';
    case 'restore':
      return 'Restore';
  }
}

function TriggerIcon({
  trigger,
  className,
}: {
  trigger: WriteLogHistoryEntry['trigger'];
  className?: string;
}) {
  const cls = className ?? 'w-3.5 h-3.5';
  switch (trigger) {
    case 'user_form':
      return <Pencil className={cls} />;
    case 'user_json':
      return <FileJson className={cls} />;
    case 'sync':
      return <RefreshCw className={cls} />;
    case 'restore':
      return <RotateCcw className={cls} />;
  }
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function DiffView({
  oldStr,
  newStr,
  oldLabel,
  newLabel,
}: {
  oldStr: string;
  newStr: string;
  oldLabel: string;
  newLabel: string;
}) {
  const diffHtml = useMemo(() => {
    const patch = createPatch('config', oldStr, newStr, oldLabel, newLabel);
    return html(patch, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
    });
  }, [oldStr, newStr, oldLabel, newLabel]);

  return <div className="text-xs" dangerouslySetInnerHTML={{ __html: diffHtml }} />;
}

export function ConfigHistory({
  pathEntryId,
  configLabel,
  onClose,
  onRestoreComplete,
}: ConfigHistoryProps) {
  const { addToast } = useToast();
  const [entries, setEntries] = useState<WriteLogHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewState, setViewState] = useState<ViewState>('timeline');
  const [detailEntry, setDetailEntry] = useState<ConfigHistoryDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [diffData, setDiffData] = useState<{
    oldStr: string;
    newStr: string;
    oldLabel: string;
    newLabel: string;
  } | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConfigHistory(pathEntryId);
      setEntries(data.entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [pathEntryId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleClickEntry = useCallback(
    async (entryId: number) => {
      setViewState('detail');
      setDetailLoading(true);
      setDetailEntry(null);
      try {
        const detail = await fetchConfigHistoryDetail(pathEntryId, entryId);
        setDetailEntry(detail);
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to load entry');
        setViewState('timeline');
      } finally {
        setDetailLoading(false);
      }
    },
    [pathEntryId, addToast],
  );

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          const first = [...next][0];
          next.delete(first);
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleCompare = useCallback(async () => {
    const ids = [...selectedIds];
    if (ids.length !== 2) return;

    setDetailLoading(true);
    try {
      const [a, b] = await Promise.all([
        fetchConfigHistoryDetail(pathEntryId, ids[0]),
        fetchConfigHistoryDetail(pathEntryId, ids[1]),
      ]);

      const aTime = formatTimestamp(a.writtenAt);
      const bTime = formatTimestamp(b.writtenAt);
      const isAFirst = a.writtenAt < b.writtenAt;

      setDiffData({
        oldStr: isAFirst ? a.contentAfter : b.contentAfter,
        newStr: isAFirst ? b.contentAfter : a.contentAfter,
        oldLabel: isAFirst ? `${aTime} (older)` : `${bTime} (older)`,
        newLabel: isAFirst ? `${bTime} (newer)` : `${aTime} (newer)`,
      });
      setViewState('diff');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to load diff');
    } finally {
      setDetailLoading(false);
    }
  }, [pathEntryId, selectedIds, addToast]);

  const handleRestore = useCallback(async () => {
    if (restoreTarget === null) return;
    setRestoring(true);
    setRestoreError(null);
    try {
      await restoreHistory(pathEntryId, restoreTarget);
      addToast('success', 'Config restored successfully');
      setRestoreTarget(null);
      setViewState('timeline');
      onRestoreComplete();
      await loadEntries();
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : 'Restore failed');
      setRestoreTarget(null);
    } finally {
      setRestoring(false);
    }
  }, [pathEntryId, restoreTarget, onRestoreComplete, loadEntries, addToast]);

  const handleBack = useCallback(() => {
    setViewState('timeline');
    setDetailEntry(null);
    setDiffData(null);
    setRestoreError(null);
  }, []);

  const hasEntries = entries.length > 0;
  const compareEnabled = selectedIds.size === 2;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[90vh] bg-surface border border-border rounded-md shadow-md flex flex-col">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {viewState !== 'timeline' ? (
            <button
              onClick={handleBack}
              className="btn-icon"
              aria-label="Back to timeline"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : null}
          <History className="w-4 h-4 text-fg-2 flex-shrink-0" />
          <span className="text-sm font-semibold text-fg truncate">{configLabel}</span>
          <span className="text-xs text-fg-2">History</span>
          <button onClick={onClose} className="ml-auto btn-icon" aria-label="Close history">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-5 h-5 text-fg-2 animate-spin" />
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-col items-center gap-2 py-8 px-4">
              <AlertTriangle className="w-8 h-8 text-fg-3" />
              <p className="text-sm text-fg-2 text-center">{error}</p>
              <button onClick={loadEntries} className="btn-secondary btn-sm">
                Retry
              </button>
            </div>
          ) : null}

          {!loading && !error && !hasEntries ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-fg-2">
              <History className="w-10 h-10 mb-3" />
              <p className="text-sm font-medium text-fg">No change history yet</p>
              <p className="text-xs mt-1 text-center">Changes will appear here after editing.</p>
            </div>
          ) : null}

          {!loading && !error && hasEntries && viewState === 'timeline' ? (
            <div className="p-4">
              {compareEnabled ? (
                <div className="mb-3 p-3 card flex items-center justify-between">
                  <span className="text-sm text-fg">2 versions selected</span>
                  <button
                    onClick={handleCompare}
                    disabled={detailLoading}
                    className="btn-primary btn-sm"
                  >
                    {detailLoading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
                    {detailLoading ? 'Loading' : 'Compare'}
                  </button>
                </div>
              ) : null}

              <ol className="relative space-y-3">
                {entries.map((entry) => {
                  const isSelected = selectedIds.has(entry.id);
                  return (
                    <li
                      key={entry.id}
                      className="relative pl-6 before:absolute before:left-[7px] before:top-2.5 before:bottom-[-0.75rem] before:w-px before:bg-border last:before:hidden"
                    >
                      <span
                        className={`absolute left-1 top-2 w-2.5 h-2.5 rounded-full border-2 ${
                          isSelected
                            ? 'bg-fg border-fg'
                            : 'bg-surface border-fg-3'
                        }`}
                      />
                      <div className="card overflow-hidden flex">
                        <button
                          onClick={() => handleClickEntry(entry.id)}
                          className="flex-1 text-left p-3 hover:bg-hover transition-colors min-w-0"
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="badge">
                              <TriggerIcon trigger={entry.trigger} className="w-3 h-3" />
                              {triggerLabel(entry.trigger)}
                            </span>
                            <span className="flex items-center gap-1 text-xs text-fg-2">
                              <Clock className="w-3 h-3" />
                              {relativeTime(entry.writtenAt)}
                            </span>
                          </div>
                          <p className="text-xs text-fg-2 font-mono truncate">
                            {entry.contentAfterPreview || '\u00a0'}
                          </p>
                        </button>
                        <button
                          onClick={() => handleToggleSelect(entry.id)}
                          className={`w-12 flex-shrink-0 flex items-center justify-center border-l border-border ${
                            isSelected ? 'bg-surface-2' : 'hover:bg-hover'
                          }`}
                          title="Select for comparison"
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center ${
                              isSelected
                                ? 'bg-fg border-fg text-accent-fg'
                                : 'border-fg-3'
                            }`}
                          >
                            {isSelected ? <Check className="w-3 h-3" /> : null}
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          {viewState === 'detail' && detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="w-5 h-5 text-fg-2 animate-spin" />
            </div>
          ) : null}

          {viewState === 'detail' && detailEntry ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-2">
                <span className="badge">
                  <TriggerIcon trigger={detailEntry.trigger} className="w-3 h-3" />
                  {triggerLabel(detailEntry.trigger)}
                </span>
                <span className="text-xs text-fg-2">
                  {formatTimestamp(detailEntry.writtenAt)}
                </span>
              </div>

              <div>
                <h4 className="text-xs font-medium text-fg-2 mb-2">Before</h4>
                <div className="card overflow-hidden">
                  <JsonEditor content={detailEntry.contentBefore || ''} readOnly={true} />
                </div>
              </div>

              <div>
                <h4 className="text-xs font-medium text-fg-2 mb-2">After</h4>
                <div className="card overflow-hidden">
                  <JsonEditor content={detailEntry.contentAfter} readOnly={true} />
                </div>
              </div>

              <button
                onClick={() => setRestoreTarget(detailEntry.id)}
                disabled={restoring}
                className="btn-primary w-full"
              >
                <RotateCcw className="w-4 h-4" />
                Restore this version
              </button>
            </div>
          ) : null}

          {viewState === 'diff' && diffData ? (
            <div className="p-4">
              <DiffView
                oldStr={diffData.oldStr}
                newStr={diffData.newStr}
                oldLabel={diffData.oldLabel}
                newLabel={diffData.newLabel}
              />
            </div>
          ) : null}

          {restoreError ? (
            <div className="px-4 py-2 border-b border-border-strong">
              <p className="text-xs text-fg">{restoreError}</p>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmModal
        open={restoreTarget !== null}
        title="Restore config"
        description="This will overwrite the current config with the selected version. A backup of the current state will be saved first."
        confirmLabel={restoring ? 'Restoring' : 'Restore'}
        variant="default"
        onConfirm={handleRestore}
        onCancel={() => setRestoreTarget(null)}
      />
    </div>
  );
}
