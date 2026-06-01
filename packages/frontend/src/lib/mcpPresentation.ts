import type { McpServer } from '../api/client';

export function getServerBadgeLabel(server: McpServer): string {
  if (server.control.collectionPath === 'mcp' && !server.command && !server.url) {
    return 'built-in';
  }

  switch (server.transport) {
    case 'stdio':
      return 'stdio';
    case 'sse':
      return 'sse';
    case 'http':
      return 'http';
    default:
      return 'managed';
  }
}

export function getServerBadgeClass(server: McpServer): string {
  if (server.control.collectionPath === 'mcp' && !server.command && !server.url) {
    return 'badge-strong';
  }
  return 'badge';
}

export function getServerPreviewText(server: McpServer): string {
  const cmd = server.command ?? server.url ?? '';
  if (cmd) return cmd;

  if (server.control.collectionPath === 'mcp' && server.control.enableMode === 'entry-enabled') {
    return 'Controlled by this app config';
  }

  if (server.control.canToggle) return 'Controlled by config';

  return 'Managed by config';
}
