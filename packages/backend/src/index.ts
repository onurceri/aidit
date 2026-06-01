import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer, type ServerOptions } from './server.js';
import { attachWsServer } from './watcher/wsServer.js';
import { initializeWatcher } from './watcher/fileWatcher.js';
import { initializeRegistry } from './registry/pathRegistry.js';
import { scan } from './scanner/index.js';

const HOST = '127.0.0.1';
const DEFAULT_PORT = 3001;

export interface StartServerOptions extends ServerOptions {
  port?: number;
}

export async function startServer(
  options: StartServerOptions = {},
): Promise<{ close: () => Promise<void> }> {
  const port = options.port ?? DEFAULT_PORT;

  initializeRegistry();

  const { httpServer } = createServer({
    frontendDistPath: options.frontendDistPath,
    token: options.token,
  });
  attachWsServer(httpServer);
  initializeWatcher();

  return new Promise((resolve) => {
    httpServer.listen(port, HOST, () => {
      const isProduction = Boolean(options.frontendDistPath);
      if (isProduction) {
        console.log(`aidit running at http://${HOST}:${port}`);
      } else {
        console.log(`aidit API running on http://${HOST}:${port}`);
      }
      resolve({
        close: () => {
          return new Promise<void>((resolveClose) => {
            httpServer.close(() => resolveClose());
          });
        },
      });
    });
  });
}

export async function runScanAndPrint(): Promise<void> {
  initializeRegistry();
  const result = scan({ triggeredBy: 'api' });
  console.log(JSON.stringify(result, null, 2));
}

if (!process.env.AIDIT_CLI) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const entryFile = process.argv[1] ? path.resolve(process.argv[1]) : '';
  if (thisFile === entryFile) {
    const port = Number(process.env.PORT) || DEFAULT_PORT;
    startServer({ port });
  }
}
