import chokidar from 'chokidar';
import { statSync, existsSync } from 'node:fs';
import { getEnabledPaths, type ResolvedPathEntry } from '../registry/pathRegistry.js';
import { broadcast } from './wsServer.js';
import { scan } from '../scanner/index.js';

type DirEntry = { prefix: string; pathEntryId: string };

let watcher: chokidar.FSWatcher | null = null;
const pathLookup = new Map<string, string>();
let dirLookup: DirEntry[] = [];

function buildLookups(entries: ResolvedPathEntry[]): void {
  pathLookup.clear();
  dirLookup = [];

  for (const entry of entries) {
    const { id, resolvedPath, type } = entry;

    if (type === 'skills-dir') {
      dirLookup.push({ prefix: resolvedPath, pathEntryId: id });
      pathLookup.set(resolvedPath, id);
    } else {
      pathLookup.set(resolvedPath, id);
    }
  }
}

function findPathEntryId(eventPath: string): string | undefined {
  const exact = pathLookup.get(eventPath);
  if (exact) return exact;

  for (const dir of dirLookup) {
    if (eventPath.startsWith(dir.prefix + '/')) {
      return dir.pathEntryId;
    }
  }

  return undefined;
}

function resolveWatchPaths(entries: ResolvedPathEntry[]): string[] {
  const paths = new Set<string>();

  for (const entry of entries) {
    const { resolvedPath, type } = entry;

    if (type === 'skills-dir') {
      if (existsSync(resolvedPath)) {
        try {
          const s = statSync(resolvedPath);
          if (s.isDirectory()) {
            paths.add(resolvedPath);
          }
        } catch {
          paths.add(resolvedPath);
        }
      } else {
        paths.add(resolvedPath);
      }
    } else {
      paths.add(resolvedPath);
    }
  }

  return Array.from(paths);
}

function createWatcher(watchPaths: string[]): chokidar.FSWatcher {
  const w = chokidar.watch(watchPaths, {
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 300,
      pollInterval: 100,
    },
  });

  w.on('change', (absolutePath: string) => {
    const pathEntryId = findPathEntryId(absolutePath);
    if (pathEntryId) {
      broadcast({
        event: 'config:changed',
        pathEntryId,
        absolutePath,
        timestamp: new Date().toISOString(),
      });
    }
  });

  w.on('add', (absolutePath: string) => {
    const pathEntryId = findPathEntryId(absolutePath);
    if (pathEntryId) {
      broadcast({
        event: 'config:added',
        pathEntryId,
        absolutePath,
        timestamp: new Date().toISOString(),
      });
    }
  });

  w.on('unlink', (absolutePath: string) => {
    const pathEntryId = findPathEntryId(absolutePath);
    if (pathEntryId) {
      broadcast({
        event: 'config:removed',
        pathEntryId,
        absolutePath,
        timestamp: new Date().toISOString(),
      });
    }
  });

  w.on('error', (error: Error) => {
    console.error('[fileWatcher] error:', error.message);
  });

  return w;
}

export function initializeWatcher(): void {
  const entries = getEnabledPaths();
  buildLookups(entries);

  const watchPaths = resolveWatchPaths(entries);

  if (watcher) {
    watcher.close();
  }

  watcher = createWatcher(watchPaths);
}

export async function reinitializeWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }

  broadcast({
    event: 'registry:updated',
    timestamp: new Date().toISOString(),
  });

  const result = scan({ triggeredBy: 'file_change' });

  broadcast({
    event: 'scan:full',
    data: result,
  });

  const entries = getEnabledPaths();
  buildLookups(entries);

  const watchPaths = resolveWatchPaths(entries);
  watcher = createWatcher(watchPaths);
}
