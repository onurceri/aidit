import {
  getAllEntries,
  getEntryById,
  upsertEntry,
  deleteEntry,
  replaceAll,
  type PathRegistryRow,
  type PathRegistryInput,
} from '../db/pathRegistry.js';
import { BUILTIN_PATHS } from './builtins.js';
import { transaction } from '../db/db.js';
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

/**
 * Brings built-in entries in line with the current release: new built-ins are added,
 * changed ones are updated (keeping the user's enabled flag) and retired ones removed.
 * User-defined entries are never touched.
 */
export function initializeRegistry(): void {
  const builtinIds = new Set(BUILTIN_PATHS.map((entry) => entry.id));
  transaction(() => {
    for (const row of getAllEntries()) {
      if (row.source === 'builtin' && !builtinIds.has(row.id)) deleteEntry(row.id);
    }
    for (const builtin of BUILTIN_PATHS) {
      const existing = getEntryById(builtin.id);
      if (existing && existing.source !== 'builtin') continue;
      upsertEntry({ ...builtin, enabled: existing ? existing.enabled === 1 : builtin.enabled });
    }
  });
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
