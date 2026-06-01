import { useNavigate } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import type { AgentResult, ConfigResult } from '../api/client';
import { getAgentIcon } from '../lib/icons';
import { relativeTime } from '../lib/time';

interface AgentCardProps {
  agent: AgentResult;
  compact?: boolean;
}

function countMcpServers(configs: ConfigResult[]) {
  let enabled = 0;
  let disabled = 0;
  for (const config of configs) {
    for (const server of config.mcpServers) {
      if (server.enabled) enabled++;
      else disabled++;
    }
  }
  return { enabled, disabled };
}

function countSkills(agent: AgentResult) {
  const dirs = agent.skillsDirs.length;
  let files = 0;
  for (const dir of agent.skillsDirs) {
    files += dir.skills.length;
  }
  return { dirs, files };
}

function formatServerCount(enabled: number, disabled: number): string {
  const total = enabled + disabled;
  if (total === 0) return 'No MCP servers';
  const parts: string[] = [];
  if (enabled > 0) parts.push(`${enabled} enabled`);
  if (disabled > 0) parts.push(`${disabled} disabled`);
  return `${total} server${total > 1 ? 's' : ''} (${parts.join(', ')})`;
}

function getLatestModified(configs: ConfigResult[]): string | null {
  let latest: string | null = null;
  for (const config of configs) {
    if (!latest || config.lastModified > latest) {
      latest = config.lastModified;
    }
  }
  return latest;
}

function getPrimaryPath(configs: ConfigResult[]): string | null {
  const global = configs.find((c) => c.scope === 'global');
  return global?.absolutePath ?? configs[0]?.absolutePath ?? null;
}

function getPrimaryConfig(configs: ConfigResult[]): ConfigResult | null {
  return configs.find((c) => c.scope === 'global') ?? configs[0] ?? null;
}

function formatPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/, '~');
}

export function AgentCard({ agent }: AgentCardProps) {
  const navigate = useNavigate();
  const Icon = getAgentIcon(agent.id);
  const mcp = countMcpServers(agent.configs);
  const skills = countSkills(agent);
  const lastModified = getLatestModified(agent.configs);
  const primaryPath = getPrimaryPath(agent.configs);
  const primaryConfig = getPrimaryConfig(agent.configs);

  const handleClick = () => navigate(`/mcp/${agent.id}`);

  const totalServers = mcp.enabled + mcp.disabled;
  const ratio = totalServers > 0 ? (mcp.enabled / totalServers) * 100 : 0;
  const hasParseError = agent.configs.some((config) => config.parseError);
  const primaryScope = primaryConfig?.scope === 'project' ? 'Project scope' : 'Global scope';

  const statusCopy = hasParseError
    ? 'Config needs review before server changes.'
    : totalServers > 0
      ? formatServerCount(mcp.enabled, mcp.disabled)
      : 'No MCP servers configured yet.';

  if (!agent.found) {
    return (
      <div className="card p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-3">
            <Icon className="w-5 h-5" strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">{agent.label}</h3>
              <span className="badge-outline">Not detected</span>
            </div>
            <p className="text-sm text-fg-2">No configuration or skills path matched during the last scan.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
      role="button"
      tabIndex={0}
      className="card card-hover p-4 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-fg">
          <Icon className="h-5 w-5" strokeWidth={1.5} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-fg">{agent.label}</h3>
            {hasParseError ? (
              <span className="badge">Parse error</span>
            ) : totalServers === 0 ? (
              <span className="badge">Setup needed</span>
            ) : (
              <span className="badge">{mcp.enabled}/{totalServers} enabled</span>
            )}
          </div>
          <p className="mt-1 text-sm text-fg-2">{statusCopy}</p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-fg-2">
            <span>{skills.files} skill{skills.files === 1 ? '' : 's'}</span>
            <span className="text-fg-3">·</span>
            <span>{primaryScope}</span>
            {lastModified ? (
              <>
                <span className="text-fg-3">·</span>
                <span>Updated {relativeTime(lastModified)}</span>
              </>
            ) : null}
          </div>
          {primaryPath ? (
            <div
              className="mt-2 truncate text-xs font-mono text-fg-2"
              title={primaryPath}
            >
              {formatPath(primaryPath)}
            </div>
          ) : null}
        </div>
        <div className="flex-shrink-0 self-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleClick();
            }}
            className="btn-ghost"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Open
          </button>
        </div>
      </div>
      {totalServers > 0 ? (
        <div className="mt-3 h-1 w-full bg-surface-3 rounded-full overflow-hidden">
          <div
            className="h-full bg-fg transition-all"
            style={{ width: `${ratio}%` }}
            aria-hidden
          />
        </div>
      ) : null}
    </div>
  );
}

export function AgentCardSkeleton() {
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-md bg-surface-3 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-40 bg-surface-3 rounded animate-pulse" />
          <div className="h-2 w-56 bg-surface-3 rounded animate-pulse" />
          <div className="h-2 w-32 bg-surface-3 rounded animate-pulse" />
        </div>
      </div>
    </div>
  );
}
