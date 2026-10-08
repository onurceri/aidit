import { Router } from 'express';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  statSync,
  realpathSync,
} from 'node:fs';
import {
  resolve as resolveNodePath,
  dirname,
  extname,
  relative,
  isAbsolute,
  basename,
} from 'node:path';
import { getAgentInfo } from '../registry/agents.js';
import { getEnabledPaths, type ResolvedPathEntry } from '../registry/pathRegistry.js';
import { scanSkillsDir } from '../scanner/skillsScanner.js';
import type { SkillsDirResult } from '../scanner/types.js';

const router: ReturnType<typeof Router> = Router();

/** Extensions the skills editor may create or overwrite. */
const WRITABLE_EXTENSIONS = new Set(['.md', '.mdc', '.markdown', '.txt']);

function isInside(child: string, parent: string): boolean {
  if (child === parent) return true;
  const rel = relative(parent, child);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

/** realpath of the path, or of its nearest existing ancestor joined with the rest. */
function realpathLoose(p: string): string {
  const tail: string[] = [];
  let current = p;
  for (;;) {
    try {
      const real = realpathSync(current);
      return tail.length > 0 ? resolveNodePath(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname(current);
      if (parent === current) return p;
      tail.push(basename(current));
      current = parent;
    }
  }
}

/**
 * Finds the enabled skills-dir entry that contains `requested`. Both the lexical
 * path and its symlink-resolved form must stay inside the entry, so `..` segments
 * and symlinks cannot escape a registered directory.
 */
function findContainingSkillsEntry(
  requested: string,
  entries: ResolvedPathEntry[],
): ResolvedPathEntry | undefined {
  const realRequested = realpathLoose(requested);
  return entries.find((entry) => {
    if (entry.type !== 'skills-dir') return false;
    const base = entry.resolvedPath.replace(/\/\*{2,}$/, '');
    return isInside(requested, base) && isInside(realRequested, realpathLoose(base));
  });
}

function loadEnabledPaths(cwd?: string): ResolvedPathEntry[] | null {
  try {
    return getEnabledPaths(cwd);
  } catch {
    return null;
  }
}

router.get('/', (req, res) => {
  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;

  let enabledPaths;
  try {
    enabledPaths = getEnabledPaths(cwd);
  } catch {
    res
      .status(500)
      .json({ error: 'registry_load_failed', message: 'Failed to load path registry' });
    return;
  }

  const skillsDirs = enabledPaths.filter((e) => e.type === 'skills-dir');

  const global: SkillsDirResult[] = [];
  const project: SkillsDirResult[] = [];

  for (const entry of skillsDirs) {
    if (!existsSync(entry.resolvedPath)) continue;

    try {
      const result: SkillsDirResult = {
        ...scanSkillsDir(entry.resolvedPath, entry.scope),
        agentId: entry.agent,
        agentLabel: getAgentInfo(entry.agent)?.label ?? entry.label,
      };
      if (result.skills.length === 0) continue;

      if (entry.scope === 'global') {
        global.push(result);
      } else {
        project.push(result);
      }
    } catch {
      // Skip directories that fail to scan
    }
  }

  res.status(200).json({ global, project });
});

router.get('/file', (req, res) => {
  const requestedPath = typeof req.query.path === 'string' ? req.query.path : null;

  if (!requestedPath) {
    res.status(400).json({ error: 'missing_param', message: 'Query parameter "path" is required' });
    return;
  }

  const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
  const resolvedRequested = resolveNodePath(requestedPath);

  const enabledPaths = loadEnabledPaths(cwd);
  if (!enabledPaths) {
    res
      .status(500)
      .json({ error: 'registry_load_failed', message: 'Failed to load path registry' });
    return;
  }

  if (!findContainingSkillsEntry(resolvedRequested, enabledPaths)) {
    res.status(403).json({
      error: 'path_not_allowed',
      message: "The requested path is not within the registry's declared paths",
    });
    return;
  }

  if (!existsSync(resolvedRequested)) {
    res.status(404).json({
      error: 'file_not_found',
      message: `File not found: ${resolvedRequested}`,
    });
    return;
  }

  let content: string;
  let lastModified: string;

  try {
    if (!statSync(resolvedRequested).isFile()) {
      res.status(400).json({ error: 'not_a_file', message: 'Path is not a file' });
      return;
    }
    content = readFileSync(resolvedRequested, 'utf-8');
    const stat = statSync(resolvedRequested);
    lastModified = stat.mtime.toISOString();
  } catch (err) {
    res.status(500).json({
      error: 'read_failed',
      message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  res.status(200).json({
    path: resolvedRequested,
    content,
    lastModified,
  });
});

router.post('/file', (req, res) => {
  const { path: requestedPath, content } = (req.body ?? {}) as {
    path?: unknown;
    content?: unknown;
  };

  if (!requestedPath || typeof requestedPath !== 'string') {
    res.status(400).json({ error: 'missing_param', message: 'Body parameter "path" is required' });
    return;
  }

  if (content === undefined || content === null || typeof content !== 'string') {
    res
      .status(400)
      .json({ error: 'missing_param', message: 'Body parameter "content" is required' });
    return;
  }

  const cwd = typeof req.body?.cwd === 'string' ? (req.body.cwd as string) : undefined;
  const resolvedPath = resolveNodePath(requestedPath);

  if (!WRITABLE_EXTENSIONS.has(extname(resolvedPath).toLowerCase())) {
    res.status(400).json({
      error: 'invalid_extension',
      message: `Only ${[...WRITABLE_EXTENSIONS].join(', ')} files can be written`,
    });
    return;
  }

  const enabledPaths = loadEnabledPaths(cwd);
  if (!enabledPaths) {
    res
      .status(500)
      .json({ error: 'registry_load_failed', message: 'Failed to load path registry' });
    return;
  }

  const parentEntry = findContainingSkillsEntry(resolvedPath, enabledPaths);
  if (!parentEntry) {
    res.status(403).json({
      error: 'path_not_allowed',
      message: 'Path is not within a registry-declared skills directory',
    });
    return;
  }

  const scope = parentEntry.scope;

  const isShared = scope === 'global';
  if (isShared && existsSync(resolvedPath)) {
    res.status(403).json({
      error: 'readonly',
      message: 'Shared (global) skills are read-only and cannot be edited',
    });
    return;
  }

  try {
    const dir = dirname(resolvedPath);
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolvedPath, content, 'utf-8');

    const stat = statSync(resolvedPath);
    res.status(200).json({
      path: resolvedPath,
      content,
      lastModified: stat.mtime.toISOString(),
    });
  } catch (err) {
    res.status(500).json({
      error: 'write_failed',
      message: `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
});

export default router;
