import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Loader,
  PackageOpen,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ArrowRightLeft,
} from 'lucide-react';
import { useScan } from '../hooks/useScan';
import { ConfirmModal } from '../components/ConfirmModal';
import { DiffView } from '../components/DiffView';
import { patchConfig, ApiError } from '../api/client';
import type { ConfigResult, McpServer } from '../api/client';
import { canInsertServerIntoConfig, insertServerIntoConfig } from '../lib/mcpConfig';
import {
  getServerBadgeClass,
  getServerBadgeLabel,
  getServerPreviewText,
} from '../lib/mcpPresentation';
import { useToast } from '../context/ToastContext';

interface ComparedServer {
  name: string;
  source: McpServer | null;
  target: McpServer | null;
}

function getPrimaryConfig(configs: ConfigResult[]): ConfigResult | null {
  return configs.find((c) => c.scope === 'global') ?? configs[0] ?? null;
}

function mergeServers(configs: ConfigResult[]): McpServer[] {
  const seen = new Set<string>();
  const result: McpServer[] = [];
  for (const config of configs) {
    for (const server of config.mcpServers) {
      if (!seen.has(server.name)) {
        seen.add(server.name);
        result.push(server);
      }
    }
  }
  return result;
}

function comparableServer(server: McpServer): Record<string, unknown> {
  return {
    transport: server.transport,
    command: server.command ?? null,
    args: server.args ?? [],
    env: server.env ?? {},
    url: server.url ?? null,
    enabled: server.enabled,
  };
}

function serversEqual(a: McpServer, b: McpServer): boolean {
  return JSON.stringify(comparableServer(a)) === JSON.stringify(comparableServer(b));
}

function commandPreview(server: McpServer): string {
  const cmd = getServerPreviewText(server);
  return cmd.length > 50 ? cmd.slice(0, 50) + '...' : cmd;
}

function serializeConfig(obj: Record<string, unknown>): string {
  return JSON.stringify(obj, null, 2) + '\n';
}

function ServerInfo({ server }: { server: McpServer }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-fg">{server.name}</span>
        <span className={getServerBadgeClass(server)}>{getServerBadgeLabel(server)}</span>
        {!server.enabled ? <span className="badge">disabled</span> : null}
      </div>
      <p className="text-xs text-fg-2 font-mono truncate">{commandPreview(server)}</p>
      {server.args && server.args.length > 0 ? (
        <p className="text-[11px] text-fg-3">
          {server.args.length} arg{server.args.length !== 1 ? 's' : ''}
        </p>
      ) : null}
      {server.env && Object.keys(server.env).length > 0 ? (
        <p className="text-[11px] text-fg-3">
          {Object.keys(server.env).length} env var
          {Object.keys(server.env).length !== 1 ? 's' : ''}
        </p>
      ) : null}
    </div>
  );
}

interface SyncChange {
  serverName: string;
  targetLabel: string;
}

function canCopyServerToConfig(config: ConfigResult | null, server: McpServer | null): boolean {
  if (!config?.parsed || typeof config.parsed !== 'object' || !server) return false;
  return canInsertServerIntoConfig(config.parsed as Record<string, unknown>, server);
}

export function DiffSync() {
  const { scanResult, loading, error, refresh } = useScan();
  const { addToast } = useToast();

  const [sourceAgentId, setSourceAgentId] = useState<string>('');
  const [targetAgentId, setTargetAgentId] = useState<string>('');
  const [expandedDiff, setExpandedDiff] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [copyingServer, setCopyingServer] = useState<string | null>(null);
  const [syncErrors, setSyncErrors] = useState<Map<string, string>>(new Map());
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);

  const foundAgents = useMemo(() => {
    if (!scanResult) return [];
    return [...scanResult.agents]
      .filter((a) => a.found && a.configs.length > 0)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [scanResult]);

  const sourceAgent = useMemo(
    () => foundAgents.find((a) => a.id === sourceAgentId) ?? null,
    [foundAgents, sourceAgentId],
  );
  const targetAgent = useMemo(
    () => foundAgents.find((a) => a.id === targetAgentId) ?? null,
    [foundAgents, targetAgentId],
  );

  const sourceServers = useMemo(
    () => (sourceAgent ? mergeServers(sourceAgent.configs) : []),
    [sourceAgent],
  );
  const targetServers = useMemo(
    () => (targetAgent ? mergeServers(targetAgent.configs) : []),
    [targetAgent],
  );

  const sourcePrimary = useMemo(
    () => (sourceAgent ? getPrimaryConfig(sourceAgent.configs) : null),
    [sourceAgent],
  );
  const targetPrimary = useMemo(
    () => (targetAgent ? getPrimaryConfig(targetAgent.configs) : null),
    [targetAgent],
  );

  const compared = useMemo((): ComparedServer[] => {
    if (!sourceAgent || !targetAgent) return [];
    const allNames = new Set<string>();
    sourceServers.forEach((s) => allNames.add(s.name));
    targetServers.forEach((s) => allNames.add(s.name));

    const sourceMap = new Map<string, McpServer>();
    sourceServers.forEach((s) => sourceMap.set(s.name, s));
    const targetMap = new Map<string, McpServer>();
    targetServers.forEach((s) => targetMap.set(s.name, s));

    return [...allNames]
      .sort((a, b) => a.localeCompare(b))
      .map((name) => ({
        name,
        source: sourceMap.get(name) ?? null,
        target: targetMap.get(name) ?? null,
      }));
  }, [sourceAgent, targetAgent, sourceServers, targetServers]);

  const onlyInSource = useMemo(() => compared.filter((c) => c.source && !c.target), [compared]);
  const onlyInTarget = useMemo(() => compared.filter((c) => c.target && !c.source), [compared]);
  const inBoth = useMemo(() => compared.filter((c) => c.source && c.target), [compared]);
  const copyableOnlyInSource = useMemo(
    () => onlyInSource.filter((row) => canCopyServerToConfig(targetPrimary, row.source)),
    [onlyInSource, targetPrimary],
  );

  useEffect(() => {
    setExpandedDiff(null);
    setSyncErrors(new Map());
  }, [sourceAgentId, targetAgentId]);

  const copyServer = useCallback(
    async (serverName: string, direction: 'to-target' | 'to-source') => {
      const fromAgent = direction === 'to-target' ? sourceAgent : targetAgent;
      const toAgent = direction === 'to-target' ? targetAgent : sourceAgent;
      const toPrimary = direction === 'to-target' ? targetPrimary : sourcePrimary;
      const fromServers = direction === 'to-target' ? sourceServers : targetServers;

      if (!fromAgent || !toAgent || !toPrimary) return;

      const server = fromServers.find((s) => s.name === serverName);
      if (!server) return;

      setCopyingServer(serverName);
      try {
        if (!toPrimary.parsed || typeof toPrimary.parsed !== 'object') {
          throw new Error('Target config is not parseable');
        }

        const cloned = insertServerIntoConfig(
          toPrimary.parsed as Record<string, unknown>,
          server,
        );

        const format =
          toPrimary.format === 'yaml' ? 'json' : (toPrimary.format as 'json' | 'jsonc');
        const content = serializeConfig(cloned);
        await patchConfig(toPrimary.pathEntryId, content, format);
        setSyncErrors((prev) => {
          const next = new Map(prev);
          next.delete(serverName);
          return next;
        });
        addToast(
          'success',
          direction === 'to-target'
            ? `Copied "${serverName}" to ${toAgent.label}`
            : `Copied "${serverName}" to ${fromAgent.label}`,
        );
        await refresh();
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Failed to copy';
        setSyncErrors((prev) => new Map(prev).set(serverName, message));
      } finally {
        setCopyingServer(null);
      }
    },
    [
      sourceAgent,
      targetAgent,
      sourcePrimary,
      targetPrimary,
      sourceServers,
      targetServers,
      refresh,
      addToast,
    ],
  );

  const handleSyncAll = useCallback(async () => {
    if (!sourceAgent || !targetAgent || !targetPrimary) return;
    setShowSyncConfirm(false);
    setSyncing(true);
    setSyncErrors(new Map());

    let successCount = 0;
    let failCount = 0;

    if (!targetPrimary.parsed || typeof targetPrimary.parsed !== 'object') {
      setSyncing(false);
      addToast('error', 'Target config is not parseable');
      return;
    }

    const runningConfig = JSON.parse(JSON.stringify(targetPrimary.parsed));
    const format =
      targetPrimary.format === 'yaml' ? 'json' : (targetPrimary.format as 'json' | 'jsonc');

    for (const { name } of copyableOnlyInSource) {
      const server = sourceServers.find((s) => s.name === name);
      if (!server) continue;

      try {
        const nextConfig = insertServerIntoConfig(runningConfig, server);
        Object.keys(runningConfig).forEach((key) => delete runningConfig[key]);
        Object.assign(runningConfig, nextConfig);

        const content = serializeConfig(runningConfig);
        await patchConfig(targetPrimary.pathEntryId, content, format);
        successCount++;
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Failed';
        setSyncErrors((prev) => new Map(prev).set(name, message));
        failCount++;
      }
    }

    setSyncing(false);
    await refresh();

    if (failCount === 0) {
      addToast(
        'success',
        `Synced ${successCount} server${successCount !== 1 ? 's' : ''} to ${targetAgent.label}`,
      );
    } else {
      addToast(
        'warning',
        `${successCount}/${successCount + failCount} servers synced. ${failCount} failed.`,
      );
    }
  }, [copyableOnlyInSource, sourceServers, sourceAgent, targetAgent, targetPrimary, refresh, addToast]);

  if (loading && !scanResult) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-5 h-5 text-fg-2 animate-spin" />
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

  if (!scanResult || scanResult.agents.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-20">
        <PackageOpen className="w-12 h-12 mb-4 text-fg-3" />
        <h3 className="text-sm font-semibold text-fg">No agents found</h3>
        <p className="mt-1 text-sm text-fg-2">Run a scan to discover agents.</p>
      </div>
    );
  }

  const syncChanges: SyncChange[] = copyableOnlyInSource.map((c) => ({
    serverName: c.name,
    targetLabel: targetAgent?.label ?? 'target',
  }));

  const bothIdentical =
    compared.length > 0 &&
    inBoth.every((c) => serversEqual(c.source!, c.target!)) &&
    onlyInSource.length === 0 &&
    onlyInTarget.length === 0;

  return (
    <div className="w-full flex flex-col gap-6">
      <header className="border-b border-border pb-4">
        <h1 className="heading-page">Compare & Sync</h1>
        <p className="mt-1 text-sm text-fg-2">
          Audit and sync MCP server configurations between agents.
        </p>
      </header>

      <div className="card p-5 flex flex-col md:flex-row items-stretch md:items-end gap-3">
        <div className="flex-1 min-w-0">
          <label className="label">Source</label>
          <select
            className="select"
            value={sourceAgentId}
            onChange={(e) => setSourceAgentId(e.target.value)}
          >
            <option value="">Select a source agent…</option>
            {foundAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.label} ({mergeServers(agent.configs).length} servers)
              </option>
            ))}
          </select>
        </div>

        <div className="hidden md:flex items-center justify-center w-10 h-10 text-fg-2 self-end mb-0.5">
          <ArrowRightLeft className="w-4 h-4" />
        </div>

        <div className="flex-1 min-w-0">
          <label className="label">Target</label>
          <select
            className="select"
            value={targetAgentId}
            onChange={(e) => setTargetAgentId(e.target.value)}
          >
            <option value="">Select a target agent…</option>
            {foundAgents
              .filter((a) => a.id !== sourceAgentId)
              .map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.label} ({mergeServers(agent.configs).length} servers)
                </option>
              ))}
          </select>
        </div>
      </div>

      {!sourceAgentId || !targetAgentId ? (
        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <ArrowRightLeft className="w-10 h-10 mb-3 text-fg-3" />
          <h3 className="text-sm font-semibold text-fg">Choose source and target</h3>
          <p className="mt-1 text-sm text-fg-2 max-w-sm">
            Pick a source and target to compare their MCP server configurations.
          </p>
        </div>
      ) : null}

      {sourceAgentId && targetAgentId && sourceAgent && targetAgent ? (
        <>
          {copyableOnlyInSource.length > 0 ? (
            <div className="card p-4 flex items-center justify-between gap-3 border-border-strong">
              <p className="text-sm text-fg">
                <span className="font-medium">{copyableOnlyInSource.length}</span> copyable
                server{copyableOnlyInSource.length === 1 ? '' : 's'} detected in{' '}
                {sourceAgent.label}
              </p>
              <button
                onClick={() => setShowSyncConfirm(true)}
                disabled={syncing}
                className="btn-primary"
              >
                {syncing ? (
                  <Loader className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ArrowRight className="w-3.5 h-3.5" />
                )}
                Sync all
              </button>
            </div>
          ) : null}

          {onlyInSource.length > copyableOnlyInSource.length ? (
            <div className="card p-3">
              <p className="text-xs text-fg-2">
                {onlyInSource.length - copyableOnlyInSource.length} source-only entries can't be
                synced because the target config format doesn't support their MCP entry type.
              </p>
            </div>
          ) : null}

          {sourceServers.length === 0 || targetServers.length === 0 ? (
            <div className="card p-3 flex items-center gap-3">
              <PackageOpen className="w-4 h-4 text-fg-2 flex-shrink-0" />
              {sourceServers.length === 0 && targetServers.length === 0 ? (
                <p className="text-sm text-fg-2">Both configurations have zero servers.</p>
              ) : sourceServers.length === 0 ? (
                <p className="text-sm text-fg-2">
                  {sourceAgent.label} has zero servers. Target-only entries can be cloned left.
                </p>
              ) : (
                <p className="text-sm text-fg-2">
                  {targetAgent.label} has zero servers. Source-only entries can be cloned right.
                </p>
              )}
            </div>
          ) : null}

          {bothIdentical ? (
            <div className="card p-8 flex flex-col items-center justify-center text-center">
              <Check className="w-8 h-8 mb-3 text-fg" />
              <p className="text-sm font-semibold text-fg">Configurations are identical</p>
              <p className="mt-1 text-xs text-fg-2">No sync changes registered.</p>
            </div>
          ) : null}

          {compared.length > 0 && !bothIdentical ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-4 py-2 text-xs text-fg-2">
                <div className="truncate">Source: {sourceAgent.label}</div>
                <div className="w-28 text-center">Status</div>
                <div className="truncate">Target: {targetAgent.label}</div>
              </div>

              {compared.map((row) => {
                const isOnlySource = row.source && !row.target;
                const isOnlyTarget = row.target && !row.source;
                const isBoth = row.source && row.target;
                const isDifferent = isBoth && !serversEqual(row.source!, row.target!);
                const isExpanded = expandedDiff === row.name;
                const copyError = syncErrors.get(row.name);
                const isCopying = copyingServer === row.name;
                const canCopyToTarget = canCopyServerToConfig(targetPrimary, row.source);
                const canCopyToSource = canCopyServerToConfig(sourcePrimary, row.target);

                const status = isOnlySource
                  ? 'Source only'
                  : isOnlyTarget
                    ? 'Target only'
                    : isDifferent
                      ? 'Mismatch'
                      : 'In sync';

                return (
                  <div key={row.name} className="space-y-1">
                    <div className="grid grid-cols-[1fr_auto_1fr] gap-4 px-4 py-3 rounded-md border border-border bg-surface items-start">
                      <div className="min-w-0">
                        {row.source ? (
                          <ServerInfo server={row.source} />
                        ) : (
                          <span className="text-sm text-fg-3">—</span>
                        )}
                      </div>

                      <div className="w-32 flex flex-col items-center gap-2">
                        <span className="badge">{status}</span>
                        {isOnlySource && targetPrimary && canCopyToTarget ? (
                          <button
                            onClick={() => copyServer(row.name, 'to-target')}
                            disabled={isCopying}
                            className="btn-secondary btn-sm w-full"
                          >
                            {isCopying ? (
                              <Loader className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowRight className="w-3.5 h-3.5" />
                            )}
                            Clone right
                          </button>
                        ) : null}
                        {isOnlyTarget && sourcePrimary && canCopyToSource ? (
                          <button
                            onClick={() => copyServer(row.name, 'to-source')}
                            disabled={isCopying}
                            className="btn-secondary btn-sm w-full"
                          >
                            {isCopying ? (
                              <Loader className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <ArrowLeft className="w-3.5 h-3.5" />
                            )}
                            Clone left
                          </button>
                        ) : null}
                        {((isOnlySource && targetPrimary && !canCopyToTarget) ||
                          (isOnlyTarget && sourcePrimary && !canCopyToSource)) ? (
                          <span
                            className="flex items-center gap-1 text-[11px] text-fg-3"
                            title="The destination config does not support this MCP entry structure"
                          >
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            Unsupported
                          </span>
                        ) : null}
                        {isDifferent ? (
                          <button
                            onClick={() => setExpandedDiff(isExpanded ? null : row.name)}
                            className="btn-ghost btn-sm w-full"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronRight className="w-3.5 h-3.5" />
                            )}
                            Compare
                          </button>
                        ) : null}
                        {copyError ? (
                          <div className="flex items-center gap-1 text-[11px] text-fg truncate max-w-full">
                            <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                            <span className="truncate">{copyError}</span>
                          </div>
                        ) : null}
                      </div>

                      <div className="min-w-0">
                        {row.target ? (
                          <ServerInfo server={row.target} />
                        ) : (
                          <span className="text-sm text-fg-3">—</span>
                        )}
                      </div>
                    </div>

                    {isExpanded && isDifferent && row.source && row.target ? (
                      <div className="ml-4 mr-4 card overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-2">
                          <span className="text-xs font-medium text-fg-2">
                            Differences in {row.name}
                          </span>
                          <div className="flex items-center gap-2">
                            {canCopyToTarget ? (
                              <button
                                onClick={() => copyServer(row.name, 'to-target')}
                                disabled={isCopying}
                                className="btn-ghost btn-sm"
                              >
                                {isCopying ? (
                                  <Loader className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ArrowRight className="w-3 h-3" />
                                )}
                                Overwrite target
                              </button>
                            ) : null}
                            {canCopyToSource ? (
                              <button
                                onClick={() => copyServer(row.name, 'to-source')}
                                disabled={isCopying}
                                className="btn-ghost btn-sm"
                              >
                                {isCopying ? (
                                  <Loader className="w-3 h-3 animate-spin" />
                                ) : (
                                  <ArrowLeft className="w-3 h-3" />
                                )}
                                Overwrite source
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <DiffView
                          oldJson={row.source.raw as Record<string, unknown>}
                          newJson={row.target.raw as Record<string, unknown>}
                          oldLabel={sourceAgent.label}
                          newLabel={targetAgent.label}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {compared.length === 0 && sourceServers.length === 0 && targetServers.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-16 text-center">
              <PackageOpen className="w-8 h-8 mb-3 text-fg-3" />
              <p className="text-sm text-fg-2">No MCP servers to compare</p>
            </div>
          ) : null}

          {syncErrors.size > 0 && !syncing ? (
            <div className="card p-4 border-border-strong">
              <p className="text-sm font-medium text-fg mb-2">Sync errors</p>
              <ul className="space-y-1 text-sm text-fg-2">
                {[...syncErrors.entries()].map(([name, err]) => (
                  <li key={name} className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-fg flex-shrink-0" />
                    <span className="font-medium text-fg">{name}:</span>
                    <span>{err}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}

      {showSyncConfirm && targetAgent ? (
        <ConfirmModal
          open={true}
          title={`Sync all to ${targetAgent.label}`}
          description={`This will copy ${syncChanges.length} server${syncChanges.length !== 1 ? 's' : ''} from ${sourceAgent?.label ?? 'source'} to ${targetAgent.label}.`}
          confirmLabel={`Sync ${syncChanges.length} server${syncChanges.length !== 1 ? 's' : ''}`}
          variant="default"
          onConfirm={handleSyncAll}
          onCancel={() => setShowSyncConfirm(false)}
        />
      ) : null}
    </div>
  );
}
