import type { McpServer } from '../api/client';

/** Servers the agent ships itself (opencode/Goose built-ins, Zed extensions). */
export function isBuiltInServer(server: McpServer): boolean {
  return !server.control.canEdit && !server.command && !server.url;
}

export function getServerBadgeLabel(server: McpServer): string {
  if (isBuiltInServer(server)) return 'built-in';
  return server.transport === 'unknown' ? 'managed' : server.transport;
}

export function getServerBadgeClass(server: McpServer): string {
  return isBuiltInServer(server) ? 'badge-outline' : 'badge';
}

export function getServerPreviewText(server: McpServer): string {
  const cmd = server.command ?? server.url ?? '';
  if (cmd) return cmd;
  if (isBuiltInServer(server)) return 'Built into the agent';
  return 'Managed by config';
}
