import { describe, expect, it } from 'vitest';
import { extractMcp } from './mcpExtractor.js';
import { parseContent } from './formats.js';
import { dialectForFile } from './dialects.js';
import { applyServerOperation } from '../writer/mcpMutations.js';
import { validateConfig } from '../validation/validator.js';

describe('extractMcp', () => {
  it('reads the standard mcpServers layout with stdio and remote entries', () => {
    const { dialect, servers } = extractMcp({
      mcpServers: {
        fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        linear: { type: 'http', url: 'https://mcp.linear.app/mcp' },
        legacy: { url: 'https://example.com/sse' },
        windsurf: { serverUrl: 'https://example.com/mcp' },
        gemini: { httpUrl: 'https://example.com/mcp' },
      },
    });

    expect(dialect).toBe('mcp-servers');
    expect(servers.map((s) => [s.name, s.transport, s.url ?? s.command])).toEqual([
      ['fs', 'stdio', 'npx'],
      ['linear', 'http', 'https://mcp.linear.app/mcp'],
      ['legacy', 'sse', 'https://example.com/sse'],
      ['windsurf', 'http', 'https://example.com/mcp'],
      ['gemini', 'http', 'https://example.com/mcp'],
    ]);
  });

  it('only offers a toggle for agents that honour `disabled`', () => {
    const config = { mcpServers: { a: { command: 'a', disabled: true } } };
    expect(extractMcp(config, 'mcp-servers').servers[0]).toMatchObject({
      enabled: false,
      control: { canToggle: false },
    });
    expect(extractMcp(config, 'mcp-servers', { toggle: true }).servers[0].control.canToggle).toBe(
      true,
    );
  });

  it('honours the legacy disabledMcpServers list', () => {
    const { servers } = extractMcp({
      mcpServers: { a: { command: 'a' }, b: { command: 'b' } },
      disabledMcpServers: ['b'],
    });
    expect(servers.map((s) => s.enabled)).toEqual([true, false]);
  });

  it('reads opencode local/remote entries and built-in toggles', () => {
    const { dialect, servers } = extractMcp(
      {
        mcp: {
          websearch: { enabled: true },
          excalidraw: { type: 'local', command: ['node', 'index.js', '--stdio'], enabled: false },
          remote: { type: 'remote', url: 'https://example.com/mcp' },
        },
      },
      'opencode',
    );
    expect(dialect).toBe('opencode');
    expect(servers[0]).toMatchObject({ name: 'websearch', control: { canEdit: false } });
    expect(servers[1]).toMatchObject({
      transport: 'stdio',
      command: 'node',
      args: ['index.js', '--stdio'],
      enabled: false,
      control: { canToggle: true, canEdit: true },
    });
    expect(servers[2]).toMatchObject({ transport: 'http', url: 'https://example.com/mcp' });
  });

  it('tells opencode and crush apart without an agent hint', () => {
    expect(extractMcp({ mcp: { a: { type: 'local', command: ['x'] } } }).dialect).toBe('opencode');
    expect(extractMcp({ mcp: { a: { type: 'stdio', command: 'x' } } }).dialect).toBe('crush');
  });

  it('reads Codex TOML mcp_servers', () => {
    const { parsed } = parseContent(
      [
        '[mcp_servers.docs]',
        'command = "npx"',
        'args = ["-y", "docs-mcp"]',
        'env = { TOKEN = "x" }',
        '',
        '[mcp_servers.figma]',
        'url = "https://mcp.figma.com/mcp"',
        'enabled = false',
      ].join('\n'),
      'toml',
    );
    const { dialect, servers } = extractMcp(parsed, 'codex');
    expect(dialect).toBe('codex');
    expect(servers).toEqual([
      expect.objectContaining({ name: 'docs', command: 'npx', env: { TOKEN: 'x' }, enabled: true }),
      expect.objectContaining({ name: 'figma', transport: 'http', enabled: false }),
    ]);
  });

  it('reads Zed context_servers in both the flat and legacy forms', () => {
    const { servers } = extractMcp(
      {
        context_servers: {
          flat: { command: 'uvx', args: ['mcp-server-git'] },
          legacy: { command: { path: 'node', args: ['srv.js'], env: { A: '1' } } },
          ext: { settings: {} },
        },
      },
      'zed',
    );
    expect(servers.map((s) => [s.name, s.command, s.control.canEdit])).toEqual([
      ['flat', 'uvx', true],
      ['legacy', 'node', true],
      ['ext', undefined, false],
    ]);
  });

  it('reads Goose extensions and keeps built-ins read-only', () => {
    const { servers } = extractMcp(
      {
        extensions: {
          developer: { type: 'builtin', name: 'developer', enabled: true },
          github: {
            type: 'stdio',
            name: 'github',
            cmd: 'gh-mcp',
            args: [],
            envs: {},
            enabled: false,
          },
          remote: { type: 'streamable_http', name: 'remote', uri: 'https://x.dev/mcp' },
        },
      },
      'goose',
    );
    expect(servers.map((s) => [s.name, s.transport, s.enabled, s.control.canEdit])).toEqual([
      ['developer', 'unknown', true, false],
      ['github', 'stdio', false, true],
      ['remote', 'http', true, true],
    ]);
  });

  it('reads Continue list-style mcpServers', () => {
    const { dialect, servers } = extractMcp(
      { mcpServers: [{ name: 'sqlite', command: 'uvx', args: ['mcp-server-sqlite'] }] },
      'mcp-servers',
    );
    expect(dialect).toBe('continue');
    expect(servers[0]).toMatchObject({ name: 'sqlite', command: 'uvx' });
  });

  it('reads VS Code servers and Amp flat keys', () => {
    expect(
      extractMcp(
        { servers: { gh: { type: 'http', url: 'https://api.githubcopilot.com/mcp/' } } },
        'vscode',
      ).servers[0],
    ).toMatchObject({ transport: 'http' });
    expect(
      extractMcp({ 'amp.mcpServers': { pw: { command: 'npx', args: ['@playwright/mcp'] } } }, 'amp')
        .servers[0],
    ).toMatchObject({ name: 'pw', command: 'npx', control: { collectionPath: 'amp.mcpServers' } });
  });

  it('allows adding servers to a config with no collection yet when the agent is known', () => {
    expect(extractMcp({ theme: 'dark' }, 'vscode')).toMatchObject({
      dialect: 'vscode',
      canAddServers: true,
      servers: [],
    });
    expect(extractMcp({ theme: 'dark' })).toMatchObject({ dialect: null, canAddServers: false });
  });
});

describe('dialectForFile', () => {
  it('derives dialects from well-known file names', () => {
    expect(dialectForFile('/repo/opencode.json')).toBe('opencode');
    expect(dialectForFile('/repo/.crush.json')).toBe('crush');
    expect(dialectForFile('/home/u/.codex/config.toml')).toBe('codex');
    expect(dialectForFile('/repo/.vscode/mcp.json')).toBe('vscode');
    expect(dialectForFile('/repo/.mcp.json')).toBeNull();
  });
});

describe('applyServerOperation', () => {
  const stdio = {
    name: 'fs',
    transport: 'stdio' as const,
    command: 'npx',
    args: ['-y', 'fs-mcp'],
    env: {},
    enabled: true,
  };

  it('preserves JSONC comments and unrelated keys', () => {
    const original = [
      '{',
      '  // my theme',
      '  "theme": "dark",',
      '  "mcpServers": {',
      '    // keep me',
      '    "old": { "command": "old" }',
      '  }',
      '}',
      '',
    ].join('\n');
    const next = applyServerOperation(
      original,
      'jsonc',
      'mcp-servers',
      {},
      {
        op: 'upsert',
        server: stdio,
      },
    );
    expect(next).toContain('// my theme');
    expect(next).toContain('// keep me');
    expect(parseContent(next, 'jsonc').parsed).toEqual({
      theme: 'dark',
      mcpServers: { old: { command: 'old' }, fs: { command: 'npx', args: ['-y', 'fs-mcp'] } },
    });
  });

  it('renames, keeps unknown per-entry keys and refuses name collisions', () => {
    const original = JSON.stringify({
      mcpServers: { a: { command: 'a', alwaysAllow: ['read'] }, b: { command: 'b' } },
    });
    const renamed = applyServerOperation(
      original,
      'json',
      'mcp-servers',
      {},
      {
        op: 'upsert',
        originalName: 'a',
        server: { ...stdio, name: 'c', command: 'c', args: [] },
      },
    );
    expect(parseContent(renamed, 'json').parsed).toEqual({
      mcpServers: { b: { command: 'b' }, c: { command: 'c', alwaysAllow: ['read'] } },
    });
    expect(() =>
      applyServerOperation(
        original,
        'json',
        'mcp-servers',
        {},
        {
          op: 'upsert',
          originalName: 'a',
          server: { ...stdio, name: 'b' },
        },
      ),
    ).toThrow(/already exists/);
  });

  it('writes remote servers with the agent-specific URL key', () => {
    const remote = {
      name: 'r',
      transport: 'http' as const,
      url: 'https://x.dev/mcp',
      enabled: true,
    };
    const write = (options: object) =>
      parseContent(
        applyServerOperation('{}', 'json', 'mcp-servers', options, {
          op: 'upsert',
          server: remote,
        }),
        'json',
      ).parsed?.mcpServers;
    expect(write({})).toEqual({ r: { type: 'http', url: 'https://x.dev/mcp' } });
    expect(write({ remoteUrlKey: 'serverUrl' })).toEqual({ r: { serverUrl: 'https://x.dev/mcp' } });
    expect(write({ remoteUrlKey: 'httpUrl' })).toEqual({ r: { httpUrl: 'https://x.dev/mcp' } });
  });

  it('toggles and deletes, cleaning up disabledMcpServers', () => {
    const original = JSON.stringify({
      mcpServers: { a: { command: 'a' } },
      disabledMcpServers: ['a'],
    });
    const enabled = applyServerOperation(
      original,
      'json',
      'mcp-servers',
      { toggle: true },
      {
        op: 'toggle',
        name: 'a',
        enabled: true,
      },
    );
    expect(parseContent(enabled, 'json').parsed).toEqual({ mcpServers: { a: { command: 'a' } } });

    const disabled = applyServerOperation(
      enabled,
      'json',
      'mcp-servers',
      { toggle: true },
      {
        op: 'toggle',
        name: 'a',
        enabled: false,
      },
    );
    expect(parseContent(disabled, 'json').parsed).toEqual({
      mcpServers: { a: { command: 'a', disabled: true } },
    });

    const deleted = applyServerOperation(
      disabled,
      'json',
      'mcp-servers',
      {},
      {
        op: 'delete',
        name: 'a',
      },
    );
    expect(parseContent(deleted, 'json').parsed).toEqual({ mcpServers: {} });
  });

  it('refuses to toggle where the agent has no enable flag', () => {
    expect(() =>
      applyServerOperation(
        '{"mcpServers":{"a":{"command":"a"}}}',
        'json',
        'mcp-servers',
        {},
        {
          op: 'toggle',
          name: 'a',
          enabled: false,
        },
      ),
    ).toThrow(/enable\/disable/);
  });

  it('round-trips Codex TOML', () => {
    const next = applyServerOperation(
      'model = "o3"\n',
      'toml',
      'codex',
      {},
      {
        op: 'upsert',
        server: { ...stdio, enabled: false },
      },
    );
    expect(parseContent(next, 'toml').parsed).toEqual({
      model: 'o3',
      mcp_servers: { fs: { command: 'npx', args: ['-y', 'fs-mcp'], enabled: false } },
    });
  });

  it('writes Goose extensions in YAML', () => {
    const next = applyServerOperation(
      'extensions: {}\n',
      'yaml',
      'goose',
      {},
      {
        op: 'upsert',
        server: stdio,
      },
    );
    expect(parseContent(next, 'yaml').parsed).toEqual({
      extensions: {
        fs: {
          timeout: 300,
          name: 'fs',
          enabled: true,
          type: 'stdio',
          cmd: 'npx',
          args: ['-y', 'fs-mcp'],
          envs: {},
        },
      },
    });
  });

  it('writes opencode argv-style commands', () => {
    const next = applyServerOperation(
      '{"$schema":"https://opencode.ai/config.json"}',
      'json',
      'opencode',
      {},
      {
        op: 'upsert',
        server: stdio,
      },
    );
    expect(parseContent(next, 'json').parsed?.mcp).toEqual({
      fs: { type: 'local', command: ['npx', '-y', 'fs-mcp'], enabled: true },
    });
  });

  it('edits Continue list entries in place', () => {
    const original = 'mcpServers:\n  - name: a\n    command: a\n  - name: b\n    command: b\n';
    const next = applyServerOperation(
      original,
      'yaml',
      'continue',
      {},
      {
        op: 'upsert',
        originalName: 'b',
        server: { ...stdio, name: 'b', command: 'bb', args: [] },
      },
    );
    expect(parseContent(next, 'yaml').parsed).toEqual({
      mcpServers: [
        { name: 'a', command: 'a' },
        { name: 'b', command: 'bb' },
      ],
    });
  });

  it('creates nested collections such as VS Code `servers`', () => {
    const next = applyServerOperation(
      '',
      'json',
      'vscode',
      {},
      {
        op: 'upsert',
        server: stdio,
      },
    );
    expect(parseContent(next, 'json').parsed).toEqual({
      servers: { fs: { type: 'stdio', command: 'npx', args: ['-y', 'fs-mcp'] } },
    });
  });
});

describe('validateConfig', () => {
  it('rejects unparseable content and incomplete servers', () => {
    expect(validateConfig('{', 'json').valid).toBe(false);
    expect(validateConfig('[mcp_servers.x]\nargs = []', 'toml', 'codex').errors).toEqual([
      expect.objectContaining({ field: 'mcp_servers.x' }),
    ]);
    expect(
      validateConfig('{"mcpServers":{"x":{"type":"http","url":"ftp://nope"}}}', 'json').valid,
    ).toBe(false);
  });

  it('accepts valid configs and files without MCP servers', () => {
    expect(validateConfig('{"mcpServers":{"x":{"command":"x"}}}', 'json').valid).toBe(true);
    expect(validateConfig('{"editor.fontSize": 14}', 'jsonc').valid).toBe(true);
    expect(validateConfig('', 'yaml').valid).toBe(true);
  });
});
