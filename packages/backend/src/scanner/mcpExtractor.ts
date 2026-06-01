import type { McpServer } from './types.js';

interface McpServerRaw {
  command?: unknown;
  args?: unknown;
  env?: unknown;
  url?: unknown;
  transport?: unknown;
  enabled?: unknown;
  disabled?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

interface ParsedConfig {
  mcpServers?: Record<string, McpServerRaw>;
  disabledMcpServers?: string[];
  [key: string]: unknown;
}

interface McpCollectionSource {
  keyPath: string;
  canEdit: boolean;
  canDelete: boolean;
  getEnableMode: (server: McpServerRaw) => McpServer['control']['enableMode'];
  canToggle: (
    server: McpServerRaw,
    enableMode: McpServer['control']['enableMode'],
  ) => boolean;
}

const MCP_COLLECTION_SOURCES: McpCollectionSource[] = [
  {
    keyPath: 'mcpServers',
    canEdit: true,
    canDelete: true,
    getEnableMode: () => 'disabled-array-or-entry-disabled',
    canToggle: () => true,
  },
  {
    keyPath: 'github.copilot.chat.mcpServers',
    canEdit: false,
    canDelete: false,
    getEnableMode: () => 'disabled-array-or-entry-disabled',
    canToggle: () => false,
  },
  {
    keyPath: 'experimental.modelContextProtocolServers',
    canEdit: false,
    canDelete: false,
    getEnableMode: () => 'disabled-array-or-entry-disabled',
    canToggle: () => false,
  },
  {
    keyPath: 'mcp',
    canEdit: false,
    canDelete: false,
    getEnableMode: (server) =>
      typeof server.enabled === 'boolean' ? 'entry-enabled' : 'none',
    canToggle: (_server, enableMode) => enableMode === 'entry-enabled',
  },
  {
    keyPath: 'servers',
    canEdit: false,
    canDelete: false,
    getEnableMode: () => 'disabled-array-or-entry-disabled',
    canToggle: () => false,
  },
];

function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function deriveTransport(server: McpServerRaw): McpServer['transport'] {
  if (server.transport && typeof server.transport === 'string') {
    const t = server.transport.toLowerCase();
    if (t === 'stdio' || t === 'sse' || t === 'http') return t;
  }
  if (hasCommand(server)) {
    if (server.url && typeof server.url === 'string') {
      return 'unknown';
    }
    return 'stdio';
  }
  if (server.type && typeof server.type === 'string' && server.type.toLowerCase() === 'local') {
    return 'stdio';
  }
  if (server.url && typeof server.url === 'string') {
    const url = server.url;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return 'http';
    }
    if (url.startsWith('ws://') || url.startsWith('wss://')) {
      return 'sse';
    }
    return 'sse';
  }
  return 'unknown';
}

function hasCommand(server: McpServerRaw): boolean {
  if (typeof server.command === 'string') return true;
  return (
    Array.isArray(server.command) &&
    server.command.length > 0 &&
    server.command.every((value) => typeof value === 'string')
  );
}

function extractCommand(server: McpServerRaw): string | undefined {
  if (typeof server.command === 'string') {
    return server.command;
  }

  if (
    Array.isArray(server.command) &&
    server.command.length > 0 &&
    server.command.every((value) => typeof value === 'string')
  ) {
    return server.command[0] as string;
  }

  return undefined;
}

function extractArgs(server: McpServerRaw): string[] {
  const explicitArgs = safeStringArray(server.args);
  if (explicitArgs.length > 0) {
    return explicitArgs;
  }

  if (
    Array.isArray(server.command) &&
    server.command.length > 1 &&
    server.command.every((value) => typeof value === 'string')
  ) {
    return server.command.slice(1) as string[];
  }

  return [];
}

function deriveEnabled(
  name: string,
  server: McpServerRaw,
  disabledSet: Set<string>,
  enableMode: McpServer['control']['enableMode'],
): boolean {
  if (enableMode === 'entry-enabled') {
    return server.enabled !== false;
  }

  return !disabledSet.has(name) && server.disabled !== true;
}

function safeStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === 'string');
  }
  return [];
}

function safeStringRecord(val: unknown): Record<string, string> {
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (typeof v === 'string') {
        out[k] = v;
      }
    }
    return out;
  }
  return {};
}

export function extractMcpServers(parsed: unknown): McpServer[] {
  if (!parsed || typeof parsed !== 'object') return [];

  const config = parsed as ParsedConfig;
  const disabledSet = new Set(
    Array.isArray(config.disabledMcpServers)
      ? config.disabledMcpServers.filter((v): v is string => typeof v === 'string')
      : [],
  );

  for (const source of MCP_COLLECTION_SOURCES) {
    const serversObj = getNestedValue(config, source.keyPath);
    if (serversObj && typeof serversObj === 'object' && !Array.isArray(serversObj)) {
      return Object.entries(serversObj as Record<string, unknown>)
        .filter(([, v]) => v && typeof v === 'object')
        .map(([name, raw]) => {
          const server = raw as McpServerRaw;
          const enableMode = source.getEnableMode(server);
          return {
            name,
            transport: deriveTransport(server),
            command: extractCommand(server),
            args: extractArgs(server),
            env:
              server.env && typeof server.env === 'object'
                ? safeStringRecord(server.env)
                : undefined,
            url: typeof server.url === 'string' ? server.url : undefined,
            enabled: deriveEnabled(name, server, disabledSet, enableMode),
            control: {
              collectionPath: source.keyPath,
              enableMode,
              canToggle: source.canToggle(server, enableMode),
              canEdit: source.canEdit,
              canDelete: source.canDelete,
            },
            raw: server,
          };
        });
    }
  }

  return [];
}
