import {
  getAllEntries,
  getEntryById,
  insertEntry,
  upsertEntry,
  replaceAll,
  type PathRegistryRow,
  type PathRegistryInput,
} from '../db/pathRegistry.js';
import { BUILTIN_PATHS } from './builtins.js';
import { resolvePath } from '../scanner/pathResolver.js';

export interface PathEntry {
  id: string;
  label: string;
  path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent: string | null;
  scope: 'global' | 'project';
  source: 'builtin' | 'user';
  enabled: boolean;
}

export interface PathRegistry {
  version: number;
  entries: PathEntry[];
}

export interface ResolvedPathEntry extends PathEntry {
  resolvedPath: string;
}

const REGISTRY_VERSION = 1;

const BUILTIN_PATH_MIGRATIONS = [
  {
    id: 'claude-code-global-commands',
    from: '~/.claude/commands',
    to: '~/.claude/skills',
  },
  {
    id: 'claude-code-project-commands',
    from: '.claude/commands',
    to: '.claude/skills',
  },
] as const;

function rowToEntry(row: PathRegistryRow): PathEntry {
  return {
    id: row.id,
    label: row.label,
    path: row.path,
    type: row.type,
    agent: row.agent,
    scope: row.scope,
    source: row.source,
    enabled: row.enabled === 1,
  };
}

export function initializeRegistry(): void {
  const existing = getAllEntries();
  if (existing.length > 0) {
    for (const migration of BUILTIN_PATH_MIGRATIONS) {
      const entry = getEntryById(migration.id);
      if (!entry || entry.source !== 'builtin' || entry.path !== migration.from) {
        continue;
      }

      upsertEntry({
        id: entry.id,
        label: entry.label,
        path: migration.to,
        type: entry.type,
        agent: entry.agent,
        scope: entry.scope,
        source: 'builtin',
        enabled: entry.enabled === 1,
        sort_order: entry.sort_order,
      });
    }

    return;
  }

  for (const entry of BUILTIN_PATHS) {
    insertEntry(entry);
  }
}

export function loadRegistry(): PathRegistry {
  const rows = getAllEntries();
  return {
    version: REGISTRY_VERSION,
    entries: rows.map(rowToEntry),
  };
}

export function saveRegistry(entries: PathEntry[]): void {
  const inputs: PathRegistryInput[] = entries.map((e) => ({
    id: e.id,
    label: e.label,
    path: e.path,
    type: e.type,
    agent: e.agent,
    scope: e.scope,
    source: e.source,
    enabled: e.enabled,
    sort_order: 0,
  }));
  replaceAll(inputs);
}

export function getEnabledPaths(cwd?: string): ResolvedPathEntry[] {
  const registry = loadRegistry();
  return registry.entries
    .filter((e) => e.enabled)
    .map((e) => ({
      ...e,
      resolvedPath: resolvePath(e.path, cwd),
    }));
}
