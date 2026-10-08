import { readFileSync, existsSync, statSync } from 'node:fs';
import { detectFormat, parseContent } from './formats.js';
import type { ConfigFormat } from './types.js';

export interface ParseResult {
  raw: string;
  parsed: object | null;
  parseError: string | null;
  format: ConfigFormat;
}

export function parseConfigFile(absolutePath: string): ParseResult {
  const format = detectFormat(absolutePath);

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

  const { parsed, error } = parseContent(raw, format);
  return { raw, parsed, parseError: error, format };
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
