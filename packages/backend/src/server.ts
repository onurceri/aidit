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

  app.use(express.json());

  const isProduction = Boolean(options.frontendDistPath);

  app.use((_req: Request, res: Response, next: NextFunction) => {
    if (isProduction) {
      res.header('Access-Control-Allow-Origin', '*');
    } else {
      res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
    }
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, PATCH, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (_req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  if (options.token) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const auth = req.headers.authorization;
      if (!auth || auth !== `Bearer ${options.token}`) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }
      next();
    });
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
