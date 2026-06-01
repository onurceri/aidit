import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, extname, resolve as resolvePath, isAbsolute } from 'node:path';
import fg from 'fast-glob';
import type { SkillsDirResult, SkillFile } from './types.js';

const SKILL_ENTRY_GLOB = '**/SKILL.md';

function readPreviewLines(filePath: string): string[] {
  try {
    const fd = readFileSync(filePath, 'utf-8');
    return fd
      .split('\n')
      .slice(0, 3)
      .map((line) => line.slice(0, 200));
  } catch {
    return [];
  }
}

function toSkillFile(filePath: string): SkillFile {
  let sizeBytes = 0;
  let lastModified = new Date(0).toISOString();

  try {
    const stat = statSync(filePath);
    sizeBytes = stat.size;
    lastModified = stat.mtime.toISOString();
  } catch {
    // use defaults
  }

  return {
    filename: basename(filePath),
    absolutePath: filePath,
    sizeBytes,
    lastModified,
    previewLines: readPreviewLines(filePath),
  };
}

function scanDirectory(absolutePath: string): SkillFile[] {
  const cwd = isAbsolute(absolutePath) ? absolutePath : resolvePath(absolutePath);

  if (!existsSync(cwd)) {
    return [];
  }

  let stat;
  try {
    stat = statSync(cwd);
  } catch {
    return [];
  }

  if (stat.isFile()) {
    return extname(cwd).toLowerCase() === '.md' ? [toSkillFile(cwd)] : [];
  }

  let files: string[];
  try {
    files = fg.sync(SKILL_ENTRY_GLOB, {
      cwd,
      absolute: true,
      onlyFiles: true,
      dot: true,
    });
  } catch {
    return [];
  }

  return files.map(toSkillFile);
}

export function scanSkillsDir(absolutePath: string, scope: 'global' | 'project'): SkillsDirResult {
  const cleanPath = absolutePath.replace(/\/\*{2,}$/, '');

  const skills = scanDirectory(cleanPath);

  return {
    absolutePath: cleanPath,
    scope,
    skills,
  };
}
