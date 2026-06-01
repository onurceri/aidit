import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { useParams, NavLink } from 'react-router-dom';
import {
  Plug,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  FileJson,
  FolderGit2,
  PackageOpen,
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
import { McpServerForm, formToMcpServerConfig, type FormData } from '../components/McpServerForm';
import { useToast } from '../context/ToastContext';
import type { AgentResult, ConfigResult, McpServer } from '../api/client';
import { patchConfig } from '../api/client';
import { getAgentIcon } from '../lib/icons';
import {
  applyServerEnabledChange,
  removeServerFromConfig,
  supportsStandardServerEditing,
} from '../lib/mcpConfig';
import { relativeTime } from '../lib/time';

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function commandPreview(server: McpServer): string {
  const cmd = server.command ?? server.url ?? '';
  return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd;
}

function getServerBadgeLabel(server: McpServer): string {
  if (server.control.collectionPath === 'mcp' && !server.command && !server.url) {
    return 'built-in';
  }
  switch (server.transport) {
    case 'stdio':
      return 'stdio';
    case 'sse':
      return 'sse';
    case 'http':
      return 'http';
    default:
      return 'managed';
  }
}

function getServerPreviewText(server: McpServer): string {
  const cmd = server.command ?? server.url ?? '';
  if (cmd) return cmd;
  if (server.control.collectionPath === 'mcp' && server.control.enableMode === 'entry-enabled') {
    return 'Controlled by this app config';
  }
  if (server.control.canToggle) return 'Controlled by config';
  return 'Managed by config';
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

function serializeConfig(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function countServers(configs: ConfigResult[]): number {
  return configs.reduce((total, config) => total + config.mcpServers.length, 0);
}

type PickerTargetStatus = 'has-servers' | 'empty-config' | 'config-missing';
type PickerFilter = 'all' | PickerTargetStatus;

interface PickerTarget {
  id: string;
  label: string;
  serverCount: number;
  status: PickerTargetStatus;
  isProject?: boolean;
}

function getTargetStatus(found: boolean, serverCount: number): PickerTargetStatus {
  if (!found) return 'config-missing';
  if (serverCount > 0) return 'has-servers';
  return 'empty-config';
}

const FILTER_OPTIONS: { value: PickerFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'has-servers', label: 'Has servers' },
  { value: 'empty-config', label: 'Empty' },
  { value: 'config-missing', label: 'Missing' },
];

function ToolPicker({ targets }: { targets: PickerTarget[] }) {
  const [activeFilter, setActiveFilter] = useState<PickerFilter>('all');

  const counts = useMemo(
    () => ({
      all: targets.length,
      'has-servers': targets.filter((target) => target.status === 'has-servers').length,
      'empty-config': targets.filter((target) => target.status === 'empty-config').length,
      'config-missing': targets.filter((target) => target.status === 'config-missing').length,
    }),
    [targets],
  );

  const visibleTargets = useMemo(
    () =>
      activeFilter === 'all'
        ? targets
        : targets.filter((target) => target.status === activeFilter),
    [activeFilter, targets],
  );

  return (
    <div className="card p-4 flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="text-sm font-semibold text-fg">Targets</h2>
        <span className="text-xs text-fg-2">
          {counts['has-servers']} / {counts.all}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1 p-0.5 rounded-md border border-border bg-surface-2">
        {FILTER_OPTIONS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setActiveFilter(filter.value)}
            className={`h-7 px-2.5 rounded text-xs font-medium transition-colors ${
              activeFilter === filter.value
                ? 'bg-surface text-fg'
                : 'text-fg-2 hover:text-fg'
            }`}
          >
            {filter.label}
            <span className="ml-1.5 text-fg-3 text-[11px]">{counts[filter.value]}</span>
          </button>
        ))}
      </div>

      {visibleTargets.length === 0 ? (
        <p className="mt-6 text-sm text-fg-2">No targets match this filter.</p>
      ) : (
        <div className="mt-3 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
          {visibleTargets.map((target) => {
            const Icon = target.isProject ? FolderGit2 : getAgentIcon(target.id);
            return (
              <NavLink
                key={target.id}
                to={`/mcp/${target.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 p-2.5 rounded-md transition-colors ${
                    isActive ? 'bg-surface-3' : 'hover:bg-hover'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-4 w-4 flex-shrink-0 ${
                        isActive ? 'text-fg' : 'text-fg-2'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{target.label}</p>
                      <p className="text-xs text-fg-2">
                        {target.serverCount} {target.serverCount === 1 ? 'server' : 'servers'}
                      </p>
                    </div>
                    <span
                      className={`text-xs tabular-nums ${
                        isActive ? 'text-fg' : 'text-fg-3'
                      }`}
                    >
                      {String(target.serverCount).padStart(2, '0')}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ConfigHeader({
  config,
  headerOpen,
  onToggleHeader,
}: {
  config: ConfigResult;
  headerOpen: boolean;
  onToggleHeader: () => void;
}) {
  return (
    <div className="card overflow-hidden">
      <button
        onClick={onToggleHeader}
        className="w-full flex items-center justify-between p-3 hover:bg-hover transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <FileJson className="w-4 h-4 text-fg-2" />
          <span className="text-sm font-medium text-fg">File details</span>
        </div>
        {headerOpen ? (
          <ChevronDown className="w-4 h-4 text-fg-2" />
        ) : (
          <ChevronRight className="w-4 h-4 text-fg-2" />
        )}
      </button>
      {headerOpen ? (
        <div className="border-t border-border p-4 space-y-3 bg-surface-2">
          <div>
            <div className="text-xs text-fg-2 mb-1">Path</div>
            <div className="text-xs font-mono text-fg break-all">{config.absolutePath}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 text-xs">
            <div>
              <div className="text-fg-2">Format</div>
              <div className="mt-0.5 text-fg font-mono">{config.format.toUpperCase()}</div>
            </div>
            <div>
              <div className="text-fg-2">Indexed</div>
              <div className="mt-0.5 text-fg">
                {config.firstSeenAt ? formatDate(config.firstSeenAt) : 'Pending'}
              </div>
            </div>
            <div>
              <div className="text-fg-2">Path entry</div>
              <div className="mt-0.5 text-fg font-mono">#{config.pathEntryId}</div>
            </div>
          </div>
          {config.parseError ? (
            <div className="p-3 rounded-md border border-border-strong bg-surface">
              <p className="text-sm text-fg">Parse error: {config.parseError}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ServerRow({
  server,
  config,
  isSelected,
  onSelect,
  hasParseError,
  onEdit,
  onToggleEnabled,
  onDelete,
  toggling,
}: {
  server: McpServer;
  config: ConfigResult;
  isSelected: boolean;
  onSelect: () => void;
  hasParseError: boolean;
  onEdit: () => void;
  onToggleEnabled: () => void;
  onDelete: () => void;
  toggling: boolean;
}) {
  const StatusIcon = hasParseError ? AlertTriangle : Plug;
  const isBuiltIn =
    server.control.collectionPath === 'mcp' && !server.command && !server.url;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-md border cursor-pointer transition-colors ${
        isSelected
          ? 'border-fg bg-surface-2'
          : 'border-border bg-surface hover:border-border-strong'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-md border flex items-center justify-center ${
          hasParseError
            ? 'border-border-strong bg-surface-2 text-fg'
            : isBuiltIn
              ? 'border-fg bg-fg text-accent-fg'
              : 'border-border bg-surface-2 text-fg'
        }`}
      >
        <StatusIcon className="w-4 h-4" strokeWidth={1.5} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-fg truncate">{server.name}</span>
          <span className={isBuiltIn ? 'badge-strong' : 'badge'}>
            {getServerBadgeLabel(server)}
          </span>
        </div>
        <p
          className="mt-0.5 text-xs text-fg-2 truncate"
          title={getServerPreviewText(server)}
        >
          {commandPreview(server)}
        </p>
        <p className="mt-0.5 text-[11px] text-fg-3">
          {config.scope} config
        </p>
      </div>

      <div className="flex items-center gap-1">
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
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleEnabled();
          }}
          disabled={toggling || !server.control.canToggle}
          className="ml-1 px-1.5 py-1 rounded-md text-fg-2 hover:bg-hover hover:text-fg transition-colors disabled:opacity-30"
          title={
            server.control.canToggle
              ? server.enabled
                ? 'Disable server'
                : 'Enable server'
              : 'Toggle unavailable for this config format'
          }
        >
          {toggling ? (
            <Loader className="w-4 h-4 animate-spin" />
          ) : server.enabled ? (
            <ToggleRight className="w-5 h-5 text-fg" strokeWidth={1.5} />
          ) : (
            <ToggleLeft className="w-5 h-5" strokeWidth={1.5} />
          )}
        </button>
      </div>
    </div>
  );
}

export function McpConfig() {
  const { agentId } = useParams<{ agentId: string }>();
  const { scanResult, loading, error, refresh } = useScan();
  const { addToast } = useToast();

  const [headerOpen, setHeaderOpen] = useState(true);
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
        status: getTargetStatus(agent.found, serverCount),
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

  const primaryConfig = getPrimaryConfig(displayConfigs);
  const displayServers = getAllServers(displayConfigs);

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

  const selectedServerEntry = useMemo(() => {
    if (!selectedServerName) return null;
    return displayServers.find((entry) => entry.server.name === selectedServerName) ?? null;
  }, [selectedServerName, displayServers]);

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
  }, [effectiveAgentId]);

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

  const parsedConfig = useMemo((): Record<string, unknown> | null => {
    if (!primaryConfig) return null;
    if (primaryConfig.parsed && typeof primaryConfig.parsed === 'object') {
      return JSON.parse(JSON.stringify(primaryConfig.parsed));
    }
    return null;
  }, [primaryConfig]);

  const canAddStructuredServer = useMemo(() => {
    if (!parsedConfig) return false;
    return supportsStandardServerEditing(parsedConfig);
  }, [parsedConfig]);

  const updateConfigOnDisk = useCallback(
    async (obj: Record<string, unknown>) => {
      if (!primaryConfig) return;
      const content = serializeConfig(obj);
      const format = primaryConfig.format === 'yaml' ? 'json' : primaryConfig.format;
      const result = await patchConfig(
        primaryConfig.pathEntryId,
        content,
        format as 'json' | 'jsonc' | 'yaml',
      );
      setJsonEditorContent(result.raw);
      hasUnsavedRef.current = false;
      await refresh();
      return result;
    },
    [primaryConfig, refresh],
  );

  const handleSaveForm = useCallback(
    async (formData: FormData) => {
      if (!primaryConfig || !parsedConfig) return;

      const mcpServers = (parsedConfig.mcpServers as Record<string, unknown> | undefined) ?? {};
      const newMCP = { ...mcpServers };
      const serverConfig = formToMcpServerConfig(formData);

      if (!formData.enabled) {
        (serverConfig as Record<string, boolean>).disabled = true;
      } else {
        delete (serverConfig as Record<string, boolean | undefined>).disabled;
      }

      newMCP[formData.name] = serverConfig;

      const newConfig = { ...parsedConfig, mcpServers: newMCP };

      setSaving(true);
      setApiErrors(null);
      try {
        await updateConfigOnDisk(newConfig);
        setEditMode('list');
        setSelectedServerName(null);
        setShowAddForm(false);
      } catch (err) {
        if (err instanceof Error) {
          setApiErrors([{ field: 'root', message: err.message }]);
        }
      } finally {
        setSaving(false);
      }
    },
    [primaryConfig, parsedConfig, updateConfigOnDisk],
  );

  const handleSaveJson = useCallback(
    async (content: string) => {
      if (!primaryConfig) return;
      const format = primaryConfig.format === 'yaml' ? 'json' : primaryConfig.format;
      const result = await patchConfig(
        primaryConfig.pathEntryId,
        content,
        format as 'json' | 'jsonc' | 'yaml',
      );
      hasUnsavedRef.current = false;
      setJsonEditorContent(result.raw);
      await refresh();
    },
    [primaryConfig, refresh],
  );

  const handleToggleEnabled = useCallback(
    async (serverName: string) => {
      if (!primaryConfig || !parsedConfig) return;

      const server = displayServers.find((s) => s.server.name === serverName);
      if (!server) return;

      const newEnabled = !server.server.enabled;

      setTogglingServer(serverName);
      try {
        const newConfig = applyServerEnabledChange(parsedConfig, server.server, newEnabled);
        await updateConfigOnDisk(newConfig);
      } catch {
        /* error handled silently - optimistic update reverted on refresh */
      } finally {
        setTogglingServer(null);
        setEditMode('list');
        setSelectedServerName(null);
      }
    },
    [primaryConfig, parsedConfig, displayServers, updateConfigOnDisk],
  );

  const handleDelete = useCallback(
    async (serverName: string) => {
      if (!primaryConfig || !parsedConfig) return;

      setDeleteTarget(null);
      try {
        const server = displayServers.find((entry) => entry.server.name === serverName)?.server;
        if (!server) return;
        const newConfig = removeServerFromConfig(parsedConfig, server);
        await updateConfigOnDisk(newConfig);
      } catch {
        /* silently handled */
      }
    },
    [primaryConfig, parsedConfig, displayServers, updateConfigOnDisk],
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
      addToast('error', 'This config uses a non-standard MCP layout. Use raw JSON to add entries.');
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
      addToast(
        'error',
        err instanceof Error ? err.message : 'Failed to copy path to clipboard',
      );
    }
  }, [addToast, primaryConfig]);

  if (loading && !scanResult) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader className="w-6 h-6 text-fg-2 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="card p-4">
          <p className="text-sm text-fg">{error}</p>
        </div>
      </div>
    );
  }

  if (!scanResult || (scanResult.agents.length === 0 && !hasProjectTab)) {
    return (
      <div className="w-full flex flex-col gap-6">
        <header className="border-b border-border pb-4">
          <h1 className="heading-page">MCP</h1>
          <p className="mt-1 text-sm text-fg-2">
            Configure, inspect, and sync Model Context Protocol servers.
          </p>
        </header>
        <div className="card flex flex-col items-center justify-center py-24">
          <PackageOpen className="w-10 h-10 mb-4 text-fg-3" strokeWidth={1} />
          <h3 className="text-sm font-semibold text-fg">No agents found</h3>
          <p className="mt-1 text-sm text-fg-2">No configurations available to display.</p>
        </div>
      </div>
    );
  }

  if (effectiveAgentId && !isProjectSelected && !selectedAgent) {
    return (
      <div className="w-full flex flex-col gap-6">
        <header className="border-b border-border pb-4">
          <h1 className="heading-page">MCP</h1>
          <p className="mt-1 text-sm text-fg-2">
            Configure, inspect, and sync Model Context Protocol servers.
          </p>
        </header>

        <ToolPicker targets={pickerTargets} />

        <div className="card flex flex-col items-center justify-center py-24">
          <SearchX className="w-10 h-10 mb-4 text-fg-3" strokeWidth={1} />
          <h3 className="text-sm font-semibold text-fg">Agent not found</h3>
          <p className="mt-1 text-sm text-fg-2">
            This route does not match any available config target.
          </p>
        </div>
      </div>
    );
  }

  const agentNotFound = !!selectedAgent && !selectedAgent.found;
  const currentTargetLabel = selectedAgent?.label ?? (isProjectSelected ? 'Project config' : 'No target');
  const configSummaryLabel =
    displayConfigs.length === 1 ? '1 config file' : `${displayConfigs.length} config files`;
  const selectedServerSummary = showAddForm
    ? 'Creating a new server entry'
    : selectedServerName
      ? `Focused on ${selectedServerName}`
      : `${displayServers.length} total server${displayServers.length === 1 ? '' : 's'}`;

  return (
    <div className="w-full flex flex-col gap-6">
      <header className="border-b border-border pb-4">
        <h1 className="heading-page">MCP</h1>
        <p className="mt-1 text-sm text-fg-2">
          Configure, inspect, and sync Model Context Protocol servers.
        </p>
      </header>

      <div className="flex flex-col xl:flex-row gap-6 min-h-0">
        <aside className="xl:sticky xl:top-6 xl:w-[320px] xl:min-w-[320px] xl:max-w-[320px] xl:self-start">
          <ToolPicker targets={pickerTargets} />
        </aside>

        <div className="min-w-0 flex-1 flex flex-col gap-4">
          <div className="card p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  {editMode === 'form' ? (
                    <span className="badge">Editing</span>
                  ) : editMode === 'json' ? (
                    <span className="badge">Raw JSON</span>
                  ) : showAddForm ? (
                    <span className="badge">Adding</span>
                  ) : (
                    <span className="badge">Inventory</span>
                  )}
                  <span className="badge-outline">{configSummaryLabel}</span>
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-fg">{currentTargetLabel}</h2>
                  <p className="mt-1 text-sm text-fg-2">
                    Browse the selected target's configured servers, or open edit and advanced
                    actions when needed.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
                <div>
                  <div className="text-xs text-fg-2">Servers</div>
                  <div className="mt-0.5 text-base font-semibold text-fg tabular-nums">
                    {displayServers.length}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-fg-2">Status</div>
                  <div className="mt-0.5 text-base font-semibold text-fg">
                    {agentNotFound
                      ? 'Missing'
                      : primaryConfig?.parseError
                        ? 'Needs attention'
                        : 'Ready'}
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="text-xs text-fg-2">Focus</div>
                  <div className="mt-0.5 text-sm font-medium text-fg truncate" title={selectedServerSummary}>
                    {selectedServerSummary}
                  </div>
                </div>
              </div>
            </div>

            {!agentNotFound && primaryConfig ? (
              <div className="mt-5 pt-4 border-t border-border">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0">
                    <div className="text-xs text-fg-2">Config</div>
                    <div
                      className="mt-0.5 text-sm font-medium text-fg truncate"
                      title={primaryConfig.absolutePath}
                    >
                      {primaryConfig.absolutePath}
                    </div>
                    <div className="mt-1 text-xs text-fg-2">
                      {primaryConfig.scope} scope · {formatBytes(primaryConfig.sizeBytes)} ·
                      updated {relativeTime(primaryConfig.lastModified)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleStartAdd}
                      disabled={!canAddStructuredServer}
                      className="btn-primary btn-sm"
                      title={
                        canAddStructuredServer
                          ? 'Add server'
                          : 'This config format is only editable through raw JSON'
                      }
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add server
                    </button>
                    <button
                      onClick={() => {
                        setEditMode('json');
                        setApiErrors(null);
                      }}
                      className="btn-secondary btn-sm"
                    >
                      <FileJson className="w-3.5 h-3.5" />
                      Raw JSON
                    </button>
                    <button
                      onClick={() => setShowHistory(true)}
                      className="btn-secondary btn-sm"
                    >
                      <History className="w-3.5 h-3.5" />
                      History
                    </button>
                    <button onClick={handleCopyPath} className="btn-secondary btn-sm">
                      <Copy className="w-3.5 h-3.5" />
                      Copy path
                    </button>
                  </div>
                </div>
                {primaryConfig.parseError ? (
                  <div className="mt-3 p-3 rounded-md border border-border-strong bg-surface-2">
                    <p className="text-sm text-fg">Parse error: {primaryConfig.parseError}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          {!agentNotFound && primaryConfig ? (
            <ConfigHeader
              config={primaryConfig}
              headerOpen={headerOpen}
              onToggleHeader={() => setHeaderOpen((v) => !v)}
            />
          ) : null}

          {wsWarning && primaryConfig ? (
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
                <button
                  onClick={() => setWsWarning(null)}
                  className="btn-ghost btn-sm"
                >
                  Keep editing
                </button>
              </div>
            </div>
          ) : null}

          {wsStatus === 'disconnected' &&
          primaryConfig &&
          !agentNotFound &&
          (showAddForm || editMode !== 'list') ? (
            <div className="card p-3 flex items-center gap-2 border-border-strong">
              <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0" />
              <p className="text-sm text-fg">
                Live connection lost. Save is disabled until reconnected.
              </p>
            </div>
          ) : null}

          {agentNotFound ? (
            <div className="card flex flex-col items-center justify-center py-24">
              <SearchX className="w-10 h-10 mb-4 text-fg-3" strokeWidth={1} />
              <h3 className="text-sm font-semibold text-fg">{selectedAgent?.label} config not found</h3>
              <p className="mt-1 text-sm text-fg-2">
                We could not find a readable MCP config file for this target.
              </p>
            </div>
          ) : null}

          {!agentNotFound && editMode === 'json' && primaryConfig ? (
            <div className="card p-4">
              <JsonEditor
                content={jsonEditorContent ?? primaryConfig.raw}
                language={primaryConfig.format === 'yaml' ? 'yaml' : 'json'}
                readOnly={false}
                onSave={handleSaveJson}
              />
            </div>
          ) : null}

          {!agentNotFound && editMode === 'list' && !showAddForm ? (
            <div className="space-y-4">
              <div className="card p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-fg">Server inventory</h3>
                    <p className="mt-0.5 text-xs text-fg-2">
                      {filteredDisplayServers.length} visible · {displayServers.length} total
                    </p>
                  </div>
                  <label className="relative block w-full lg:w-80">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
                    <input
                      type="search"
                      value={serverQuery}
                      onChange={(e) => setServerQuery(e.target.value)}
                      placeholder="Search servers, transport, path…"
                      className="input pl-9"
                    />
                  </label>
                </div>
              </div>

              {displayServers.length === 0 ? (
                <div className="card flex flex-col items-center justify-center py-16">
                  <Plug className="w-10 h-10 mb-3 text-fg-3" />
                  <h3 className="text-sm font-semibold text-fg">No MCP servers configured</h3>
                  <p className="mt-1 text-sm text-fg-2">
                    This config file exists, but it does not define any servers yet.
                  </p>
                </div>
              ) : filteredDisplayServers.length === 0 ? (
                <div className="card flex flex-col items-center justify-center py-16">
                  <SearchX className="w-10 h-10 mb-3 text-fg-3" />
                  <h3 className="text-sm font-semibold text-fg">No servers match this search</h3>
                  <p className="mt-1 text-sm text-fg-2">
                    Try a name, transport, command, or config path.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredDisplayServers.map(({ server, config }) => (
                    <ServerRow
                      key={`${config.absolutePath}:${server.name}`}
                      server={server}
                      config={config}
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
          ) : null}

          {!agentNotFound && (editMode === 'form' || showAddForm) && primaryConfig ? (
            <div className="grid gap-4 2xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]">
              <div className="space-y-4">
                <div className="card p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-fg">Server inventory</h3>
                      <p className="mt-0.5 text-xs text-fg-2">
                        {filteredDisplayServers.length} visible · {displayServers.length} total
                      </p>
                    </div>
                    <label className="relative block w-full lg:w-80">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-3" />
                      <input
                        type="search"
                        value={serverQuery}
                        onChange={(e) => setServerQuery(e.target.value)}
                        placeholder="Search servers, transport, path…"
                        className="input pl-9"
                      />
                    </label>
                  </div>
                </div>

                {filteredDisplayServers.length > 0 ? (
                  <div className="space-y-2">
                    {filteredDisplayServers.map(({ server, config }) => (
                      <ServerRow
                        key={`${config.absolutePath}:${server.name}`}
                        server={server}
                        config={config}
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
                ) : (
                  <div className="card flex flex-col items-center justify-center py-12">
                    <SearchX className="w-10 h-10 mb-3 text-fg-3" />
                    <h3 className="text-sm font-semibold text-fg">No servers match this search</h3>
                    <p className="mt-1 text-sm text-fg-2">
                      Clear the search to restore the full inventory.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="card p-4">
                  <h3 className="text-sm font-semibold text-fg">
                    {showAddForm ? 'New server' : 'Selected server'}
                  </h3>
                  <p className="mt-1 text-sm text-fg-2">
                    {showAddForm
                      ? canAddStructuredServer
                        ? 'Add the new MCP server here. Advanced file actions remain available above.'
                        : 'This config shape is not supported by the structured form. Use raw JSON for manual edits.'
                      : selectedServerEntry
                        ? `Editing ${selectedServerEntry.server.name} from the ${selectedServerEntry.config.scope} config.`
                        : 'Choose a server row to see what is being edited.'}
                  </p>
                </div>

                {editMode === 'form' && selectedServer && selectedServer.control.canEdit ? (
                  <McpServerForm
                    server={selectedServer}
                    saving={saving}
                    apiErrors={apiErrors}
                    onSave={handleSaveForm}
                    onCancel={handleBackToList}
                  />
                ) : null}

                {showAddForm && parsedConfig && canAddStructuredServer ? (
                  <McpServerForm
                    server={null}
                    saving={saving}
                    apiErrors={apiErrors}
                    onSave={handleSaveForm}
                    onCancel={() => {
                      setShowAddForm(false);
                      setApiErrors(null);
                    }}
                  />
                ) : null}
              </div>
            </div>
          ) : null}

          {deleteTarget ? (
            <ConfirmModal
              open={!!deleteTarget}
              title={`Delete ${deleteTarget}?`}
              description={`This will remove "${deleteTarget}" from ${selectedAgent?.label ?? 'the project'}'s config.`}
              confirmLabel="Delete"
              variant="danger"
              onConfirm={() => handleDelete(deleteTarget)}
              onCancel={() => setDeleteTarget(null)}
            />
          ) : null}
        </div>
      </div>

      {showHistory && primaryConfig ? (
        <ConfigHistory
          pathEntryId={primaryConfig.pathEntryId}
          configLabel={selectedAgent?.label ?? 'Project config'}
          onClose={() => setShowHistory(false)}
          onRestoreComplete={refresh}
        />
      ) : null}
    </div>
  );
}
