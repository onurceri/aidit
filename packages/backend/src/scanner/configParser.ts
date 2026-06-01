import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';
import { load as parseYaml } from 'js-yaml';

export interface ParseResult {
  raw: string;
  parsed: object | null;
  parseError: string | null;
  format: 'json' | 'jsonc' | 'yaml';
}

export function parseConfigFile(absolutePath: string): ParseResult {
  const ext = extname(absolutePath).toLowerCase();

  let format: ParseResult['format'];
  if (ext === '.jsonc') {
    format = 'jsonc';
  } else if (ext === '.yaml' || ext === '.yml') {
    format = 'yaml';
  } else {
    format = 'json';
  }

  let raw: string;
  try {
    raw = readFileSync(absolutePath, 'utf-8');
  } catch (err) {
    return {
      raw: '',
      parsed: null,
      parseError: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
      format,
    };
  }

  let parsed: object | null = null;
  let parseError: string | null = null;

  if (format === 'yaml') {
    try {
      parsed = parseYaml(raw) as object;
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  } else {
    const errors: ParseError[] = [];
    parsed = parseJsonc(raw, errors, {
      allowTrailingComma: true,
      allowEmptyContent: true,
    }) as object | null;

    if (errors.length > 0) {
      parseError = errors.map((e) => printParseErrorCode(e.error)).join('; ');
    }

    if (parsed === null && !parseError) {
      parseError = 'File is empty or contains only comments';
    }
  }

  return { raw, parsed, parseError, format };
}

export function readConfigMeta(absolutePath: string): {
  lastModified: string;
  sizeBytes: number;
} {
  if (!existsSync(absolutePath)) {
    return { lastModified: new Date(0).toISOString(), sizeBytes: 0 };
  }
  const stat = statSync(absolutePath);
  return {
    lastModified: stat.mtime.toISOString(),
    sizeBytes: stat.size,
  };
}
