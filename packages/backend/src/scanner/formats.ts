import { extname, basename } from 'node:path';
import {
  parse as parseJsonc,
  printParseErrorCode,
  modify,
  applyEdits,
  type ParseError,
  type FormattingOptions,
} from 'jsonc-parser';
import { load as parseYaml, dump as dumpYaml } from 'js-yaml';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type { ConfigFormat } from './types.js';

export function detectFormat(filePath: string): ConfigFormat {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.jsonc') return 'jsonc';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.toml') return 'toml';
  // VS Code-family settings files allow comments even with a .json extension.
  if (basename(filePath) === 'settings.json') return 'jsonc';
  return 'json';
}

export interface ParsedContent {
  parsed: Record<string, unknown> | null;
  error: string | null;
}

/** Parses config text. Empty files parse to `{}` so new entries can be added. */
export function parseContent(content: string, format: ConfigFormat): ParsedContent {
  if (content.trim() === '') return { parsed: {}, error: null };

  let value: unknown;
  try {
    if (format === 'yaml') {
      value = parseYaml(content);
    } else if (format === 'toml') {
      value = parseToml(content);
    } else {
      const errors: ParseError[] = [];
      value = parseJsonc(content, errors, { allowTrailingComma: true, allowEmptyContent: true });
      if (errors.length > 0) {
        const details = errors
          .map((e) => `${printParseErrorCode(e.error)} at offset ${e.offset}`)
          .join('; ');
        return { parsed: null, error: `Invalid JSON: ${details}` };
      }
    }
  } catch (err) {
    const label = format === 'yaml' ? 'YAML' : format === 'toml' ? 'TOML' : 'JSON';
    return {
      parsed: null,
      error: `Invalid ${label}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (value === null || value === undefined) return { parsed: {}, error: null };
  if (typeof value !== 'object' || Array.isArray(value)) {
    return { parsed: null, error: 'Config must be an object at the top level' };
  }
  return { parsed: value as Record<string, unknown>, error: null };
}

function detectIndent(text: string): FormattingOptions {
  const match = text.match(/^([ \t]+)\S/m);
  const indent = match?.[1] ?? '  ';
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return indent.startsWith('\t')
    ? { insertSpaces: false, tabSize: 1, eol }
    : { insertSpaces: true, tabSize: indent.length, eol };
}

/**
 * Serializes `next` for a file that previously contained `original`.
 *
 * JSON/JSONC are edited surgically with jsonc-parser so comments, key order and
 * formatting outside the changed collection survive. YAML and TOML are re-emitted.
 */
export function serializeContent(
  original: string,
  next: Record<string, unknown>,
  format: ConfigFormat,
  changedPaths: (string | number)[][] = [],
): string {
  if (format === 'yaml') {
    return dumpYaml(next, { lineWidth: -1, noRefs: true });
  }
  if (format === 'toml') {
    return stringifyToml(next) + '\n';
  }

  if (original.trim() === '' || changedPaths.length === 0) {
    return JSON.stringify(next, null, 2) + '\n';
  }

  const formattingOptions = detectIndent(original);
  let text = original;
  for (const path of changedPaths) {
    let value: unknown = next;
    for (const key of path) {
      value =
        value && typeof value === 'object'
          ? (value as Record<string | number, unknown>)[key]
          : undefined;
    }
    text = applyEdits(text, modify(text, path, value, { formattingOptions }));
  }
  return text;
}
