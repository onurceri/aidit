import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw,
  Search,
  ChevronRight,
  AlertTriangle,
  PackageOpen,
  ExternalLink,
  FolderGit2,
} from 'lucide-react';
import { useScan } from '../hooks/useScan';
import { useWatcher } from '../hooks/useWatcher';
import type { AgentResult, WsEvent } from '../api/client';
import { getAgentIcon } from '../lib/icons';
import { relativeTime } from '../lib/time';
import { displayPath } from '../lib/paths';
import { Page, EmptyState } from '../components/Layout';

interface AgentStats {
  servers: number;
  enabled: number;
  skills: number;
  parseErrors: number;
  primaryPath: string | null;
  hasProject: boolean;
}

function statsFor(agent: AgentResult): AgentStats {
  const servers = agent.configs.flatMap((c) => c.mcpServers);
  const primary = agent.configs.find((c) => c.scope === 'global') ?? agent.configs[0];
  return {
    servers: servers.length,
    enabled: servers.filter((s) => s.enabled).length,
    skills: agent.skillsDirs.reduce((n, d) => n + d.skills.length, 0),
    parseErrors: agent.configs.filter((c) => c.parseError).length,
    primaryPath: primary?.absolutePath ?? agent.skillsDirs[0]?.absolutePath ?? null,
    hasProject:
      agent.configs.some((c) => c.scope === 'project') ||
      agent.skillsDirs.some((d) => d.scope === 'project'),
  };
}

function matches(agent: AgentResult, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [
    agent.label,
    agent.id,
    ...agent.configs.map((c) => c.absolutePath),
    ...agent.configs.flatMap((c) => c.mcpServers.map((s) => s.name)),
    ...agent.skillsDirs.map((d) => d.absolutePath),
  ]
    .join(' ')
    .toLowerCase()
    .includes(q);
}

function Count({ n, one, many = `${one}s` }: { n: number; one: string; many?: string }) {
  return (
    <span>
      <span className="tabular-nums text-fg">{n}</span> {n === 1 ? one : many}
    </span>
  );
}

function AgentTile({ agent }: { agent: AgentResult }) {
  const Icon = getAgentIcon(agent.id);
  const stats = statsFor(agent);
  const status =
    stats.parseErrors > 0
      ? 'status-err'
      : stats.servers > 0 || stats.skills > 0
        ? 'status-ok'
        : 'status-warn';
  const statusText =
    stats.parseErrors > 0
      ? 'Config has errors'
      : stats.servers > 0
        ? `${stats.enabled} of ${stats.servers} servers enabled`
        : stats.skills > 0
          ? 'Skills only'
          : 'No MCP servers yet';
  const target = stats.servers > 0 || stats.skills === 0 ? `/mcp/${agent.id}` : '/skills';

  return (
    <Link
      to={target}
      className="card card-hover group flex flex-col gap-3 p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-fg"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-md border border-border bg-surface-2 flex items-center justify-center flex-shrink-0">
          <Icon className="w-4 h-4 text-fg" strokeWidth={1.75} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-fg truncate">{agent.label}</h3>
            {stats.hasProject ? (
              <span className="badge" title="Has project-level configuration">
                <FolderGit2 className="w-3 h-3" />
                project
              </span>
            ) : null}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-2">
            <span className={`status-dot ${status}`} />
            {statusText}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-fg-3 group-hover:text-fg transition-colors flex-shrink-0" />
      </div>

      <div className="flex items-center gap-4 text-xs text-fg-2">
        <Count n={stats.servers} one="server" />
        <Count n={stats.skills} one="skill" />
        <Count n={agent.configs.length} one="config" />
      </div>

      {stats.primaryPath ? (
        <div
          className="font-mono text-[11px] text-fg-3 truncate border-t border-border pt-2.5 -mx-4 px-4"
          title={stats.primaryPath}
        >
          {displayPath(stats.primaryPath)}
        </div>
      ) : null}
    </Link>
  );
}

function MissingChip({ agent }: { agent: AgentResult }) {
  const Icon = getAgentIcon(agent.id);
  const className =
    'group flex items-center gap-2 h-8 px-2.5 rounded-md border border-border text-xs text-fg-2 hover:text-fg hover:border-border-strong transition-colors min-w-0';
  const content = (
    <>
      <Icon className="w-3.5 h-3.5 text-fg-3 flex-shrink-0" strokeWidth={1.75} />
      <span className="truncate">{agent.label}</span>
      {agent.homepage ? (
        <ExternalLink className="w-3 h-3 ml-auto text-fg-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
      ) : null}
    </>
  );

  return agent.homepage ? (
    <a
      href={agent.homepage}
      target="_blank"
      rel="noreferrer"
      className={className}
      title={`${agent.label}: no config found at known paths. Open docs`}
    >
      {content}
    </a>
  ) : (
    <div className={className}>{content}</div>
  );
}

export function Overview() {
  const { scanResult, loading, error, lastScanned, refresh } = useScan();
  const { subscribe, unsubscribe } = useWatcher();
  const [query, setQuery] = useState('');
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    const handler = (event: WsEvent) => {
      if (event.event === 'scan:full') refresh();
    };
    subscribe('scan:full', handler);
    return () => unsubscribe('scan:full', handler);
  }, [subscribe, unsubscribe, refresh]);

  const agents = useMemo(() => scanResult?.agents ?? [], [scanResult]);
  const found = useMemo(
    () =>
      agents
        .filter((a) => a.found && matches(a, query))
        .sort((a, b) => {
          const diff = statsFor(b).servers - statsFor(a).servers;
          return diff !== 0 ? diff : a.label.localeCompare(b.label);
        }),
    [agents, query],
  );
  const missing = useMemo(
    () =>
      agents
        .filter((a) => !a.found && matches(a, query))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [agents, query],
  );

  const totals = useMemo(() => {
    const detected = agents.filter((a) => a.found).map(statsFor);
    return {
      detected: detected.length,
      servers: detected.reduce((n, s) => n + s.servers, 0),
      enabled: detected.reduce((n, s) => n + s.enabled, 0),
      skills: detected.reduce((n, s) => n + s.skills, 0),
      errors: detected.reduce((n, s) => n + s.parseErrors, 0),
    };
  }, [agents]);

  const searching = query.trim().length > 0;
  const missingOpen = showMissing || (searching && missing.length > 0);

  return (
    <Page
      title="Agents"
      description={
        scanResult
          ? `Scanned ${lastScanned ? relativeTime(lastScanned) : 'just now'} · project ${displayPath(scanResult.workingDirectory)}`
          : 'AI coding agents on this machine'
      }
      actions={
        <>
          <label className="relative hidden sm:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-fg-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter agents, paths, servers…"
              className="input h-8 w-64 pl-8"
            />
          </label>
          <button onClick={refresh} disabled={loading} className="btn-secondary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
        </>
      }
    >
      {error ? (
        <div className="card p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-fg">Couldn&apos;t load agents</div>
            <p className="mt-0.5 text-sm text-fg-2">{error}</p>
          </div>
          <button onClick={refresh} className="btn-secondary btn-sm">
            Retry
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        <div className="stat">
          <div className="stat-label">Agents detected</div>
          <div className="stat-value">
            {totals.detected}
            <span className="text-sm font-normal text-fg-3"> / {agents.length}</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">MCP servers</div>
          <div className="stat-value">
            {totals.servers}
            <span className="text-sm font-normal text-fg-3"> · {totals.enabled} enabled</span>
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">Skills</div>
          <div className="stat-value">{totals.skills}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Config errors</div>
          <div className="stat-value flex items-center gap-2">
            {totals.errors}
            <span className={`status-dot ${totals.errors > 0 ? 'status-err' : 'status-ok'}`} />
          </div>
        </div>
      </div>

      {loading && !scanResult ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-[132px] animate-pulse bg-surface-2" />
          ))}
        </div>
      ) : null}

      {scanResult ? (
        <>
          <div className="section-label !px-0 !pt-0 mb-2">
            <span>Detected · {found.length}</span>
          </div>
          {found.length > 0 ? (
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {found.map((agent) => (
                <AgentTile key={agent.id} agent={agent} />
              ))}
            </div>
          ) : (
            <div className="card">
              <EmptyState icon={PackageOpen} title={searching ? 'No matches' : 'No agents found'}>
                {searching
                  ? 'No detected agent matches this filter.'
                  : 'aidit found no agent configs at the known paths. Add custom paths in Settings → Paths.'}
              </EmptyState>
            </div>
          )}

          {missing.length > 0 ? (
            <div className="mt-8">
              <button
                type="button"
                onClick={() => setShowMissing((v) => !v)}
                className="section-label !px-0 w-full hover:text-fg-2 transition-colors"
                aria-expanded={missingOpen}
              >
                <span className="flex items-center gap-1">
                  <ChevronRight
                    className={`w-3 h-3 transition-transform ${missingOpen ? 'rotate-90' : ''}`}
                  />
                  Not detected · {missing.length}
                </span>
                <span className="normal-case tracking-normal font-normal">
                  {missingOpen ? 'Hide' : 'Show all supported agents'}
                </span>
              </button>
              {missingOpen ? (
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
                  {missing.map((agent) => (
                    <MissingChip key={agent.id} agent={agent} />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Page>
  );
}
