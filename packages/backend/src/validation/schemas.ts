import type { Schema } from 'ajv';

export interface McpServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  transport?: string;
  disabled?: boolean;
  [key: string]: unknown;
}

export interface AgentConfig {
  mcpServers?: Record<string, McpServerConfig>;
  disabledMcpServers?: string[];
  [key: string]: unknown;
}

export const mcpServerEntrySchema: Schema = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    args: { type: 'array', items: { type: 'string' } },
    env: { type: 'object' },
    url: { type: 'string' },
    transport: { type: 'string' },
    disabled: { type: 'boolean' },
  },
  additionalProperties: true,
};

export const configSchema: Schema = {
  type: 'object',
  properties: {
    mcpServers: {
      type: 'object',
      additionalProperties: mcpServerEntrySchema,
    },
    disabledMcpServers: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  additionalProperties: true,
};
