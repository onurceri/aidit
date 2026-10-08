#!/usr/bin/env node

import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import net from 'node:net';
import { spawn } from 'node:child_process';

process.env.AIDIT_CLI = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(__dirname, '..');
const backendEntry = path.join(pkgRoot, 'packages', 'backend', 'dist', 'index.js');
const frontendDist = path.join(pkgRoot, 'packages', 'frontend', 'dist');
const aiditDir = process.env.AIDIT_DATA_DIR || path.join(os.homedir(), '.config', 'aidit');

const VERSION = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf-8')).version;
const DEFAULT_PORT = 3001;
const REQUIRED_NODE = [22, 13];
// aidit is localhost-only by design; there is intentionally no --host option.
const HOST = '127.0.0.1';

function showHelp() {
  console.log(`aidit v${VERSION}

Usage:
  aidit start              Start the aidit server and open the dashboard
  aidit scan               Run a scan and print the results as JSON to stdout
  aidit --help             Show this help
  aidit --version          Show version

Options:
  --port <port>            Port to listen on (default: ${DEFAULT_PORT}; next free port is used if taken)
  --token                  Require a random auth token for all API requests
  --no-open                Don't open the dashboard in a browser

Examples:
  aidit start
  aidit start --port 4000 --no-open
  aidit start --token
  aidit scan > agents.json
  npx aidit start`);
}

function checkNodeVersion() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const [reqMajor, reqMinor] = REQUIRED_NODE;
  if (major < reqMajor || (major === reqMajor && minor < reqMinor)) {
    console.error(
      `aidit requires Node.js ${reqMajor}.${reqMinor} or later. Current: v${process.versions.node}`,
    );
    process.exit(1);
  }
}

/**
 * node:sqlite prints an ExperimentalWarning on some Node versions. It's noise for
 * end users; drop only that warning and let everything else through.
 */
function silenceSqliteWarning() {
  const original = process.emitWarning;
  process.emitWarning = function (warning, ...rest) {
    const message = typeof warning === 'string' ? warning : warning?.message;
    const type = typeof rest[0] === 'string' ? rest[0] : rest[0]?.type;
    const name = typeof warning === 'object' ? warning?.name : type;
    if (
      (name === 'ExperimentalWarning' || type === 'ExperimentalWarning') &&
      /sqlite/i.test(message ?? '')
    ) {
      return;
    }
    return original.call(process, warning, ...rest);
  };
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
  for (let port = startPort; port < Math.min(startPort + 100, 65536); port++) {
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

function ensureBuilt() {
  if (!fs.existsSync(backendEntry)) {
    console.error('aidit is not built. Run `pnpm install && pnpm build` first.');
    process.exit(1);
  }
}

function generateToken() {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenFile = path.join(aiditDir, 'token');
  fs.writeFileSync(tokenFile, token, { mode: 0o600 });
  fs.chmodSync(tokenFile, 0o600);
  console.log(`Auth token saved to ${tokenFile}`);
  return token;
}

function openBrowser(url) {
  // Fixed binaries with argv arrays — never a shell string.
  let command;
  let args;
  if (process.platform === 'darwin') {
    command = 'open';
    args = [url];
  } else if (process.platform === 'win32') {
    command = 'rundll32';
    args = ['url.dll,FileProtocolHandler', url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', (err) => {
      console.error(`Could not open a browser (${err.message}). Open ${url} manually.`);
    });
    child.unref();
  } catch (err) {
    console.error(`Could not open a browser (${err.message}). Open ${url} manually.`);
  }
}

async function loadBackend() {
  ensureBuilt();
  silenceSqliteWarning();
  return import(pathToFileURL(backendEntry).href);
}

async function doStart(port, { withToken, open }) {
  ensureAiditDir();

  const token = withToken ? generateToken() : undefined;
  const availablePort = await findAvailablePort(port);

  const { startServer } = await loadBackend();

  const server = await startServer({
    port: availablePort,
    frontendDistPath: frontendDist,
    token,
  });

  if (availablePort !== port) {
    console.log(`Port ${port} was in use, using port ${availablePort} instead.`);
  }

  const url = `http://${HOST}:${availablePort}/`;
  // The token travels in the URL fragment, which browsers never send to servers or in Referer.
  const dashboardUrl = token ? `${url}#token=${token}` : url;
  if (open) {
    openBrowser(dashboardUrl);
  } else if (token) {
    console.log(`Open ${dashboardUrl}`);
  }

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) {
      process.exit(1);
    }
    shuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down…`);
    const timer = setTimeout(() => process.exit(0), 3000);
    timer.unref();
    server
      .close()
      .catch(() => {})
      .finally(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

async function doScan() {
  ensureAiditDir();
  const { runScanAndPrint } = await loadBackend();
  await runScanAndPrint();
}

function parseArgs(args) {
  const options = { port: DEFAULT_PORT, withToken: false, open: true };
  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' || arg.startsWith('--port=')) {
      const value = arg.includes('=') ? arg.slice('--port='.length) : args[++i];
      const p = Number(value);
      if (!Number.isInteger(p) || p < 1 || p > 65535) {
        console.error(`Invalid port: ${value}. Must be a number between 1 and 65535.`);
        process.exit(1);
      }
      options.port = p;
    } else if (arg === '--token') {
      options.withToken = true;
    } else if (arg === '--no-open') {
      options.open = false;
    } else {
      console.error(`Unknown option: ${arg}`);
      showHelp();
      process.exit(1);
    }
  }
  return options;
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(`aidit v${VERSION}`);
    process.exit(0);
  }

  checkNodeVersion();

  const command = args[0];
  const options = parseArgs(args);

  switch (command) {
    case 'start':
      await doStart(options.port, options);
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
  console.error('Fatal error:', err?.message ?? err);
  process.exit(1);
});
