import { parseConfigFile, readConfigMeta } from './configParser.js';
import { extractMcp } from './mcpExtractor.js';
import { dialectForFile, type DialectId, type DialectOptions } from './dialects.js';
import { getAgentInfo } from '../registry/agents.js';
import type { ConfigResult } from './types.js';

export interface ConfigTarget {
  pathEntryId: string;
  absolutePath: string;
  scope: 'global' | 'project';
  agent: string | null;
}

/** The dialect aidit expects for a file, from its agent or, failing that, its name. */
export function preferredDialect(
  agent: string | null,
  absolutePath: string,
): { dialect: DialectId | null; options: DialectOptions } {
  const info = getAgentInfo(agent);
  return {
    dialect: dialectForFile(absolutePath) ?? info?.dialect ?? null,
    options: info?.dialectOptions ?? {},
  };
}

/** Reads, parses and extracts MCP servers from one config file. */
export function readConfig(target: ConfigTarget): ConfigResult {
  const { pathEntryId, absolutePath, scope, agent } = target;
  const parseResult = parseConfigFile(absolutePath);
  const meta = readConfigMeta(absolutePath);
  const { dialect, options } = preferredDialect(agent, absolutePath);
  const mcp = parseResult.parsed
    ? extractMcp(parseResult.parsed, dialect, options)
    : { dialect: null, canAddServers: false, canToggleServers: false, servers: [] };

  return {
    pathEntryId,
    absolutePath,
    scope,
    format: parseResult.format,
    raw: parseResult.raw,
    parsed: parseResult.parsed,
    dialect: mcp.dialect,
    canAddServers: mcp.canAddServers,
    canToggleServers: mcp.canToggleServers,
    mcpServers: mcp.servers,
    parseError: parseResult.parseError,
    lastModified: meta.lastModified,
    sizeBytes: meta.sizeBytes,
  };
}
