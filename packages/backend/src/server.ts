import http from 'node:http';
import path from 'node:path';
import { existsSync } from 'node:fs';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import scanRouter from './routes/scan.js';
import configRouter from './routes/config.js';
import skillsRouter from './routes/skills.js';
import pathsRouter from './routes/paths.js';
import backupsRouter from './routes/backups.js';
import settingsRouter from './routes/settings.js';
import { ensureBackupBaseDir } from './writer/index.js';
import { devCors, requestGuard, securityHeaders, tokenGuard } from './security.js';

ensureBackupBaseDir();

export interface ServerOptions {
  frontendDistPath?: string;
  token?: string;
}

export function createServer(options: ServerOptions = {}): {
  app: express.Express;
  httpServer: http.Server;
} {
  const app = express();

  const isProduction = Boolean(options.frontendDistPath);
  const security = { token: options.token, allowDevOrigin: !isProduction };

  app.disable('x-powered-by');
  app.use(securityHeaders);
  if (!isProduction) {
    app.use(devCors);
  }
  app.use(requestGuard(security));
  app.use(express.json({ limit: '5mb' }));

  if (options.token) {
    // Only the API is protected; the SPA shell and assets must load so the
    // dashboard can pick up the token from the URL fragment.
    app.use('/api', tokenGuard(options.token));
  }

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/scan', scanRouter);
  app.use('/api/config', configRouter);
  app.use('/api/skills', skillsRouter);
  app.use('/api/paths', pathsRouter);
  app.use('/api/backups', backupsRouter);
  app.use('/api/settings', settingsRouter);

  if (isProduction && options.frontendDistPath) {
    const distPath = options.frontendDistPath;
    if (existsSync(distPath)) {
      app.use(express.static(distPath, { setHeaders }));
      app.get('*', (_req: Request, res: Response, next: NextFunction) => {
        if (
          _req.path.startsWith('/api/') ||
          _req.path.startsWith('/ws/') ||
          _req.path === '/health'
        ) {
          next();
          return;
        }
        if (_req.path.startsWith('/assets/') || _req.path === '/index.html') {
          next();
          return;
        }
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const httpServer = http.createServer(app);
  return { app, httpServer };
}

function setHeaders(res: Response, filePath: string): void {
  if (filePath.endsWith('.js')) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  } else if (filePath.endsWith('.css')) {
    res.setHeader('Content-Type', 'text/css; charset=utf-8');
  }
}
