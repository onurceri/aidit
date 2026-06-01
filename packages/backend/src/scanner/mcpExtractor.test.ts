import { describe, expect, it } from 'vitest';
import { extractMcpServers } from './mcpExtractor.js';

describe('extractMcpServers', () => {
  it('captures OpenCode built-in toggles and local command arrays', () => {
    const servers = extractMcpServers({
      plugin: [],
      $schema: 'https://opencode.ai/config.json',
      mcp: {
        websearch: {
          enabled: true,
        },
        grep_app: {
          enabled: false,
        },
        excalidraw: {
          type: 'local',
          command: ['node', '/tmp/excalidraw-mcp/dist/index.js', '--stdio'],
          enabled: true,
        },
      },
    });

    expect(servers).toHaveLength(3);

    expect(servers).toEqual([
      expect.objectContaining({
        name: 'websearch',
        enabled: true,
        transport: 'unknown',
        command: undefined,
        args: [],
        control: {
          collectionPath: 'mcp',
          enableMode: 'entry-enabled',
          canToggle: true,
          canEdit: false,
          canDelete: false,
        },
      }),
      expect.objectContaining({
        name: 'grep_app',
        enabled: false,
        transport: 'unknown',
        control: {
          collectionPath: 'mcp',
          enableMode: 'entry-enabled',
          canToggle: true,
          canEdit: false,
          canDelete: false,
        },
      }),
      expect.objectContaining({
        name: 'excalidraw',
        enabled: true,
        transport: 'stdio',
        command: 'node',
        args: ['/tmp/excalidraw-mcp/dist/index.js', '--stdio'],
        control: {
          collectionPath: 'mcp',
          enableMode: 'entry-enabled',
          canToggle: true,
          canEdit: false,
          canDelete: false,
        },
      }),
    ]);
  });
});