import {
  canToggle,
  resolveDialect,
  getCollection,
  toMcpServer,
  type DialectId,
  type DialectOptions,
} from './dialects.js';
import type { McpServer } from './types.js';

export interface McpExtraction {
  dialect: DialectId | null;
  canAddServers: boolean;
  canToggleServers: boolean;
  servers: McpServer[];
}

type Raw = Record<string, unknown>;

/**
 * Extracts MCP servers from a parsed config.
 * @param preferred the dialect the owning agent is known to use, if any
 */
export function extractMcp(
  parsed: unknown,
  preferred?: DialectId | null,
  options: DialectOptions = {},
): McpExtraction {
  const root = (
    parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  ) as Raw;
  const resolved = resolveDialect(root, preferred);
  if (!resolved) {
    return { dialect: null, canAddServers: false, canToggleServers: false, servers: [] };
  }

  const collection = getCollection(root, resolved.path);
  const servers: McpServer[] = [];

  if (resolved.dialect.shape === 'array' && Array.isArray(collection)) {
    collection.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const raw = entry as Raw;
      const name = typeof raw.name === 'string' && raw.name ? raw.name : `server-${index + 1}`;
      servers.push(toMcpServer(name, raw, root, resolved, options));
    });
  } else if (collection && typeof collection === 'object' && !Array.isArray(collection)) {
    for (const [name, entry] of Object.entries(collection as Raw)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      servers.push(toMcpServer(name, entry as Raw, root, resolved, options));
    }
  }

  return {
    dialect: resolved.dialect.id,
    canAddServers: true,
    canToggleServers: canToggle(resolved.dialect, options),
    servers,
  };
}

/** Back-compat helper: servers only, with content-based dialect detection. */
export function extractMcpServers(parsed: unknown): McpServer[] {
  return extractMcp(parsed).servers;
}
