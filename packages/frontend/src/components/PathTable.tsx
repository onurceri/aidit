import { useState } from 'react';
import { Lock, Trash2, RotateCcw, Copy } from 'lucide-react';
import type { PathEntry } from '../api/client';
import { useToast } from '../context/ToastContext';

export interface PathStatus {
  found: boolean;
  resolved: string;
  matches: string[];
}

interface PathTableProps {
  entries: PathEntry[];
  pathStatuses: Map<string, PathStatus>;
  onUpdate: (entries: PathEntry[]) => void;
  onDelete: (id: string) => void;
  onResetEntry: (id: string) => void;
  saving: boolean;
}

type EditingField =
  | { entryId: string; field: 'label' | 'path' | 'agent' }
  | { entryId: string; field: 'type' };

const TYPE_OPTIONS: PathEntry['type'][] = ['mcp-config', 'skills-dir', 'unknown'];

function StatusDot({ entry, status }: { entry: PathEntry; status?: PathStatus }) {
  if (!entry.enabled) {
    return (
      <span title="Disabled" className="inline-flex items-center">
        <span className="w-2.5 h-2.5 rounded-full border border-fg-3" />
      </span>
    );
  }

  if (!status) {
    return (
      <span title="Checking…" className="inline-flex items-center">
        <span className="w-2.5 h-2.5 rounded-full border border-fg-3 animate-pulse" />
      </span>
    );
  }

  if (status.found) {
    return (
      <span
        title={
          status.resolved + (status.matches.length > 1 ? ` (${status.matches.length} matches)` : '')
        }
        className="inline-flex items-center cursor-help"
      >
        <span className="w-2.5 h-2.5 rounded-full bg-fg" />
      </span>
    );
  }

  return (
    <span title="Not found" className="inline-flex items-center cursor-help">
      <span className="w-2.5 h-2.5 rounded-full border border-fg-3" />
    </span>
  );
}

export function PathTable({
  entries,
  pathStatuses,
  onUpdate,
  onDelete,
  onResetEntry,
  saving,
}: PathTableProps) {
  const [editing, setEditing] = useState<EditingField | null>(null);
  const [editValue, setEditValue] = useState('');
  const { addToast } = useToast();

  function startEdit(entryId: string, field: EditingField['field'], currentValue: string) {
    setEditing({ entryId, field } as EditingField);
    setEditValue(currentValue);
  }

  function commitEdit() {
    if (!editing) return;

    const idx = entries.findIndex((e) => e.id === editing.entryId);
    if (idx === -1) {
      cancelEdit();
      return;
    }

    const updated = [...entries];
    const entry = { ...updated[idx] };

    if (editing.field === 'type') {
      entry.type = editValue as PathEntry['type'];
    } else if (editing.field === 'label') {
      entry.label = editValue;
    } else if (editing.field === 'path') {
      entry.path = editValue;
    } else if (editing.field === 'agent') {
      entry.agent = editValue || null;
    }

    updated[idx] = entry;
    onUpdate(updated);
    cancelEdit();
  }

  function cancelEdit() {
    setEditing(null);
    setEditValue('');
  }

  function handleToggle(entry: PathEntry) {
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx === -1) return;

    const updated = [...entries];
    updated[idx] = { ...entry, enabled: !entry.enabled };
    onUpdate(updated);
  }

  function renderTextCell(
    entry: PathEntry,
    field: 'label' | 'path' | 'agent',
    value: string,
    mono?: boolean,
  ) {
    const isEditing = editing?.entryId === entry.id && editing.field === field;

    if (isEditing) {
      return (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitEdit();
            if (e.key === 'Escape') cancelEdit();
          }}
          className={`input text-xs py-1 ${mono ? 'font-mono' : ''}`}
        />
      );
    }

    return (
      <button
        onClick={() => startEdit(entry.id, field, value)}
        className={`block w-full text-left px-2 py-1 -mx-2 rounded text-sm hover:bg-hover transition-colors truncate ${
          mono ? 'font-mono text-xs' : ''
        } text-fg-2`}
      >
        {field === 'agent' && !value ? <span className="text-fg-3">—</span> : value}
      </button>
    );
  }

  function renderTypeCell(entry: PathEntry) {
    const isEditing = editing?.entryId === entry.id && editing.field === 'type';

    if (isEditing) {
      return (
        <select
          autoFocus
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            const idx = entries.findIndex((en) => en.id === entry.id);
            if (idx !== -1) {
              const updated = [...entries];
              updated[idx] = { ...entry, type: e.target.value as PathEntry['type'] };
              onUpdate(updated);
              cancelEdit();
            }
          }}
          onBlur={cancelEdit}
          className="select text-xs py-1"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      );
    }

    return (
      <button
        onClick={() => startEdit(entry.id, 'type', entry.type)}
        className="block w-full text-left px-2 py-1 -mx-2 rounded text-sm text-fg-2 hover:bg-hover transition-colors"
      >
        {entry.type}
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-fg-2">
          <tr>
            <th className="text-left font-medium px-3 py-2 text-xs w-12">Status</th>
            <th className="text-left font-medium px-3 py-2 text-xs">Label</th>
            <th className="text-left font-medium px-3 py-2 text-xs">Path</th>
            <th className="text-left font-medium px-3 py-2 text-xs w-32">Type</th>
            <th className="text-left font-medium px-3 py-2 text-xs w-32">Agent</th>
            <th className="text-left font-medium px-3 py-2 text-xs w-20">Scope</th>
            <th className="text-left font-medium px-3 py-2 text-xs w-20">Source</th>
            <th className="text-center font-medium px-3 py-2 text-xs w-20">On</th>
            <th className="text-right font-medium px-3 py-2 text-xs w-32">Actions</th>
          </tr>
        </thead>
        <tbody className={saving ? 'opacity-60' : ''}>
          {entries.map((entry) => {
            const status = pathStatuses.get(entry.id);

            return (
              <tr
                key={entry.id}
                className={`border-t border-border ${saving ? 'pointer-events-none' : ''}`}
              >
                <td className="px-3 py-2">
                  <StatusDot entry={entry} status={status} />
                </td>
                <td className="px-3 py-2 max-w-48">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {entry.source === 'builtin' ? (
                      <Lock className="w-3 h-3 text-fg-3 flex-shrink-0" />
                    ) : null}
                    <div className="min-w-0 flex-1">
                      {renderTextCell(entry, 'label', entry.label)}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 max-w-64">
                  {renderTextCell(entry, 'path', entry.path, true)}
                </td>
                <td className="px-3 py-2">{renderTypeCell(entry)}</td>
                <td className="px-3 py-2">{renderTextCell(entry, 'agent', entry.agent ?? '')}</td>
                <td className="px-3 py-2">
                  <span className="badge">{entry.scope}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="badge">{entry.source}</span>
                </td>
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => handleToggle(entry)}
                    role="switch"
                    aria-checked={entry.enabled}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      entry.enabled ? 'bg-fg' : 'bg-fg-3'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                        entry.enabled ? 'translate-x-4' : 'translate-x-0.5'
                      }`}
                    />
                  </button>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {status?.found && status.resolved ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard
                            .writeText(status.resolved)
                            .then(() => addToast('success', 'Path copied to clipboard'))
                            .catch((err) =>
                              addToast(
                                'error',
                                err instanceof Error
                                  ? err.message
                                  : 'Failed to copy path to clipboard',
                              ),
                            );
                        }}
                        className="btn-icon"
                        title="Copy path"
                        aria-label="Copy path"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                    {entry.source === 'builtin' ? (
                      <button
                        onClick={() => onResetEntry(entry.id)}
                        className="btn-icon"
                        title="Reset to default"
                        aria-label="Reset to default"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    ) : (
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="btn-icon"
                        title="Delete entry"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
          {entries.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-3 py-16 text-center text-fg-2 text-sm">
                No path entries found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
