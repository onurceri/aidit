import Ajv from 'ajv';
import { parse as parseJsonc, printParseErrorCode } from 'jsonc-parser';
import type { ParseError } from 'jsonc-parser';
import { load as parseYaml } from 'js-yaml';
import { configSchema } from './schemas.js';
import type { AgentConfig, McpServerConfig } from './schemas.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(configSchema);

function parseContent(
  content: string,
  format: 'json' | 'jsonc' | 'yaml',
): { parsed: AgentConfig | null; error: string | null } {
  if (format === 'yaml') {
    try {
      const parsed = parseYaml(content);
      if (parsed === undefined || parsed === null) {
        return { parsed: null, error: 'Content is empty' };
      }
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { parsed: null, error: 'Content must be a JSON object' };
      }
      return { parsed: parsed as AgentConfig, error: null };
    } catch (err) {
      return {
        parsed: null,
        error: `Invalid YAML: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const errors: ParseError[] = [];
  const parsed = parseJsonc(content, errors, {
    allowTrailingComma: true,
    allowEmptyContent: true,
  });

  if (errors.length > 0) {
    const messages = errors.map((e) => printParseErrorCode(e.error));
    return { parsed: null, error: `Invalid JSON: ${messages.join('; ')}` };
  }

  if (parsed === null || parsed === undefined) {
    return { parsed: null, error: 'Content is empty or contains only comments' };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { parsed: null, error: 'Content must be a JSON object' };
  }

  return { parsed: parsed as AgentConfig, error: null };
}

function deriveFieldPath(path: string): string {
  if (!path) return 'root';
  const cleaned = path.replace(/^\//, '');
  return cleaned || 'root';
}

const URL_PATTERN = /^https?:\/\/.+/i;

function validateServerEntries(mcpServers: Record<string, McpServerConfig>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [name, server] of Object.entries(mcpServers)) {
    if (!server || typeof server !== 'object') {
      errors.push({
        field: `mcpServers.${name}`,
        message: `Server "${name}" must be an object`,
      });
      continue;
    }

    const hasCommand = typeof server.command === 'string' && server.command.trim().length > 0;
    const hasUrl = typeof server.url === 'string' && server.url.trim().length > 0;

    if (!hasCommand && !hasUrl) {
      errors.push({
        field: `mcpServers.${name}`,
        message: `Server "${name}" must have either "command" or "url"`,
      });
      continue;
    }

    if (hasUrl) {
      const url = server.url!.trim();
      if (!URL_PATTERN.test(url)) {
        errors.push({
          field: `mcpServers.${name}.url`,
          message: `Server "${name}" has invalid URL: must start with http:// or https://`,
        });
      }
    }
  }

  return errors;
}

export function validateConfig(
  content: string,
  format: 'json' | 'jsonc' | 'yaml',
): ValidationResult {
  const parseResult = parseContent(content, format);
  if (parseResult.error) {
    return { valid: false, errors: [{ field: 'root', message: parseResult.error }] };
  }

  const parsed = parseResult.parsed!;

  const schemaValid = validate(parsed);
  const errors: ValidationError[] = [];

  if (!schemaValid) {
    for (const err of validate.errors ?? []) {
      errors.push({
        field: deriveFieldPath(err.instancePath),
        message: err.message ?? 'Schema validation failed',
      });
    }
  }

  if (parsed.mcpServers && typeof parsed.mcpServers === 'object') {
    const entryErrors = validateServerEntries(parsed.mcpServers as Record<string, McpServerConfig>);
    errors.push(...entryErrors);
  }

  return { valid: errors.length === 0, errors };
}
