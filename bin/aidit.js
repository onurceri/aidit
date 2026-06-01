#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import net from 'node:net';
import { exec } from 'node:child_process';

process.env.AIDIT_CLI = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const backendDist = path.join(pkgRoot, 'packages', 'backend', 'dist');
const frontendDist = path.join(pkgRoot, 'packages', 'frontend', 'dist');
const aiditDir = path.join(process.env.HOME || '~', '.config', 'aidit');

const VERSION = '0.1.0';
const DEFAULT_PORT = 3001;
const REQUIRED_NODE_MAJOR = 20;
const HOST = '127.0.0.1';

function showHelp() {
  console.log(`aidit v${VERSION}

Usage:
  aidit start              Start the aidit server and open the dashboard
  aidit scan               Run a scan and print the results to stdout
  aidit --help             Show this help
  aidit --version          Show version

Options:
  --port <port>            Override the default port (default: ${DEFAULT_PORT})
  --token                  Generate an optional auth token for API requests

Examples:
  aidit start
  aidit start --port 4000
  aidit start --token
  aidit scan
  npx aidit start`);
}

function showVersion() {
  console.log(`aidit v${VERSION}`);
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < REQUIRED_NODE_MAJOR) {
    console.error(
      `aidit requires Node.js ${REQUIRED_NODE_MAJOR} or later. Current: v${process.versions.node}`,
    );
    process.exit(1);
  }
}

function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.on('error', () => resolve(false));
    server.listen(port, HOST, () => {
      server.close(() => resolve(true));
    });
  });
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 100; port++) {
    if (await checkPortAvailable(port)) {
      return port;
    }
  }
  console.error(`No available port found starting from ${startPort}`);
  process.exit(1);
}

function ensureAiditDir() {
  try {
    fs.mkdirSync(aiditDir, { recursive: true });
    fs.accessSync(aiditDir, fs.constants.W_OK);
  } catch {
    console.error(`Cannot create or write to ${aiditDir}. Check permissions.`);
    process.exit(1);
  }
}

function generateToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenFile = path.join(aiditDir, 'token');
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  console.log(`Auth token saved to ${tokenFile}`);
  return token;
}

function openBrowser(url) {
  const platform = process.platform;
  let command;
  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, (err) => {
    if (err) {
      console.error(`Failed to open browser: ${err.message}`);
    }
  });
}

async function doStart(port, withToken) {
  ensureAiditDir();

  let token;
  if (withToken) {
    token = generateToken();
  }

  const availablePort = await findAvailablePort(port);

  const { startServer } = await import(path.join(backendDist, 'index.js'));

  await startServer({
    port: availablePort,
    frontendDistPath: frontendDist,
    token,
  });

  if (availablePort !== port) {
    console.log(`Port ${port} was in use, using port ${availablePort} instead.`);
  }

  const url = `http://${HOST}:${availablePort}`;
  openBrowser(url);
}

async function doScan() {
  ensureAiditDir();

  const { runScanAndPrint } = await import(path.join(backendDist, 'index.js'));

  await runScanAndPrint();
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    showVersion();
    process.exit(0);
  }

  checkNodeVersion();

  const command = args[0];

  let port = DEFAULT_PORT;
  let withToken = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      const p = Number(args[++i]);
      if (Number.isNaN(p) || p < 1 || p > 65535) {
        console.error(`Invalid port: ${args[i]}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      port = p;
    }
    if (args[i] === '--token') {
      withToken = true;
    }
  }

  switch (command) {
    case 'start':
      await doStart(port, withToken);
      break;
    case 'scan':
      await doScan();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
