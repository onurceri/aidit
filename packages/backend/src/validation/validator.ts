import { parseContent } from '../scanner/formats.js';
import { extractMcp } from '../scanner/mcpExtractor.js';
import type { DialectId } from '../scanner/dialects.js';
import type { ConfigFormat } from '../scanner/types.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const URL_PATTERN = /^https?:\/\/\S+$/i;

/**
 * Validates config text before it is written: it must parse in its format, and every
 * editable MCP server must be runnable (a command for stdio, an http(s) URL otherwise).
 */
export function validateConfig(
  content: string,
  format: ConfigFormat,
  dialect?: DialectId | null,
): ValidationResult {
  const { parsed, error } = parseContent(content, format);
  if (error || !parsed) {
    return { valid: false, errors: [{ field: 'root', message: error ?? 'Invalid content' }] };
  }

  const { servers, dialect: resolved } = extractMcp(parsed, dialect);
  const errors: ValidationError[] = [];
  const collection = resolved ?? 'mcpServers';

  for (const server of servers) {
    if (!server.control.canEdit) continue;
    const field = `${server.control.collectionPath || collection}.${server.name}`;
    if (server.transport === 'stdio' && !server.command?.trim()) {
      errors.push({ field, message: `Server "${server.name}" needs a command` });
    } else if (server.transport === 'sse' || server.transport === 'http') {
      if (!server.url || !URL_PATTERN.test(server.url.trim())) {
        errors.push({
          field: `${field}.url`,
          message: `Server "${server.name}" needs a URL starting with http:// or https://`,
        });
      }
    } else if (server.transport === 'unknown' && !server.command && !server.url) {
      errors.push({ field, message: `Server "${server.name}" must have a command or a URL` });
    }
  }

  return { valid: errors.length === 0, errors };
}
