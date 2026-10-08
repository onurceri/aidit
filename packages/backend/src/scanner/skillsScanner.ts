import { readFileSync, existsSync, statSync } from 'node:fs';
import { basename, dirname, extname, resolve as resolvePath, isAbsolute } from 'node:path';
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

function unquote(value: string): string {
  const trimmed = value.trim();
  return /^(['"]).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/** Reads `name` and `description` from YAML frontmatter without a full YAML parse. */
export function readFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const out: { name?: string; description?: string } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const field = line.match(/^(name|description):\s*(.*)$/);
    if (field && field[2] && !/^[>|]/.test(field[2]))
      out[field[1] as 'name' | 'description'] = unquote(field[2]);
  }
  return out;
}

function readHead(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf-8').slice(0, 4096);
  } catch {
    return '';
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

  const head = readHead(filePath);
  const meta = readFrontmatter(head);
  const fallbackName =
    basename(filePath) === 'SKILL.md' ? basename(dirname(filePath)) : basename(filePath, '.md');
  const firstParagraph = head
    .replace(/^---[\s\S]*?---/, '')
    .split(/\r?\n/)
    .find((line) => line.trim() && !line.startsWith('#'));

  return {
    name: meta.name ?? fallbackName,
    description: meta.description ?? firstParagraph?.trim().slice(0, 300) ?? '',
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

  return files.map(toSkillFile).sort((a, b) => a.name.localeCompare(b.name));
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
