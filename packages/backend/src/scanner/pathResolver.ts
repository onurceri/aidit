import { homedir } from 'node:os';
import { resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import fastGlob from 'fast-glob';

export function resolvePath(rawPath: string, cwd?: string): string {
  const home = homedir();
  const xdgConfig = process.env.XDG_CONFIG_HOME || resolve(home, '.config');

  let expanded = rawPath;

  if (expanded.startsWith('~/')) {
    expanded = resolve(home, expanded.slice(2));
  } else if (expanded === '~') {
    expanded = home;
  }

  expanded = expanded.replaceAll('$HOME', home);
  expanded = expanded.replaceAll('$XDG_CONFIG_HOME', xdgConfig);

  expanded = resolveWslPath(expanded);

  if (!isAbsolute(expanded)) {
    expanded = resolve(cwd || process.cwd(), expanded);
  }

  return expanded;
}

export function isGlobPattern(p: string): boolean {
  return /[*?{[\]]/.test(p);
}

export function expandGlob(
  pattern: string,
  options?: { cwd?: string; deep?: number; absolute?: boolean },
): string[] {
  const cwd = options?.cwd ?? process.cwd();
  const deep = options?.deep ?? 4;
  const absolute = options?.absolute ?? true;

  const resolvedPattern = resolvePath(pattern, cwd);

  return fastGlob.sync(resolvedPattern, {
    cwd,
    absolute,
    deep,
    onlyFiles: true,
  });
}

export function isWsl(): boolean {
  if (process.platform !== 'linux') return false;

  if (process.env.WSLENV) return true;

  try {
    return existsSync('/proc/sys/fs/binfmt_misc/WSLInterop');
  } catch {
    return false;
  }
}

function resolveWslPath(expanded: string): string {
  if (!isWsl()) return expanded;

  if (expanded.includes('{WIN_HOME}')) {
    try {
      const winHome = execSync('wslpath "$(wslvar USERPROFILE)"', { encoding: 'utf-8' }).trim();
      expanded = expanded.replaceAll('{WIN_HOME}', winHome);
    } catch {
      try {
        const home = execSync('cmd.exe /c "echo %USERPROFILE%"', { encoding: 'utf-8' }).trim();
        const wslHome = home
          .replace(/^([A-Za-z]):\\/, (_: string, d: string) => `/mnt/${d.toLowerCase()}/`)
          .replace(/\\/g, '/');
        expanded = expanded.replaceAll('{WIN_HOME}', wslHome);
      } catch {
        expanded = expanded.replaceAll('{WIN_HOME}', '/mnt/c/Users');
      }
    }
  }

  if (/^[A-Za-z]:[\\/]/.test(expanded)) {
    expanded = expanded
      .replace(/^([A-Za-z]):[\\/]/, (_: string, d: string) => `/mnt/${d.toLowerCase()}/`)
      .replace(/\\/g, '/');
  }

  if (expanded.startsWith('\\\\wsl$\\') || expanded.startsWith('//wsl$/')) {
    expanded = expanded.replace(/^\\\\wsl\$\\/i, '/mnt/').replace(/^\/\/wsl\$\//i, '/mnt/');
    expanded = expanded.replace(/\\/g, '/');
    expanded = expanded.replace(
      /^\/mnt\/([^/]+)\//,
      (_: string, d: string) => `/mnt/${d.toLowerCase()}/`,
    );
  }

  return expanded;
}
