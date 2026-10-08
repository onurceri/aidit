import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';

// Env (AIDIT_DATA_DIR, AIDIT_DB_PATH) is set by src/test/setup.ts before any import.
const { createServer } = await import('./server.js');
const { attachWsServer } = await import('./watcher/wsServer.js');
const { upsertEntry } = await import('./db/pathRegistry.js');

interface RawResponse {
  status: number;
  body: string;
}

function rawRequest(
  port: number,
  options: { method?: string; path: string; headers?: Record<string, string>; body?: string },
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        method: options.method ?? 'GET',
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function listen(server: http.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

function wsStatus(port: number, opts: { origin?: string; query?: string }): Promise<number> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/watch${opts.query ?? ''}`, {
      origin: opts.origin,
    });
    ws.on('open', () => {
      ws.close();
      resolve(101);
    });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('error', () => resolve(0));
  });
}

describe('server security (production mode, no token)', () => {
  let server: http.Server;
  let port: number;
  let skillsDir: string;
  let outsideDir: string;

  beforeAll(async () => {
    const root = mkdtempSync(join(tmpdir(), 'aidit-sec-'));
    skillsDir = join(root, 'skills');
    outsideDir = join(root, 'outside');
    mkdirSync(join(skillsDir, 'demo'), { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(join(skillsDir, 'demo', 'SKILL.md'), '# demo\n');
    writeFileSync(join(outsideDir, 'secret.md'), 'secret\n');

    upsertEntry({
      id: 'test-skills',
      label: 'Test skills',
      path: skillsDir,
      type: 'skills-dir',
      agent: 'test',
      scope: 'project',
      source: 'user',
      enabled: true,
    });

    const distDir = mkdtempSync(join(tmpdir(), 'aidit-dist-'));
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>aidit</title>');
    ({ httpServer: server } = createServer({ frontendDistPath: distDir }));
    attachWsServer(server, {});
    port = await listen(server);
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it('allows same-origin GET', async () => {
    const res = await rawRequest(port, { path: '/api/settings' });
    expect(res.status).toBe(200);
  });

  it('sends no permissive CORS header', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/api/settings`, {
      headers: { Origin: 'https://evil.example' },
    });
    expect(res.status).toBe(403);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('rejects a cross-origin POST', async () => {
    const res = await rawRequest(port, {
      method: 'PUT',
      path: '/api/settings',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'backup_retention', value: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects a local origin on a different port', async () => {
    const res = await rawRequest(port, {
      method: 'PUT',
      path: '/api/settings',
      headers: { Origin: 'http://localhost:8080', 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'backup_retention', value: 1 }),
    });
    expect(res.status).toBe(403);
  });

  it('allows a same-origin POST', async () => {
    const res = await rawRequest(port, {
      method: 'PUT',
      path: '/api/settings',
      headers: { Origin: `http://127.0.0.1:${port}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'backup_retention', value: 10 }),
    });
    expect(res.status).toBe(200);
  });

  it('rejects a DNS-rebinding Host header', async () => {
    const res = await rawRequest(port, {
      path: '/api/settings',
      headers: { Host: `evil.example:${port}` },
    });
    expect(res.status).toBe(403);
  });

  it('rejects text/plain bodies (CSRF simple request)', async () => {
    const res = await rawRequest(port, {
      method: 'PUT',
      path: '/api/settings',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ key: 'backup_retention', value: 1 }),
    });
    expect(res.status).toBe(415);
  });

  it('sets security headers', async () => {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
  });

  it('reads a skill inside a registered dir', async () => {
    const path = join(skillsDir, 'demo', 'SKILL.md');
    const res = await rawRequest(port, {
      path: `/api/skills/file?path=${encodeURIComponent(path)}`,
    });
    expect(res.status).toBe(200);
  });

  it('rejects skill path traversal on read', async () => {
    const path = `${skillsDir}/../outside/secret.md`;
    const res = await rawRequest(port, {
      path: `/api/skills/file?path=${encodeURIComponent(path)}`,
    });
    expect(res.status).toBe(403);
  });

  it('rejects skill path traversal on write', async () => {
    const res = await rawRequest(port, {
      method: 'POST',
      path: '/api/skills/file',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: `${skillsDir}/../outside/pwn.md`, content: 'x' }),
    });
    expect(res.status).toBe(403);
  });

  it('rejects writing non-markdown files into a skills dir', async () => {
    const res = await rawRequest(port, {
      method: 'POST',
      path: '/api/skills/file',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: join(skillsDir, 'demo', 'run.sh'), content: 'x' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects backup filename traversal', async () => {
    const res = await rawRequest(port, {
      method: 'POST',
      path: '/api/backups/test-skills/restore',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: '../../../etc/passwd' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects path entry ids that could escape the backup dir', async () => {
    const res = await rawRequest(port, {
      method: 'POST',
      path: '/api/paths/import',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          {
            id: '../../evil',
            label: 'x',
            path: '/tmp/x.json',
            type: 'mcp-config',
            scope: 'global',
            source: 'user',
            enabled: true,
          },
        ],
      }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects WebSocket upgrades from foreign origins', async () => {
    expect(await wsStatus(port, { origin: 'https://evil.example' })).toBe(403);
    expect(await wsStatus(port, { origin: `http://127.0.0.1:${port}` })).toBe(101);
  });
});

describe('server security (token mode)', () => {
  const token = 'a'.repeat(64);
  let server: http.Server;
  let port: number;

  beforeAll(async () => {
    const distDir = mkdtempSync(join(tmpdir(), 'aidit-dist-'));
    writeFileSync(join(distDir, 'index.html'), '<!doctype html><title>aidit</title>');
    ({ httpServer: server } = createServer({ frontendDistPath: distDir, token }));
    attachWsServer(server, { token });
    port = await listen(server);
  });

  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });

  it('serves the dashboard shell without a token', async () => {
    const res = await rawRequest(port, { path: '/' });
    expect(res.status).toBe(200);
  });

  it('requires the token for API calls', async () => {
    expect((await rawRequest(port, { path: '/api/settings' })).status).toBe(401);
    expect(
      (
        await rawRequest(port, {
          path: '/api/settings',
          headers: { Authorization: 'Bearer wrong' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await rawRequest(port, {
          path: '/api/settings',
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(200);
  });

  it('requires the token for WebSocket connections', async () => {
    const origin = `http://127.0.0.1:${port}`;
    expect(await wsStatus(port, { origin })).toBe(401);
    expect(await wsStatus(port, { origin, query: `?token=${token}` })).toBe(101);
  });
});
