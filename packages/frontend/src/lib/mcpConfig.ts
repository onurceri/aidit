import type { McpServer } from '../api/client';

type JsonRecord = Record<string, unknown>;

const NONSTANDARD_COLLECTION_PATHS = [
  'github.copilot.chat.mcpServers',
  'experimental.modelContextProtocolServers',
  'mcp',
  'servers',
];

function cloneConfig(config: JsonRecord): JsonRecord {
  return JSON.parse(JSON.stringify(config)) as JsonRecord;
}

function getNestedValue(obj: JsonRecord, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined;
    }
    current = (current as JsonRecord)[part];
  }

  return current;
}

function ensureNestedRecord(obj: JsonRecord, path: string): JsonRecord {
  const parts = path.split('.');
  let current: JsonRecord = obj;

  for (const part of parts) {
    const next = current[part];
    if (!next || typeof next !== 'object' || Array.isArray(next)) {
      current[part] = {};
    }
    current = current[part] as JsonRecord;
  }

  return current;
}

function getCollectionRecord(
  config: JsonRecord,
  collectionPath: string,
  options?: { createIfMissing?: boolean },
): JsonRecord | null {
  if (options?.createIfMissing) {
    return ensureNestedRecord(config, collectionPath);
  }

  const value = getNestedValue(config, collectionPath);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  return value as JsonRecord;
}

function getServerEntry(
  config: JsonRecord,
  server: McpServer,
  options?: { createCollectionIfMissing?: boolean },
): JsonRecord {
  const collection = getCollectionRecord(config, server.control.collectionPath, {
    createIfMissing: options?.createCollectionIfMissing,
  });

  if (!collection) {
    throw new Error(`Config does not expose ${server.control.collectionPath} entries`);
  }

  const entry = collection[server.name];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Server "${server.name}" is not present under ${server.control.collectionPath}`);
  }

  return entry as JsonRecord;
}

function updateDisabledNames(config: JsonRecord, serverName: string, enabled: boolean): void {
  const disabledNames = Array.isArray(config.disabledMcpServers)
    ? (config.disabledMcpServers as string[]).filter((name) => typeof name === 'string')
    : [];

  const nextDisabled = enabled
    ? disabledNames.filter((name) => name !== serverName)
    : disabledNames.includes(serverName)
      ? disabledNames
      : [...disabledNames, serverName];

  if (nextDisabled.length > 0) {
    config.disabledMcpServers = nextDisabled;
  } else {
    delete config.disabledMcpServers;
  }
}

function canCreateCollection(collectionPath: string): boolean {
  return collectionPath === 'mcpServers';
}

function canRepresentInStandardCollection(server: McpServer): boolean {
  return Boolean(server.command?.trim() || server.url?.trim());
}

function toStandardServerConfig(server: McpServer): JsonRecord {
  const config: JsonRecord = {};

  if (server.command?.trim()) {
    config.command = server.command;
    if (server.args && server.args.length > 0) {
      config.args = [...server.args];
    }
  } else if (server.url?.trim()) {
    config.url = server.url;
    if (server.transport === 'sse' || server.transport === 'http') {
      config.transport = server.transport;
    }
  } else {
    throw new Error(`Server "${server.name}" cannot be represented as a standard MCP entry`);
  }

  if (server.env && Object.keys(server.env).length > 0) {
    config.env = { ...server.env };
  }

  return config;
}

function resolveCopyCollectionPath(targetConfig: JsonRecord, server: McpServer): string {
  if (getCollectionRecord(targetConfig, server.control.collectionPath)) {
    return server.control.collectionPath;
  }

  if (supportsStandardServerEditing(targetConfig) && canRepresentInStandardCollection(server)) {
    return 'mcpServers';
  }

  throw new Error(`Target config does not support ${server.control.collectionPath} entries`);
}

export function canInsertServerIntoConfig(parsedConfig: JsonRecord, server: McpServer): boolean {
  try {
    resolveCopyCollectionPath(parsedConfig, server);
    return true;
  } catch {
    return false;
  }
}

export function supportsStandardServerEditing(config: JsonRecord): boolean {
  if (getCollectionRecord(config, 'mcpServers')) {
    return true;
  }

  return !NONSTANDARD_COLLECTION_PATHS.some((path) => !!getCollectionRecord(config, path));
}

export function applyServerEnabledChange(
  parsedConfig: JsonRecord,
  server: McpServer,
  enabled: boolean,
): JsonRecord {
  if (!server.control.canToggle) {
    throw new Error(`Server "${server.name}" cannot be toggled from the structured editor`);
  }

  const nextConfig = cloneConfig(parsedConfig);

  switch (server.control.enableMode) {
    case 'disabled-array-or-entry-disabled': {
      const entry = getServerEntry(nextConfig, server, {
        createCollectionIfMissing: canCreateCollection(server.control.collectionPath),
      });

      if (enabled) {
        delete entry.disabled;
      } else {
        entry.disabled = true;
      }

      updateDisabledNames(nextConfig, server.name, enabled);
      return nextConfig;
    }
    case 'entry-enabled': {
      const entry = getServerEntry(nextConfig, server);
      entry.enabled = enabled;
      return nextConfig;
    }
    default:
      throw new Error(`Server "${server.name}" does not expose a writable enabled flag`);
  }
}

export function removeServerFromConfig(parsedConfig: JsonRecord, server: McpServer): JsonRecord {
  if (!server.control.canDelete) {
    throw new Error(`Server "${server.name}" cannot be deleted from the structured editor`);
  }

  const nextConfig = cloneConfig(parsedConfig);
  const collection = getCollectionRecord(nextConfig, server.control.collectionPath, {
    createIfMissing: canCreateCollection(server.control.collectionPath),
  });

  if (!collection) {
    throw new Error(`Config does not expose ${server.control.collectionPath} entries`);
  }

  delete collection[server.name];
  updateDisabledNames(nextConfig, server.name, true);
  return nextConfig;
}

export function insertServerIntoConfig(parsedConfig: JsonRecord, server: McpServer): JsonRecord {
  const nextConfig = cloneConfig(parsedConfig);
  const collectionPath = resolveCopyCollectionPath(nextConfig, server);
  const collection = getCollectionRecord(nextConfig, collectionPath, {
    createIfMissing: canCreateCollection(collectionPath),
  });

  if (!collection) {
    throw new Error(`Config does not expose ${collectionPath} entries`);
  }

  collection[server.name] =
    collectionPath === 'mcpServers'
      ? toStandardServerConfig(server)
      : (JSON.parse(JSON.stringify(server.raw)) as JsonRecord);

  if (collectionPath === 'mcpServers') {
    updateDisabledNames(nextConfig, server.name, server.enabled);
    const inserted = collection[server.name] as JsonRecord;
    if (server.enabled) {
      delete inserted.disabled;
    } else {
      inserted.disabled = true;
    }
  } else if (collectionPath === 'mcp') {
    (collection[server.name] as JsonRecord).enabled = server.enabled;
  }

  return nextConfig;
}