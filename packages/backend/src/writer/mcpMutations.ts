import {
  canToggle,
  getCollection,
  resolveDialect,
  type DialectId,
  type DialectOptions,
  type NormalizedServer,
} from '../scanner/dialects.js';
import { parseContent, serializeContent } from '../scanner/formats.js';
import type { ConfigFormat } from '../scanner/types.js';
import { SafeWriteError } from './errors.js';

export type ServerOperation =
  | { op: 'upsert'; server: NormalizedServer; originalName?: string }
  | { op: 'delete'; name: string }
  | { op: 'toggle'; name: string; enabled: boolean };

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Ensures the collection at `path` exists and returns it. */
function ensureCollection(root: Raw, path: string[], shape: 'record' | 'array'): Raw | unknown[] {
  let current: Raw = root;
  path.forEach((key, i) => {
    const last = i === path.length - 1;
    const existing = current[key];
    if (last) {
      if (shape === 'array' ? !Array.isArray(existing) : !isRecord(existing)) {
        current[key] = shape === 'array' ? [] : {};
      }
    } else {
      if (!isRecord(existing)) current[key] = {};
      current = current[key] as Raw;
    }
  });
  return current[path[path.length - 1]] as Raw | unknown[];
}

function findIndex(list: unknown[], name: string): number {
  return list.findIndex((e) => isRecord(e) && e.name === name);
}

/**
 * Applies a structured MCP server change to config text and returns the new text.
 * JSON/JSONC edits touch only the affected entries, so comments elsewhere survive.
 */
export function applyServerOperation(
  content: string,
  format: ConfigFormat,
  preferred: DialectId | null,
  options: DialectOptions,
  operation: ServerOperation,
): string {
  const { parsed, error } = parseContent(content, format);
  if (!parsed) throw new SafeWriteError(error ?? 'Config could not be parsed', 400);

  const resolved = resolveDialect(parsed, preferred);
  if (!resolved) {
    throw new SafeWriteError('aidit does not know how this file stores MCP servers', 400);
  }
  const { dialect, path } = resolved;
  const collection = ensureCollection(parsed, path, dialect.shape);
  const changed: (string | number)[][] = [];
  const toggleable = canToggle(dialect, options);
  const hadDisabledList = 'disabledMcpServers' in parsed;

  const entryPath = (key: string | number): (string | number)[] => [...path, key];
  const getEntry = (name: string): { raw: Raw; key: string | number } | null => {
    if (Array.isArray(collection)) {
      const index = findIndex(collection, name);
      return index >= 0 ? { raw: collection[index] as Raw, key: index } : null;
    }
    const raw = collection[name];
    return isRecord(raw) ? { raw, key: name } : null;
  };

  switch (operation.op) {
    case 'upsert': {
      const { server } = operation;
      const name = server.name.trim();
      if (!name) throw new SafeWriteError('Server name is required', 400);
      const originalName = operation.originalName ?? name;
      const previous = getEntry(originalName);
      if (originalName !== name && getEntry(name)) {
        throw new SafeWriteError(`A server named "${name}" already exists`, 409);
      }

      const encoded = dialect.encode({ ...server, name }, previous?.raw, options);
      if (dialect.setEnabled && toggleable) {
        dialect.setEnabled(encoded, server.enabled, name, parsed);
      }

      if (Array.isArray(collection)) {
        if (previous) {
          collection[previous.key as number] = encoded;
          changed.push(entryPath(previous.key));
        } else {
          collection.push(encoded);
          // Whole list: jsonc-parser can't insert at the end by index reliably.
          changed.push(path);
        }
      } else {
        if (previous && originalName !== name) {
          delete collection[originalName];
          changed.push(entryPath(originalName));
        }
        collection[name] = encoded;
        changed.push(entryPath(name));
      }
      if (hadDisabledList) changed.push(['disabledMcpServers']);
      break;
    }
    case 'delete': {
      const entry = getEntry(operation.name);
      if (!entry) throw new SafeWriteError(`Server "${operation.name}" not found`, 404);
      if (Array.isArray(collection)) {
        collection.splice(entry.key as number, 1);
        changed.push(path);
      } else {
        delete collection[operation.name];
        changed.push(entryPath(operation.name));
      }
      if (Array.isArray(parsed.disabledMcpServers)) {
        parsed.disabledMcpServers = parsed.disabledMcpServers.filter((n) => n !== operation.name);
        changed.push(['disabledMcpServers']);
      }
      break;
    }
    case 'toggle': {
      const entry = getEntry(operation.name);
      if (!entry) throw new SafeWriteError(`Server "${operation.name}" not found`, 404);
      if (!dialect.setEnabled || !toggleable) {
        throw new SafeWriteError(`This agent's config has no enable/disable flag`, 400);
      }
      dialect.setEnabled(entry.raw, operation.enabled, operation.name, parsed);
      changed.push(entryPath(entry.key));
      if (hadDisabledList) changed.push(['disabledMcpServers']);
      break;
    }
  }

  // Drop an empty disabled list we just emptied out.
  if (Array.isArray(parsed.disabledMcpServers) && parsed.disabledMcpServers.length === 0) {
    delete parsed.disabledMcpServers;
  }

  // Sanity check that the collection still resolves after the change.
  if (getCollection(parsed, path) === undefined) {
    throw new SafeWriteError('Internal error: collection disappeared during edit', 500);
  }

  return serializeContent(content, parsed, format, changed);
}
