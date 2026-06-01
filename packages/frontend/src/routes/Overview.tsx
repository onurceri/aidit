import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Monitor, FolderGit2, AlertTriangle, Search, PackageOpen } from 'lucide-react';
import { useScan } from '../hooks/useScan';
import { useWatcher } from '../hooks/useWatcher';
import { AgentCard, AgentCardSkeleton } from '../components/AgentCard';
import type { AgentResult, ConfigResult, WsEvent } from '../api/client';
import { getAgentFamily } from '../lib/icons';
import { relativeTime } from '../lib/time';

type StatusFilter = 'all' | 'active' | 'attention' | 'offline';

interface AgentFamilyGroup {
  id: string;
  label: string;
  icon: typeof Monitor;
  agents: AgentResult[];
}

function countMcpServers(configs: ConfigResult[]) {
  let enabled = 0;
  let disabled = 0;
  for (const config of configs) {
    for (const server of config.mcpServers) {
      if (server.enabled) enabled += 1;
      else disabled += 1;
    }
  }
  return { enabled, disabled };
}

function groupAgents(agents: AgentResult[]): {
  global: AgentResult[];
  project: AgentResult[];
  unresolved: AgentResult[];
} {
  const global: AgentResult[] = [];
  const project: AgentResult[] = [];
  const unresolved: AgentResult[] = [];

  for (const agent of agents) {
    const hasGlobal =
      agent.configs.some((c) => c.scope === 'global') ||
      agent.skillsDirs.some((d) => d.scope === 'global');
    const hasProject =
      agent.configs.some((c) => c.scope === 'project') ||
      agent.skillsDirs.some((d) => d.scope === 'project');

    if (hasGlobal) global.push(agent);
    if (hasProject) project.push(agent);
    if (!hasGlobal && !hasProject) unresolved.push(agent);
  }

  return { global, project, unresolved };
}

function sortAgents(agents: AgentResult[]): AgentResult[] {
  return [...agents].sort((a, b) => {
    if (a.found !== b.found) return a.found ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

function matchesSearch(agent: AgentResult, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    agent.id,
    agent.label,
    ...agent.configs.map((config) => config.absolutePath),
    ...agent.configs.flatMap((config) => config.mcpServers.map((server) => server.name)),
    ...agent.skillsDirs.map((dir) => dir.absolutePath),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(normalized);
}

function matchesStatus(agent: AgentResult, filter: StatusFilter): boolean {
  const mcp = countMcpServers(agent.configs);
  const hasIssues =
    !agent.found ||
    mcp.enabled + mcp.disabled === 0 ||
    agent.configs.some((config) => config.parseError);

  if (filter === 'active') return agent.found;
  if (filter === 'attention') return hasIssues;
  if (filter === 'offline') return !agent.found;
  return true;
}

function filterAgents(
  agents: AgentResult[],
  query: string,
  statusFilter: StatusFilter,
): AgentResult[] {
  return agents.filter(
    (agent) => matchesSearch(agent, query) && matchesStatus(agent, statusFilter),
  );
}

function groupFamilies(agents: AgentResult[]): AgentFamilyGroup[] {
  const groups = new Map<string, AgentFamilyGroup>();

  for (const agent of agents) {
    const family = getAgentFamily(agent.id);
    const existing = groups.get(family.id);

    if (existing) {
      existing.agents.push(agent);
      continue;
    }

    groups.set(family.id, {
      id: family.id,
      label: family.label,
      icon: family.icon,
      agents: [agent],
    });
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      agents: sortAgents(group.agents),
    }))
    .sort((left, right) => {
      const leftFound = left.agents.some((agent) => agent.found);
      const rightFound = right.agents.some((agent) => agent.found);
      if (leftFound !== rightFound) return leftFound ? -1 : 1;
      return left.label.localeCompare(right.label);
    });
}

function summarizeFamily(agents: AgentResult[]) {
  let enabled = 0;
  let disabled = 0;
  let skillFiles = 0;
  let onlineAgents = 0;
  let issues = 0;

  for (const agent of agents) {
    const mcp = countMcpServers(agent.configs);
    enabled += mcp.enabled;
    disabled += mcp.disabled;
    skillFiles += agent.skillsDirs.reduce((total, dir) => total + dir.skills.length, 0);

    if (agent.found) onlineAgents += 1;

    if (
      !agent.found ||
      agent.configs.some((config) => config.parseError) ||
      mcp.enabled + mcp.disabled === 0
    ) {
      issues += 1;
    }
  }

  return {
    enabled,
    disabled,
    totalServers: enabled + disabled,
    skillFiles,
    onlineAgents,
    totalAgents: agents.length,
    issues,
  };
}

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'attention', label: 'Needs setup' },
  { value: 'offline', label: 'Offline' },
];

function SectionList({
  icon: Icon,
  title,
  families,
}: {
  icon: typeof Monitor;
  title: string;
  families: AgentFamilyGroup[];
}) {
  if (families.length === 0) return null;

  const totalAgents = families.reduce((total, family) => total + family.agents.length, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-border">
        <div className="flex items-center gap-2 text-fg-2">
          <Icon className="w-4 h-4" />
          <h3 className="text-sm font-semibold text-fg">{title}</h3>
          <span className="text-xs text-fg-2">
            {families.length} {families.length === 1 ? 'family' : 'families'} · {totalAgents}{' '}
            {totalAgents === 1 ? 'agent' : 'agents'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {families.map((family) => {
          if (family.agents.length === 1) {
            return <AgentCard key={family.id} agent={family.agents[0]} />;
          }

          const summary = summarizeFamily(family.agents);
          const FamilyIcon = family.icon;
          const summaryCopy =
            summary.totalServers > 0
              ? `${summary.totalServers} MCP server${summary.totalServers === 1 ? '' : 's'}`
              : 'no MCP servers yet';

          return (
            <div key={family.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg">
                    <FamilyIcon className="h-4.5 w-4.5" strokeWidth={1.5} />
                  </div>
                  <div className="space-y-0.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="text-sm font-semibold text-fg">{family.label}</h4>
                      {summary.issues === 0 ? (
                        <span className="badge">Ready</span>
                      ) : (
                        <span className="badge">
                          {summary.issues} issue{summary.issues === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-fg-2">
                      {summary.totalAgents} variant{summary.totalAgents === 1 ? '' : 's'} ·{' '}
                      {summary.onlineAgents} online · {summaryCopy} · {summary.skillFiles} skill
                      {summary.skillFiles === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t border-border pt-3">
                {family.agents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Overview() {
  const { scanResult, loading, error, lastScanned, refresh } = useScan();
  const { subscribe, unsubscribe } = useWatcher();
  const [externalUpdate, setExternalUpdate] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const externalUpdateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (event: WsEvent) => {
      if (event.event === 'scan:full') {
        refresh();
        setExternalUpdate(true);
        if (externalUpdateTimerRef.current) clearTimeout(externalUpdateTimerRef.current);
        externalUpdateTimerRef.current = setTimeout(() => setExternalUpdate(false), 3000);
      }
    };

    subscribe('scan:full', handler);
    return () => {
      unsubscribe('scan:full', handler);
      if (externalUpdateTimerRef.current) clearTimeout(externalUpdateTimerRef.current);
    };
  }, [subscribe, unsubscribe, refresh]);

  const activeAgents = scanResult?.agents.filter((a) => a.found).length ?? 0;
  const totalAgents = scanResult?.agents.length ?? 0;
  const activePercent = totalAgents > 0 ? (activeAgents / totalAgents) * 100 : 0;
  const { global, project, unresolved } = groupAgents(scanResult?.agents ?? []);
  const filteredGlobal = filterAgents(sortAgents(global), searchQuery, statusFilter);
  const filteredProject = filterAgents(sortAgents(project), searchQuery, statusFilter);
  const filteredUnresolved = filterAgents(sortAgents(unresolved), searchQuery, statusFilter);
  const filteredTotal = filteredGlobal.length + filteredProject.length + filteredUnresolved.length;
  const hasFilters = searchQuery.trim().length > 0 || statusFilter !== 'all';

  return (
    <div className="w-full flex flex-col gap-6">
      <div className="card p-5">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-xs text-fg-2">Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="dot-on" />
              <span className="font-medium text-fg">Active</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-2">Agents</div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-semibold text-fg">{activeAgents}</span>
              <span className="text-fg-2">/ {totalAgents}</span>
              <span className="text-xs text-fg-2">({Math.round(activePercent)}%)</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-2">Last scan</div>
            <div className="mt-1 font-medium text-fg">
              {lastScanned ? relativeTime(lastScanned) : 'Never'}
            </div>
          </div>
          <div>
            <div className="text-xs text-fg-2">Updates</div>
            <div className="mt-1 font-medium text-fg">
              {externalUpdate ? 'External change detected' : 'Up to date'}
            </div>
          </div>
        </div>
        <div className="mt-4 h-1 w-full bg-surface-3 rounded-full overflow-hidden">
          <div className="h-full bg-fg transition-all" style={{ width: `${activePercent}%` }} />
        </div>
      </div>

      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="heading-page">Agents</h1>
          <p className="mt-1 text-sm text-fg-2">
            Detected AI assistant configurations across your system.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="btn-secondary">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Re-scan
          </button>
        </div>
      </header>

      <div className="card p-4 flex flex-col gap-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 w-4 h-4 -translate-y-1/2 text-fg-3" />
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search agents, paths, or MCP server names…"
              className="input pl-9"
            />
          </label>

          <div className="flex flex-wrap items-center gap-1 p-0.5 rounded-md border border-border bg-surface-2">
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setStatusFilter(filter.value)}
                className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
                  statusFilter === filter.value
                    ? 'bg-surface text-fg'
                    : 'text-fg-2 hover:text-fg'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 text-xs text-fg-2">
          <span>
            Showing {filteredTotal} of {totalAgents} {totalAgents === 1 ? 'agent' : 'agents'}
          </span>
          {hasFilters ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="btn-ghost btn-sm"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="card p-4 border-border-strong">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-fg flex-shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-fg">Couldn't load agents</div>
              <p className="mt-0.5 text-sm text-fg-2">{error}</p>
            </div>
            <button onClick={refresh} className="btn-secondary btn-sm">
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {loading && !scanResult ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <AgentCardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {!loading && !error && scanResult && scanResult.agents.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <PackageOpen className="w-10 h-10 mb-3 text-fg-3" strokeWidth={1} />
          <h3 className="text-sm font-semibold text-fg">No agents detected</h3>
          <p className="mt-1 max-w-sm text-sm text-fg-2">
            No agent configurations detected in default paths. Configure custom scanner search
            paths.
          </p>
          <button onClick={refresh} className="btn-primary mt-4">
            Run scan
          </button>
        </div>
      ) : null}

      {!loading && !error && scanResult && scanResult.agents.length > 0 ? (
        <div className="space-y-8">
          {filteredTotal === 0 ? (
            <div className="card flex flex-col items-center justify-center gap-2 py-12 text-center">
              <AlertTriangle className="w-8 h-8 text-fg-3" strokeWidth={1.5} />
              <h3 className="text-sm font-semibold text-fg">No agents match these filters</h3>
              <p className="max-w-md text-sm text-fg-2">
                Adjust the search query or switch the status filter to widen the result set.
              </p>
            </div>
          ) : (
            <>
              <SectionList
                icon={Monitor}
                title="Global"
                families={groupFamilies(filteredGlobal)}
              />
              <SectionList
                icon={FolderGit2}
                title="Project"
                families={groupFamilies(filteredProject)}
              />
              {filteredUnresolved.length > 0 ? (
                <SectionList
                  icon={AlertTriangle}
                  title="Unresolved"
                  families={groupFamilies(filteredUnresolved)}
                />
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
