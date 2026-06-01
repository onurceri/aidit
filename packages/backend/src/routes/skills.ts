import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve as resolveNodePath, dirname } from 'node:path';
import { getEnabledPaths } from '../registry/pathRegistry.js';
import { scanSkillsDir } from '../scanner/skillsScanner.js';
import type { SkillsDirResult } from '../scanner/types.js';

const router: ReturnType<typeof Router> = Router();

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
      const result = scanSkillsDir(entry.resolvedPath, entry.scope);
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

  const resolvedRequested = resolveNodePath(requestedPath);

  let enabledPaths;
  try {
    enabledPaths = getEnabledPaths();
  } catch {
    res
      .status(500)
      .json({ error: 'registry_load_failed', message: 'Failed to load path registry' });
    return;
  }

  const allowedPaths = enabledPaths
    .filter((e) => e.type === 'skills-dir')
    .map((e) => e.resolvedPath);

  const isAllowed = allowedPaths.some(
    (allowed) => resolvedRequested === allowed || resolvedRequested.startsWith(allowed + '/'),
  );

  if (!isAllowed) {
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
  const { path: requestedPath, content } = req.body;

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

  const resolvedPath = resolveNodePath(requestedPath);

  let enabledPaths;
  try {
    enabledPaths = getEnabledPaths();
  } catch {
    res
      .status(500)
      .json({ error: 'registry_load_failed', message: 'Failed to load path registry' });
    return;
  }

  const skillsDirs = enabledPaths.filter((e) => e.type === 'skills-dir').map((e) => e.resolvedPath);

  const parentDir = skillsDirs.find(
    (dir) => resolvedPath === dir || resolvedPath.startsWith(dir + '/'),
  );

  if (!parentDir) {
    res.status(403).json({
      error: 'path_not_allowed',
      message: 'Path is not within a registry-declared skills directory',
    });
    return;
  }

  const parentEntry = enabledPaths.find(
    (e) => e.type === 'skills-dir' && e.resolvedPath === parentDir,
  );
  const scope = parentEntry?.scope ?? 'project';

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
