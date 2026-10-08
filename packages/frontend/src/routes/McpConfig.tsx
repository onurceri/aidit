import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import {
  Plug,
  AlertTriangle,
  ChevronRight,
  FileJson,
  FolderGit2,
  Loader,
  Search,
  SearchX,
  Plus,
  PenLine,
  Trash2,
  ToggleLeft,
  ToggleRight,
  History,
  Copy,
} from 'lucide-react';
import { useScan } from '../hooks/useScan';
import { useWatcher, useConfigWatch } from '../hooks/useWatcher';
import { JsonEditor } from '../components/JsonEditor';
import { ConfirmModal } from '../components/ConfirmModal';
import { ConfigHistory } from '../components/ConfigHistory';
import { McpServerForm, formToServerInput, type FormData } from '../components/McpServerForm';
import { useToast } from '../context/ToastContext';
import type { AgentResult, ConfigResult, McpServer } from '../api/client';
import { changeServer, patchConfig, ApiError, type ServerOperation } from '../api/client';
import { getAgentIcon } from '../lib/icons';
import { getServerBadgeLabel, getServerPreviewText, isBuiltInServer } from '../lib/mcpPresentation';
import { relativeTime } from '../lib/time';
import { displayPath } from '../lib/paths';
import { Page, SplitView, EmptyState } from '../components/Layout';

type EditMode = 'list' | 'form' | 'json';

interface FieldError {
  field: string;
  message: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function commandPreview(server: McpServer): string {
  const cmd = server.command ?? server.url ?? '';
  return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
}

function sortAgents(agents: AgentResult[]): { found: AgentResult[]; notFound: AgentResult[] } {
  const sorted = [...agents].sort((a, b) => a.label.localeCompare(b.label));
  return {
    found: sorted.filter((a) => a.found),
    notFound: sorted.filter((a) => !a.found),
  };
}

function getPrimaryConfig(configs: ConfigResult[]): ConfigResult | null {
  return configs.find((c) => c.scope === 'global') ?? configs[0] ?? null;
}

function getAllServers(configs: ConfigResult[]): { server: McpServer; config: ConfigResult }[] {
  const result: { server: McpServer; config: ConfigResult }[] = [];
  for (const config of configs) {
    for (const server of config.mcpServers) {
      result.push({ server, config });
    }
  }
  return result;
}

function countServers(configs: ConfigResult[]): number {
  return configs.reduce((total, config) => total + config.mcpServers.length, 0);
}

type PickerTargetStatus = 'has-servers' | 'empty-config' | 'config-missing';

interface PickerTarget {
  id: string;
  label: string;
  serverCount: number;
  status: PickerTargetStatus;
  isProject?: boolean;
}

function getTargetStatus(found: boolean, serverCount: number, configCount = 1): PickerTargetStatus {
  if (!found || configCount === 0) return 'config-missing';
  if (serverCount > 0) return 'has-servers';
  return 'empty-config';
}

function TargetRow({ target }: { target: PickerTarget }) {
  const Icon = target.isProject ? FolderGit2 : getAgentIcon(target.id);
  return (
    <NavLink
      to={`/mcp/${target.id}`}
      className={({ isActive }) => `list-row ${isActive ? 'list-row-active' : ''}`}
    >
      {({ isActive }) => (
        <>
          <Icon
            className={`h-4 w-4 flex-shrink-0 ${isActive ? 'text-fg' : 'text-fg-2'}`}
            strokeWidth={1.75}
          />
          <span
            className={`flex-1 truncate text-sm ${isActive ? 'text-fg font-medium' : 'text-fg-2'}`}
          >
            {target.label}
          </span>
          {target.status !== 'config-missing' ? (
            <span className="text-[11px] tabular-nums text-fg-3">{target.serverCount}</span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function TargetList({ targets }: { targets: PickerTarget[] }) {
  const [query, setQuery] = useState('');
  const [showMissing, setShowMissing] = useState(false);

  const q = query.trim().toLowerCase();
  const visible = q ? targets.filter((t) => t.label.toLowerCase().includes(q)) : targets;
  const configured = visible.filter((t) => t.status === 'has-servers');
  const empty = visible.filter((t) => t.status === 'empty-config');
  const missing = visible.filter((t) => t.status === 'config-missing');
  const missingOpen = showMissing || (q.length > 0 && missing.length > 0);

  return (
    <>
      <div className="p-3 border-b border-border">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter agents…"
            className="input h-8 pl-8"
          />
        </label>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {configured.length > 0 ? (
          <>
            <div className="section-label">
              <span>With servers</span>
              <span>{configured.length}</span>
            </div>
            {configured.map((t) => (
              <TargetRow key={t.id} target={t} />
            ))}
          </>
        ) : null}
        {empty.length > 0 ? (
          <>
            <div className="section-label">
              <span>No servers yet</span>
              <span>{empty.length}</span>
            </div>
            {empty.map((t) => (
              <TargetRow key={t.id} target={t} />
            ))}
          </>
        ) : null}
        {missing.length > 0 ? (
          <>
            <button
              type="button"
              onClick={() => setShowMissing((v) => !v)}
              className="section-label w-full hover:text-fg-2 transition-colors"
              aria-expanded={missingOpen}
            >
              <span className="flex items-center gap-1">
                <ChevronRight
                  className={`w-3 h-3 transition-transform ${missingOpen ? 'rotate-90' : ''}`}
                />
                No MCP config
              </span>
              <span>{missing.length}</span>
            </button>
            {missingOpen ? missing.map((t) => <TargetRow key={t.id} target={t} />) : null}
          </>
        ) : null}
        {visible.length === 0 ? (
          <p className="px-2.5 py-6 text-xs text-fg-3">No agents match “{query}”.</p>
        ) : null}
      </div>
    </>
  );
}

function ServerRow({
  server,
  isSelected,
  onSelect,
  hasParseError,
  onEdit,
  onToggleEnabled,
  onDelete,
  toggling,
}: {
  server: McpServer;
  isSelected: boolean;
  onSelect: () => void;
  hasParseError: boolean;
  onEdit: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const isBuiltIn = isBuiltInServer(server);

  return (
    <div
      className={`group flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
        isSelected ? 'bg-surface-2' : 'hover:bg-hover'
      }`}
      onClick={onSelect}
      onDoubleClick={server.control.canEdit ? onEdit : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <span
        className={`status-dot ${
          hasParseError ? 'status-err' : server.enabled ? 'status-ok' : 'status-off'
        }`}
        title={server.enabled ? 'Enabled' : 'Disabled'}
      />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium truncate ${server.enabled ? 'text-fg' : 'text-fg-2'}`}
          >
            {server.name}
          </span>
          <span className={isBuiltIn ? 'badge-outline' : 'badge'}>
            {getServerBadgeLabel(server)}
          </span>
          {server.env && Object.keys(server.env).length > 0 ? (
            <span className="badge-outline">{Object.keys(server.env).length} env</span>
          ) : null}
        </div>
        <p
          className="mt-0.5 text-xs text-fg-2 font-mono truncate"
          title={getServerPreviewText(server)}
        >
          {commandPreview(server) || getServerPreviewText(server)}
          {server.args && server.args.length > 0 ? (
            <span className="text-fg-3"> {server.args.join(' ')}</span>
          ) : null}
        </p>
      </div>

      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
        {server.control.canEdit ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="btn-icon"
            title="Edit server"
            aria-label="Edit server"
          >
            <PenLine className="w-3.5 h-3.5" />
          </button>
        ) : null}
        {server.control.canDelete ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="btn-icon"
            title="Delete server"
            aria-label="Delete server"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        ) : null}
        {server.control.canToggle ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleEnabled();
            }}
            disabled={toggling}
            className="ml-1 px-1.5 py-1 rounded-md text-fg-2 hover:bg-hover hover:text-fg transition-colors"
            title={server.enabled ? 'Disable server' : 'Enable server'}
          >
            {toggling ? (
              <Loader className="w-4 h-4 animate-spin" />
            ) : server.enabled ? (
              <ToggleRight className="w-5 h-5 text-fg" strokeWidth={1.5} />
            ) : (
              <ToggleLeft className="w-5 h-5" strokeWidth={1.5} />
            )}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function McpConfig() {
  const { agentId } = useParams<{ agentId: string }>();
  const { scanResult, loading, error, refresh } = useScan();
  const { addToast } = useToast();

  const [selectedConfigPath, setSelectedConfigPath] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>('list');
  const [selectedServerName, setSelectedServerName] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [togglingServer, setTogglingServer] = useState<string | null>(null);
  const [apiErrors, setApiErrors] = useState<FieldError[] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [wsWarning, setWsWarning] = useState<string | null>(null);
  const [jsonEditorContent, setJsonEditorContent] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [serverQuery, setServerQuery] = useState('');
  const hasUnsavedRef = useRef(false);
  const { status: wsStatus } = useWatcher();

  const pickerTargets = useMemo(() => {
    if (!scanResult) return [] as PickerTarget[];
    const sorted = sortAgents(scanResult.agents);
    const allAgents = [...sorted.found, ...sorted.notFound];
    const baseTargets: PickerTarget[] = allAgents.map((agent) => {
      const serverCount = countServers(agent.configs);
      return {
        id: agent.id,
        label: agent.label,
        serverCount,
        status: getTargetStatus(agent.found, serverCount, agent.configs.length),
      };
    });
    const projectServerCount = countServers(scanResult.projectConfigs);
    return scanResult.projectConfigs.length > 0
      ? [
          ...baseTargets,
          {
            id: 'project',
            label: 'Project config',
            serverCount: projectServerCount,
            status: getTargetStatus(true, projectServerCount),
            isProject: true,
          },
        ]
      : baseTargets;
  }, [scanResult]);

  const { foundAgents, notFoundAgents, configuredAgents, projectConfigs } = useMemo(() => {
    if (!scanResult) {
      return {
        foundAgents: [] as AgentResult[],
        notFoundAgents: [] as AgentResult[],
        configuredAgents: [] as AgentResult[],
        projectConfigs: [] as ConfigResult[],
      };
    }
    const sorted = sortAgents(scanResult.agents);
    const allAgents = [...sorted.found, ...sorted.notFound];
    return {
      foundAgents: sorted.found,
      notFoundAgents: sorted.notFound,
      configuredAgents: allAgents.filter((agent) => countServers(agent.configs) > 0),
      projectConfigs: scanResult.projectConfigs,
    };
  }, [scanResult]);

  const hasProjectTab = projectConfigs.length > 0;
  const projectServerCount = useMemo(() => countServers(projectConfigs), [projectConfigs]);
  const defaultAgentId =
    configuredAgents[0]?.id ??
    (projectServerCount > 0 ? 'project' : undefined) ??
    foundAgents[0]?.id ??
    notFoundAgents[0]?.id ??
    (hasProjectTab ? 'project' : undefined);
  const effectiveAgentId = agentId ?? defaultAgentId;

  const isProjectSelected = effectiveAgentId === 'project';
  const selectedAgent = isProjectSelected
    ? null
    : scanResult?.agents.find((a) => a.id === effectiveAgentId);

  const displayConfigs: ConfigResult[] = isProjectSelected
    ? projectConfigs
    : (selectedAgent?.configs ?? []);

  // Edits always target one file, so the server list shows one file at a time.
  const primaryConfig =
    displayConfigs.find((c) => c.absolutePath === selectedConfigPath) ??
    getPrimaryConfig(displayConfigs);
  const displayServers = getAllServers(primaryConfig ? [primaryConfig] : []);

  const filteredDisplayServers = useMemo(() => {
    const normalized = serverQuery.trim().toLowerCase();
    if (!normalized) return displayServers;
    return displayServers.filter(({ server, config }) => {
      const haystack = [
        server.name,
        server.transport,
        server.command ?? '',
        server.url ?? '',
        config.absolutePath,
        config.scope,
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [displayServers, serverQuery]);

  const selectedServer: McpServer | null = useMemo(() => {
    if (!selectedServerName) return null;
    return displayServers.find((s) => s.server.name === selectedServerName)?.server ?? null;
  }, [selectedServerName, displayServers]);

  useEffect(() => {
    setSelectedConfigPath(null);
  }, [effectiveAgentId]);

  useEffect(() => {
    setEditMode('list');
    setSelectedServerName(null);
    setShowAddForm(false);
    setShowHistory(false);
    setApiErrors(null);
    setDeleteTarget(null);
    setWsWarning(null);
    setServerQuery('');
    hasUnsavedRef.current = false;
  }, [effectiveAgentId, primaryConfig?.absolutePath]);

  useConfigWatch(
    primaryConfig?.pathEntryId,
    useCallback(() => {
      if (hasUnsavedRef.current) {
        setWsWarning('Config was modified externally. Your unsaved changes will be lost.');
      } else {
        refresh();
        setWsWarning(null);
      }
    }, [refresh]),
  );

  const canAddStructuredServer = Boolean(primaryConfig?.canAddServers);

  const applyChange = useCallback(
    async (operation: ServerOperation) => {
      if (!primaryConfig) return;
      const result = await changeServer(primaryConfig.pathEntryId, operation);
      setJsonEditorContent(result.raw);
      hasUnsavedRef.current = false;
      await refresh();
      return result;
    },
    [primaryConfig, refresh],
  );

  const handleSaveForm = useCallback(
    async (formData: FormData) => {
      if (!primaryConfig) return;

      setSaving(true);
      setApiErrors(null);
      try {
        await applyChange({
          op: 'upsert',
          server: formToServerInput(formData),
          originalName: selectedServerName ?? undefined,
        });
        setEditMode('list');
        setSelectedServerName(null);
        setShowAddForm(false);
      } catch (err) {
        if (err instanceof ApiError && err.errors) {
          setApiErrors(err.errors);
        } else if (err instanceof Error) {
          setApiErrors([{ field: 'root', message: err.message }]);
        }
      } finally {
        setSaving(false);
      }
    },
    [primaryConfig, applyChange, selectedServerName],
  );

  const handleSaveJson = useCallback(
    async (content: string) => {
      if (!primaryConfig) return;
      const result = await patchConfig(primaryConfig.pathEntryId, content);
      hasUnsavedRef.current = false;
      setJsonEditorContent(result.raw);
      await refresh();
    },
    [primaryConfig, refresh],
  );

  const handleToggleEnabled = useCallback(
    async (serverName: string) => {
      const server = displayServers.find((s) => s.server.name === serverName);
      if (!server) return;

      setTogglingServer(serverName);
      try {
        await applyChange({ op: 'toggle', name: serverName, enabled: !server.server.enabled });
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to toggle server');
      } finally {
        setTogglingServer(null);
        setEditMode('list');
        setSelectedServerName(null);
      }
    },
    [displayServers, applyChange, addToast],
  );

  const handleDelete = useCallback(
    async (serverName: string) => {
      setDeleteTarget(null);
      try {
        await applyChange({ op: 'delete', name: serverName });
      } catch (err) {
        addToast('error', err instanceof Error ? err.message : 'Failed to delete server');
      }
    },
    [applyChange, addToast],
  );

  const handleStartEdit = useCallback((serverName: string) => {
    setSelectedServerName(serverName);
    setEditMode('form');
    setShowAddForm(false);
    setApiErrors(null);
    hasUnsavedRef.current = false;
  }, []);

  const handleStartAdd = useCallback(() => {
    if (!canAddStructuredServer) {
      addToast('error', 'aidit cannot add servers to this file. Use the raw editor instead.');
      return;
    }
    setShowAddForm(true);
    setSelectedServerName(null);
    setEditMode('list');
    setApiErrors(null);
    hasUnsavedRef.current = false;
  }, [addToast, canAddStructuredServer]);

  const handleBackToList = useCallback(() => {
    setEditMode('list');
    setSelectedServerName(null);
    setShowAddForm(false);
    setApiErrors(null);
    hasUnsavedRef.current = false;
  }, []);

  const handleCopyPath = useCallback(async () => {
    if (!primaryConfig) return;
    try {
      await navigator.clipboard.writeText(primaryConfig.absolutePath);
      addToast('success', 'Path copied to clipboard');
    } catch (err) {
      addToast('error', err instanceof Error ? err.message : 'Failed to copy path to clipboard');
    }
  }, [addToast, primaryConfig]);

  const pageDescription = 'Configure, inspect and sync Model Context Protocol servers';

  if (loading && !scanResult) {
    return (
      <Page title="MCP servers" description={pageDescription} bare>
        <div className="flex-1 flex items-center justify-center">
          <Loader className="w-5 h-5 text-fg-2 animate-spin" />
        </div>
      </Page>
    );
  }

  if (error || !scanResult) {
    return (
      <Page title="MCP servers" description={pageDescription}>
        <div className="card">
          <EmptyState icon={AlertTriangle} title="Couldn't load agents">
            {error ?? 'No scan result available.'}
          </EmptyState>
        </div>
      </Page>
    );
  }

  const agentNotFound = !!selectedAgent && !selectedAgent.found;
  const unknownTarget = !!effectiveAgentId && !isProjectSelected && !selectedAgent;
  const currentTargetLabel =
    selectedAgent?.label ?? (isProjectSelected ? 'Project config' : 'No target');
  const TargetIcon = isProjectSelected
    ? FolderGit2
    : selectedAgent
      ? getAgentIcon(selectedAgent.id)
      : Plug;
  const editorLabel = primaryConfig ? `Raw ${primaryConfig.format.toUpperCase()}` : 'Raw';
  const isEditing = editMode === 'form' || showAddForm;

  return (
    <Page title="MCP servers" description={pageDescription} bare>
      <SplitView aside={<TargetList targets={pickerTargets} />}>
        {unknownTarget ? (
          <EmptyState icon={SearchX} title="Agent not found">
            This route does not match any known agent.
          </EmptyState>
        ) : agentNotFound ? (
          <EmptyState icon={SearchX} title={`${selectedAgent?.label} isn't installed`}>
            aidit found no config file at this agent&apos;s known paths. Add a custom path in
            Settings → Paths if it lives somewhere else.
          </EmptyState>
        ) : !primaryConfig ? (
          <EmptyState icon={Plug} title="No config file">
            {currentTargetLabel} has skills but no MCP config file on disk.
          </EmptyState>
        ) : (
          <div className="flex flex-col min-h-full">
            {/* Target header */}
            <div className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur-sm">
              <div className="px-6 pt-5 pb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-md border border-border bg-surface-2 flex items-center justify-center flex-shrink-0">
                    <TargetIcon className="w-4 h-4 text-fg" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold text-fg truncate">
                      {currentTargetLabel}
                    </h2>
                    <button
                      onClick={handleCopyPath}
                      className="group mt-0.5 flex items-center gap-1.5 max-w-full text-xs text-fg-2 hover:text-fg font-mono"
                      title="Copy path"
                    >
                      <span className="truncate">{displayPath(primaryConfig.absolutePath)}</span>
                      <Copy className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100" />
                    </button>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-fg-3">
                      <span className="badge">{primaryConfig.format.toUpperCase()}</span>
                      <span className="badge">{primaryConfig.scope}</span>
                      <span>{formatBytes(primaryConfig.sizeBytes)}</span>
                      <span>·</span>
                      <span>updated {relativeTime(primaryConfig.lastModified)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                  <button
                    onClick={handleStartAdd}
                    disabled={!canAddStructuredServer}
                    className="btn-primary"
                    title={
                      canAddStructuredServer
                        ? 'Add server'
                        : 'aidit cannot add servers to this file; use the raw editor'
                    }
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add server
                  </button>
                  <button
                    onClick={() => {
                      setEditMode(editMode === 'json' ? 'list' : 'json');
                      setShowAddForm(false);
                      setApiErrors(null);
                    }}
                    className={editMode === 'json' ? 'btn-secondary bg-surface-3' : 'btn-secondary'}
                  >
                    <FileJson className="w-3.5 h-3.5" />
                    {editMode === 'json' ? 'Close editor' : editorLabel}
                  </button>
                  <button
                    onClick={() => setShowHistory(true)}
                    className="btn-icon"
                    title="Change history"
                    aria-label="Change history"
                  >
                    <History className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {displayConfigs.length > 1 ? (
                <div className="px-6 flex items-center gap-1 overflow-x-auto">
                  {displayConfigs.map((config) => {
                    const active = config.absolutePath === primaryConfig.absolutePath;
                    return (
                      <button
                        key={config.absolutePath}
                        onClick={() => setSelectedConfigPath(config.absolutePath)}
                        className={`tab whitespace-nowrap ${active ? 'tab-active' : ''}`}
                        title={config.absolutePath}
                      >
                        {config.scope === 'project' ? 'Project' : 'Global'} ·{' '}
                        {config.scope === 'project' &&
                        config.absolutePath.startsWith(`${scanResult.workingDirectory}/`)
                          ? config.absolutePath.slice(scanResult.workingDirectory.length + 1)
                          : displayPath(config.absolutePath)}
                        <span className="ml-1.5 text-fg-3 text-[11px]">
                          {config.mcpServers.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className="flex-1 px-6 py-5 space-y-4">
              {primaryConfig.parseError ? (
                <div className="card p-3 flex items-start gap-2 border-border-strong">
                  <span className="status-dot status-err mt-1.5" />
                  <p className="text-sm text-fg">
                    This file doesn&apos;t parse: {primaryConfig.parseError}
                  </p>
                </div>
              ) : null}

              {wsWarning ? (
                <div className="card p-3 flex items-center justify-between gap-3 border-border-strong">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0" />
                    <p className="text-sm text-fg truncate">{wsWarning}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        refresh();
                        setWsWarning(null);
                      }}
                      className="btn-primary btn-sm"
                    >
                      Reload
                    </button>
                    <button onClick={() => setWsWarning(null)} className="btn-ghost btn-sm">
                      Keep editing
                    </button>
                  </div>
                </div>
              ) : null}

              {wsStatus === 'disconnected' && (isEditing || editMode === 'json') ? (
                <div className="card p-3 flex items-center gap-2 border-border-strong">
                  <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0" />
                  <p className="text-sm text-fg">
                    Live connection lost. Changes on disk won&apos;t show up until it reconnects.
                  </p>
                </div>
              ) : null}

              {editMode === 'json' ? (
                <div className="card p-4">
                  <JsonEditor
                    content={jsonEditorContent ?? primaryConfig.raw}
                    language={
                      primaryConfig.format === 'yaml'
                        ? 'yaml'
                        : primaryConfig.format === 'toml'
                          ? 'ini'
                          : 'json'
                    }
                    readOnly={false}
                    onSave={handleSaveJson}
                  />
                </div>
              ) : isEditing ? (
                <div className="max-w-2xl">
                  <button onClick={handleBackToList} className="btn-ghost btn-sm -ml-2 mb-3">
                    <ChevronRight className="w-3.5 h-3.5 rotate-180" />
                    All servers
                  </button>
                  {editMode === 'form' && selectedServer && selectedServer.control.canEdit ? (
                    <McpServerForm
                      server={selectedServer}
                      canToggle={selectedServer.control.canToggle}
                      saving={saving}
                      apiErrors={apiErrors}
                      onSave={handleSaveForm}
                      onCancel={handleBackToList}
                    />
                  ) : null}
                  {showAddForm && canAddStructuredServer ? (
                    <McpServerForm
                      server={null}
                      canToggle={primaryConfig.canToggleServers}
                      saving={saving}
                      apiErrors={apiErrors}
                      onSave={handleSaveForm}
                      onCancel={handleBackToList}
                    />
                  ) : null}
                </div>
              ) : displayServers.length === 0 ? (
                <div className="card">
                  <EmptyState
                    icon={Plug}
                    title="No MCP servers yet"
                    action={
                      canAddStructuredServer ? (
                        <button onClick={handleStartAdd} className="btn-primary">
                          <Plus className="w-3.5 h-3.5" />
                          Add the first server
                        </button>
                      ) : null
                    }
                  >
                    This file exists but doesn&apos;t define any servers.
                  </EmptyState>
                </div>
              ) : (
                <div className="card overflow-hidden">
                  <div className="flex items-center justify-between gap-3 px-4 h-11 border-b border-border bg-surface-2">
                    <span className="text-xs text-fg-2">
                      <span className="text-fg font-medium tabular-nums">
                        {filteredDisplayServers.length}
                      </span>{' '}
                      of {displayServers.length} servers ·{' '}
                      {displayServers.filter((s) => s.server.enabled).length} enabled
                    </span>
                    {displayServers.length > 5 ? (
                      <label className="relative block w-56">
                        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
                        <input
                          type="search"
                          value={serverQuery}
                          onChange={(e) => setServerQuery(e.target.value)}
                          placeholder="Filter servers…"
                          className="input h-7 pl-7 text-xs"
                        />
                      </label>
                    ) : null}
                  </div>
                  {filteredDisplayServers.length === 0 ? (
                    <p className="px-4 py-8 text-center text-sm text-fg-2">
                      No servers match “{serverQuery}”.
                    </p>
                  ) : (
                    <div className="divide-y divide-border">
                      {filteredDisplayServers.map(({ server, config }) => (
                        <ServerRow
                          key={`${config.absolutePath}:${server.name}`}
                          server={server}
                          isSelected={selectedServerName === server.name}
                          onSelect={() => setSelectedServerName(server.name)}
                          hasParseError={!!config.parseError}
                          onEdit={() => handleStartEdit(server.name)}
                          onToggleEnabled={() => handleToggleEnabled(server.name)}
                          onDelete={() => setDeleteTarget(server.name)}
                          toggling={togglingServer === server.name}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </SplitView>

      {deleteTarget ? (
        <ConfirmModal
          open={!!deleteTarget}
          title={`Delete ${deleteTarget}?`}
          description={`This removes "${deleteTarget}" from ${primaryConfig?.absolutePath ?? 'the config'}. A backup is kept.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => handleDelete(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      {showHistory && primaryConfig ? (
        <ConfigHistory
          pathEntryId={primaryConfig.pathEntryId}
          configLabel={selectedAgent?.label ?? 'Project config'}
          onClose={() => setShowHistory(false)}
          onRestoreComplete={refresh}
        />
      ) : null}
    </Page>
  );
}
