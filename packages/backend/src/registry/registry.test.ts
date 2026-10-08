import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, beforeAll } from 'vitest';
import { AGENTS } from './agents.js';
import { BUILTIN_PATHS } from './builtins.js';
import { initializeRegistry, loadRegistry } from './pathRegistry.js';
import { scan } from '../scanner/index.js';
import { applyServerChange } from '../writer/safeWriter.js';

describe('built-in registry', () => {
  it('has unique ids and only references known agents', () => {
    const ids = BUILTIN_PATHS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const agentIds = new Set(AGENTS.map((a) => a.id));
    for (const entry of BUILTIN_PATHS) {
      if (entry.agent) expect(agentIds, entry.id).toContain(entry.agent);
    }
  });

  it('gives every catalog agent at least one path', () => {
    const used = new Set(BUILTIN_PATHS.map((e) => e.agent));
    for (const agent of AGENTS) expect(used, agent.id).toContain(agent.id);
  });
});

describe('scan + write against a fake home directory', () => {
  const home = mkdtempSync(join(tmpdir(), 'aidit-home-'));
  const project = mkdtempSync(join(tmpdir(), 'aidit-project-'));

  beforeAll(() => {
    process.env.HOME = home;
    process.env.XDG_CONFIG_HOME = join(home, '.config');

    mkdirSync(join(home, '.codex'), { recursive: true });
    writeFileSync(
      join(home, '.codex', 'config.toml'),
      'model = "gpt-5"\n\n[mcp_servers.docs]\ncommand = "npx"\nargs = ["-y", "docs-mcp"]\n',
    );
    mkdirSync(join(home, '.agents', 'skills', 'pdf'), { recursive: true });
    writeFileSync(join(home, '.agents', 'skills', 'pdf', 'SKILL.md'), '---\nname: pdf\n---\n');
    mkdirSync(join(project, '.cursor'), { recursive: true });
    writeFileSync(
      join(project, '.cursor', 'mcp.json'),
      '{\n  // team servers\n  "mcpServers": { "linear": { "url": "https://mcp.linear.app/mcp" } }\n}\n',
    );

    initializeRegistry();
  });

  it('keeps the registry in sync with built-ins', () => {
    initializeRegistry();
    expect(loadRegistry().entries.filter((e) => e.source === 'builtin')).toHaveLength(
      BUILTIN_PATHS.length,
    );
  });

  it('finds agents, servers and skills across formats', () => {
    const result = scan({ cwd: project });
    const byId = new Map(result.agents.map((a) => [a.id, a]));

    const codex = byId.get('codex');
    expect(codex).toMatchObject({ found: true, label: 'OpenAI Codex' });
    expect(codex?.configs[0]).toMatchObject({ format: 'toml', dialect: 'codex' });
    expect(codex?.configs[0].mcpServers[0]).toMatchObject({ name: 'docs', command: 'npx' });

    const cursor = byId.get('cursor');
    expect(cursor?.configs[0].mcpServers[0]).toMatchObject({ name: 'linear', transport: 'http' });

    expect(byId.get('agent-skills')?.skillsDirs[0].skills[0].filename).toBe('SKILL.md');
    expect(byId.get('claude-desktop')?.found).toBe(false);
  });

  it('writes structured edits in the agent dialect and keeps a backup', () => {
    const result = applyServerChange(
      'codex-global-config',
      { op: 'toggle', name: 'docs', enabled: false },
      'user_form',
    );
    expect(result.mcpServers[0].enabled).toBe(false);
    const text = readFileSync(join(home, '.codex', 'config.toml'), 'utf-8');
    expect(text).toContain('model = "gpt-5"');
    expect(text).toContain('enabled = false');

    const cursor = applyServerChange(
      'cursor-project-mcp',
      {
        op: 'upsert',
        server: { name: 'fs', transport: 'stdio', command: 'npx', args: ['fs-mcp'], enabled: true },
      },
      'user_form',
      project,
    );
    expect(cursor.mcpServers.map((s) => s.name)).toEqual(['linear', 'fs']);
    expect(cursor.raw).toContain('// team servers');
  });
});
