/**
 * MCP config "dialects".
 *
 * Every agent stores MCP servers a little differently: the collection key
 * (`mcpServers`, `servers`, `mcp`, `mcp_servers`, `context_servers`, `extensions`),
 * whether the collection is a map or an array, the field names for command/url/env,
 * and how (or whether) a server can be disabled. A dialect captures one of those
 * layouts and knows how to decode an entry into a normalized `McpServer` and how to
 * encode a normalized server back into an entry.
 */
import type { McpServer, McpTransport } from './types.js';

export type DialectId =
  | 'mcp-servers'
  | 'vscode'
  | 'opencode'
  | 'crush'
  | 'codex'
  | 'zed'
  | 'amp'
  | 'goose'
  | 'continue'
  | 'vibe';

export type RemoteUrlKey = 'url' | 'serverUrl' | 'httpUrl';

/** Per-agent tweaks for the generic `mcpServers` dialect. */
export interface DialectOptions {
  /** Key used for the URL of a remote server written by aidit. Default `url`. */
  remoteUrlKey?: RemoteUrlKey;
  /** Whether the agent honours a per-entry disable flag. Default false. */
  toggle?: boolean;
}

/** A transport-agnostic server as edited in the UI. */
export interface NormalizedServer {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

type Raw = Record<string, unknown>;

export interface DecodedServer {
  transport: McpTransport;
  command?: string;
  args: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  /** Entries that aidit can't faithfully round-trip (e.g. built-in extensions). */
  editable: boolean;
}

export interface Dialect {
  id: DialectId;
  /** Candidate key paths for the collection; the first one is used when creating it. */
  collections: string[][];
  shape: 'record' | 'array';
  /** Whether entries carry an enable/disable flag aidit can flip. */
  toggle: boolean;
  /** Content-based detection for configs whose agent is unknown. */
  matches?: (collection: unknown) => boolean;
  decode(name: string, raw: Raw, root: Raw): DecodedServer;
  /** Returns the new entry. `existing` is the previous raw entry (for preserving extra keys). */
  encode(server: NormalizedServer, existing: Raw | undefined, options: DialectOptions): Raw;
  /** Mutates `entry` (and possibly `root`) so the server is enabled/disabled. */
  setEnabled?(entry: Raw, enabled: boolean, name: string, root: Raw): void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function strArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function strRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Raw)) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

function nonEmpty<T extends object>(value: T | undefined): T | undefined {
  return value && Object.keys(value).length > 0 ? value : undefined;
}

/** `command` may be a string or an argv array (`["npx", "-y", "pkg"]`). */
function splitCommand(raw: Raw, argsKey = 'args'): { command?: string; args: string[] } {
  const explicitArgs = strArray(raw[argsKey]);
  if (typeof raw.command === 'string') return { command: raw.command, args: explicitArgs };
  const argv = strArray(raw.command);
  if (argv.length > 0) {
    return { command: argv[0], args: explicitArgs.length > 0 ? explicitArgs : argv.slice(1) };
  }
  return { command: undefined, args: explicitArgs };
}

export function normalizeTransport(value: unknown): McpTransport | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.toLowerCase().replace(/[-_]/g, '');
  if (t === 'stdio' || t === 'local') return 'stdio';
  if (t === 'sse') return 'sse';
  if (t === 'http' || t === 'streamablehttp' || t === 'remote') return 'http';
  return undefined;
}

function urlTransport(url: string): McpTransport {
  return /\/sse\/?(\?.*)?$/.test(url) ? 'sse' : 'http';
}

/** Copy `existing`, drop the keys this dialect manages, then apply `managed`. */
function merge(existing: Raw | undefined, managedKeys: string[], managed: Raw): Raw {
  const out: Raw = {};
  if (existing) {
    for (const [k, v] of Object.entries(existing)) {
      if (!managedKeys.includes(k)) out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(managed)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function isRecord(value: unknown): value is Raw {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function everyEntry(collection: unknown, predicate: (entry: Raw) => boolean): boolean {
  if (!isRecord(collection)) return false;
  const entries = Object.values(collection).filter(isRecord);
  return entries.length > 0 && entries.every(predicate);
}

// ── dialects ─────────────────────────────────────────────────────────────────

/**
 * The de-facto standard popularised by Claude Desktop and used by Claude Code,
 * Cursor, Windsurf, Gemini CLI, Copilot CLI, Kiro, Cline, Roo/Kilo Code, Qwen Code,
 * Factory, LM Studio and many others.
 */
const mcpServers: Dialect = {
  id: 'mcp-servers',
  collections: [['mcpServers']],
  shape: 'record',
  toggle: true,
  matches: isRecord,
  decode(name, raw, root) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url) ?? str(raw.serverUrl) ?? str(raw.httpUrl);
    let transport = normalizeTransport(raw.type) ?? normalizeTransport(raw.transport) ?? undefined;
    if (!transport) {
      if (command) transport = 'stdio';
      else if (str(raw.httpUrl)) transport = 'http';
      else if (url) transport = urlTransport(url);
      else transport = 'unknown';
    }
    const disabledList = strArray(root.disabledMcpServers);
    return {
      transport,
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.headers),
      enabled: raw.disabled !== true && raw.enabled !== false && !disabledList.includes(name),
      editable: true,
    };
  },
  encode(server, existing, options) {
    const managedKeys = [
      'command',
      'args',
      'env',
      'url',
      'serverUrl',
      'httpUrl',
      'type',
      'transport',
      'headers',
    ];
    if (server.transport === 'stdio') {
      return merge(existing, managedKeys, {
        // keep an explicit `type: "stdio"` if the entry already had one
        type: existing && 'type' in existing ? 'stdio' : undefined,
        command: server.command,
        args: nonEmpty(server.args),
        env: nonEmpty(server.env),
      });
    }
    // Preserve whichever URL key the entry already used; otherwise use the agent's default.
    const previousKey = (['url', 'serverUrl', 'httpUrl'] as const).find(
      (k) => existing && k in existing,
    );
    let urlKey: RemoteUrlKey = previousKey ?? options.remoteUrlKey ?? 'url';
    if (urlKey === 'httpUrl' && server.transport === 'sse') urlKey = 'url';
    return merge(existing, managedKeys, {
      type: urlKey === 'url' ? server.transport : undefined,
      [urlKey]: server.url,
      headers: nonEmpty(server.headers),
      env: nonEmpty(server.env),
    });
  },
  setEnabled(entry, enabled, name, root) {
    if (enabled) delete entry.disabled;
    else entry.disabled = true;
    if (Array.isArray(root.disabledMcpServers)) {
      const rest = strArray(root.disabledMcpServers).filter((n) => n !== name);
      if (rest.length > 0) root.disabledMcpServers = rest;
      else delete root.disabledMcpServers;
    }
  },
};

/** VS Code / GitHub Copilot: `.vscode/mcp.json` and the user-level `mcp.json`. */
const vscode: Dialect = {
  id: 'vscode',
  collections: [['servers'], ['mcp', 'servers']],
  shape: 'record',
  toggle: false,
  matches: (c) => everyEntry(c, (e) => 'type' in e || 'command' in e || 'url' in e),
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport:
        normalizeTransport(raw.type) ?? (command ? 'stdio' : url ? urlTransport(url) : 'unknown'),
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.headers),
      enabled: true,
      editable: true,
    };
  },
  encode(server, existing) {
    const managedKeys = ['type', 'command', 'args', 'env', 'url', 'headers'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          type: 'stdio',
          command: server.command,
          args: nonEmpty(server.args),
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, {
          type: server.transport,
          url: server.url,
          headers: nonEmpty(server.headers),
        });
  },
};

/** opencode: `mcp: { name: { type: "local", command: [...], environment, enabled } }`. */
const opencode: Dialect = {
  id: 'opencode',
  collections: [['mcp']],
  shape: 'record',
  toggle: true,
  matches: (c) =>
    everyEntry(
      c,
      (e) =>
        e.type === 'local' ||
        e.type === 'remote' ||
        Array.isArray(e.command) ||
        (Object.keys(e).length === 1 && typeof e.enabled === 'boolean'),
    ),
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    const transport: McpTransport =
      raw.type === 'local' || command ? 'stdio' : raw.type === 'remote' || url ? 'http' : 'unknown';
    return {
      transport,
      command,
      args,
      env: strRecord(raw.environment),
      url,
      headers: strRecord(raw.headers),
      enabled: raw.enabled !== false,
      // Entries with only `enabled` toggle opencode's built-in servers.
      editable: transport !== 'unknown',
    };
  },
  encode(server, existing) {
    const managedKeys = ['type', 'command', 'environment', 'url', 'headers', 'enabled'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          type: 'local',
          command: [server.command ?? '', ...(server.args ?? [])],
          environment: nonEmpty(server.env),
          enabled: server.enabled,
        })
      : merge(existing, managedKeys, {
          type: 'remote',
          url: server.url,
          headers: nonEmpty(server.headers),
          enabled: server.enabled,
        });
  },
  setEnabled(entry, enabled) {
    entry.enabled = enabled;
  },
};

/** Crush (Charm): `mcp: { name: { type: "stdio" | "http" | "sse", ... , disabled } }`. */
const crush: Dialect = {
  id: 'crush',
  collections: [['mcp']],
  shape: 'record',
  toggle: true,
  matches: (c) => everyEntry(c, (e) => e.type === 'stdio' || e.type === 'http' || e.type === 'sse'),
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport:
        normalizeTransport(raw.type) ?? (command ? 'stdio' : url ? urlTransport(url) : 'unknown'),
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.headers),
      enabled: raw.disabled !== true,
      editable: true,
    };
  },
  encode(server, existing) {
    const managedKeys = ['type', 'command', 'args', 'env', 'url', 'headers'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          type: 'stdio',
          command: server.command,
          args: nonEmpty(server.args),
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, {
          type: server.transport,
          url: server.url,
          headers: nonEmpty(server.headers),
        });
  },
  setEnabled(entry, enabled) {
    if (enabled) delete entry.disabled;
    else entry.disabled = true;
  },
};

/** OpenAI Codex CLI: `[mcp_servers.<name>]` tables in `~/.codex/config.toml`. */
const codex: Dialect = {
  id: 'codex',
  collections: [['mcp_servers']],
  shape: 'record',
  toggle: true,
  matches: isRecord,
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport: command ? 'stdio' : url ? 'http' : 'unknown',
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.http_headers),
      enabled: raw.enabled !== false,
      editable: true,
    };
  },
  encode(server, existing) {
    const managedKeys = ['command', 'args', 'env', 'url', 'http_headers'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          command: server.command,
          args: nonEmpty(server.args),
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, {
          url: server.url,
          http_headers: nonEmpty(server.headers),
        });
  },
  setEnabled(entry, enabled) {
    if (enabled) delete entry.enabled;
    else entry.enabled = false;
  },
};

/** Zed: `context_servers` in `settings.json` (both the flat and legacy nested command forms). */
const zed: Dialect = {
  id: 'zed',
  collections: [['context_servers']],
  shape: 'record',
  toggle: false,
  matches: isRecord,
  decode(_name, raw) {
    // Legacy: { command: { path, args, env } }
    if (isRecord(raw.command)) {
      const legacy = raw.command;
      return {
        transport: 'stdio',
        command: str(legacy.path),
        args: strArray(legacy.args),
        env: strRecord(legacy.env),
        enabled: raw.enabled !== false,
        editable: true,
      };
    }
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport: command ? 'stdio' : url ? urlTransport(url) : 'unknown',
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.headers),
      enabled: raw.enabled !== false,
      // Extension-provided servers only carry `settings`.
      editable: Boolean(command || url),
    };
  },
  encode(server, existing) {
    const managedKeys = ['command', 'args', 'env', 'url', 'headers'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          command: server.command,
          args: server.args ?? [],
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, { url: server.url, headers: nonEmpty(server.headers) });
  },
};

/** Amp: a flat `"amp.mcpServers"` key in Amp's settings.json. */
const amp: Dialect = {
  ...mcpServers,
  id: 'amp',
  collections: [['amp.mcpServers']],
  toggle: false,
};

/** Goose: `extensions:` in `~/.config/goose/config.yaml`. */
const goose: Dialect = {
  id: 'goose',
  collections: [['extensions']],
  shape: 'record',
  toggle: true,
  matches: (c) => everyEntry(c, (e) => typeof e.type === 'string'),
  decode(_name, raw) {
    const type = typeof raw.type === 'string' ? raw.type : '';
    const transport: McpTransport =
      type === 'stdio'
        ? 'stdio'
        : type === 'sse'
          ? 'sse'
          : type === 'streamable_http'
            ? 'http'
            : 'unknown';
    return {
      transport,
      command: str(raw.cmd),
      args: strArray(raw.args),
      env: strRecord(raw.envs),
      url: str(raw.uri),
      headers: strRecord(raw.headers),
      enabled: raw.enabled !== false,
      // builtin / platform / frontend extensions are part of Goose itself.
      editable: transport !== 'unknown',
    };
  },
  encode(server, existing) {
    const managedKeys = ['name', 'type', 'cmd', 'args', 'envs', 'uri', 'headers', 'enabled'];
    const base = { name: server.name, enabled: server.enabled };
    const withDefaults = existing ?? { timeout: 300 };
    return server.transport === 'stdio'
      ? merge(withDefaults, managedKeys, {
          ...base,
          type: 'stdio',
          cmd: server.command,
          args: server.args ?? [],
          envs: server.env ?? {},
        })
      : merge(withDefaults, managedKeys, {
          ...base,
          type: server.transport === 'sse' ? 'sse' : 'streamable_http',
          uri: server.url,
          headers: nonEmpty(server.headers),
        });
  },
  setEnabled(entry, enabled) {
    entry.enabled = enabled;
  },
};

/** Continue: `mcpServers:` as a YAML list of `{ name, command, args, env }`. */
const continueDev: Dialect = {
  id: 'continue',
  collections: [['mcpServers']],
  shape: 'array',
  toggle: false,
  matches: Array.isArray,
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport:
        normalizeTransport(raw.type) ?? (command ? 'stdio' : url ? urlTransport(url) : 'unknown'),
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.requestOptions && (raw.requestOptions as Raw).headers),
      enabled: true,
      editable: true,
    };
  },
  encode(server, existing) {
    const managedKeys = ['name', 'type', 'command', 'args', 'env', 'url'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          name: server.name,
          command: server.command,
          args: nonEmpty(server.args),
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, {
          name: server.name,
          type: server.transport === 'sse' ? 'sse' : 'streamable-http',
          url: server.url,
        });
  },
};

/** Mistral Vibe: `[[mcp_servers]]` array of tables in `.vibe/config.toml`. */
const vibe: Dialect = {
  id: 'vibe',
  collections: [['mcp_servers']],
  shape: 'array',
  toggle: false,
  matches: Array.isArray,
  decode(_name, raw) {
    const { command, args } = splitCommand(raw);
    const url = str(raw.url);
    return {
      transport:
        normalizeTransport(raw.transport) ?? (command ? 'stdio' : url ? 'http' : 'unknown'),
      command,
      args,
      env: strRecord(raw.env),
      url,
      headers: strRecord(raw.headers),
      enabled: true,
      editable: true,
    };
  },
  encode(server, existing) {
    const managedKeys = ['name', 'transport', 'command', 'args', 'env', 'url', 'headers'];
    return server.transport === 'stdio'
      ? merge(existing, managedKeys, {
          name: server.name,
          transport: 'stdio',
          command: server.command,
          args: nonEmpty(server.args),
          env: nonEmpty(server.env),
        })
      : merge(existing, managedKeys, {
          name: server.name,
          transport: 'http',
          url: server.url,
          headers: nonEmpty(server.headers),
        });
  },
};

export const DIALECTS: Record<DialectId, Dialect> = {
  'mcp-servers': mcpServers,
  vscode,
  opencode,
  crush,
  codex,
  zed,
  amp,
  goose,
  continue: continueDev,
  vibe,
};

/** Detection order for configs that don't come with an agent hint. */
const DETECTION_ORDER: Dialect[] = [
  continueDev,
  vibe,
  mcpServers,
  codex,
  amp,
  zed,
  opencode,
  crush,
  goose,
  vscode,
];

export function getCollection(root: Raw, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return current;
}

export interface ResolvedDialect {
  dialect: Dialect;
  /** The key path of the collection that exists (or will be created). */
  path: string[];
  /** Whether the collection already exists in the file. */
  present: boolean;
}

function findPresent(root: Raw, dialect: Dialect): string[] | undefined {
  return dialect.collections.find((path) => {
    const value = getCollection(root, path);
    return dialect.shape === 'array' ? Array.isArray(value) : isRecord(value);
  });
}

/**
 * Picks the dialect for a parsed config. The agent's preferred dialect wins when its
 * collection exists or the file has no recognisable collection yet; otherwise we
 * fall back to content-based detection so custom paths work too.
 */
export function resolveDialect(
  root: unknown,
  preferred?: DialectId | null,
): ResolvedDialect | null {
  const obj = isRecord(root) ? root : {};

  if (preferred) {
    const dialect = DIALECTS[preferred];
    const path = findPresent(obj, dialect);
    if (path) return { dialect, path, present: true };
    // `mcpServers` written as a list means Continue, even if the agent says otherwise.
    if (preferred === 'mcp-servers' && Array.isArray(obj.mcpServers)) {
      return { dialect: continueDev, path: ['mcpServers'], present: true };
    }
    if (preferred === 'codex' && Array.isArray(obj.mcp_servers)) {
      return { dialect: vibe, path: ['mcp_servers'], present: true };
    }
  }

  for (const dialect of DETECTION_ORDER) {
    const path = findPresent(obj, dialect);
    if (!path) continue;
    const collection = getCollection(obj, path);
    if (dialect.matches && !dialect.matches(collection)) continue;
    return { dialect, path, present: true };
  }

  if (preferred) {
    const dialect = DIALECTS[preferred];
    return { dialect, path: dialect.collections[0], present: false };
  }
  return null;
}

export function dialectForFile(absolutePath: string): DialectId | null {
  const lower = absolutePath.toLowerCase();
  if (/(^|\/)\.?(opencode|kilo)\.jsonc?$/.test(lower)) return 'opencode';
  if (lower.endsWith('/.vibe/config.toml')) return 'vibe';
  if (/(^|\/)\.?crush\.json$/.test(lower)) return 'crush';
  if (lower.endsWith('.toml')) return 'codex';
  if (lower.endsWith('/.vscode/mcp.json')) return 'vscode';
  return null;
}

/** The generic `mcpServers` layout only gets a toggle for agents known to honour `disabled`. */
export function canToggle(dialect: Dialect, options: DialectOptions): boolean {
  if (!dialect.toggle) return false;
  return dialect.id === 'mcp-servers' ? options.toggle === true : true;
}

export function toMcpServer(
  name: string,
  raw: Raw,
  root: Raw,
  resolved: ResolvedDialect,
  options: DialectOptions,
): McpServer {
  const { dialect, path } = resolved;
  const decoded = dialect.decode(name, raw, root);
  return {
    name,
    transport: decoded.transport,
    command: decoded.command,
    args: decoded.args,
    env: decoded.env,
    url: decoded.url,
    headers: decoded.headers,
    enabled: decoded.enabled,
    control: {
      dialect: dialect.id,
      collectionPath: path.join('.'),
      canToggle: canToggle(dialect, options),
      canEdit: decoded.editable,
      canDelete: true,
    },
    raw,
  };
}
