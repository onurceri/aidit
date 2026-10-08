let homeDir: string | null = null;

/** Called by ScanContext whenever a scan result arrives. */
export function setHomeDir(dir: string | undefined): void {
  homeDir = dir ? dir.replace(/\/+$/, '') : null;
}

/** Shows paths under the user's home directory as `~/…`. */
export function displayPath(path: string): string {
  if (homeDir && (path === homeDir || path.startsWith(`${homeDir}/`))) {
    return `~${path.slice(homeDir.length)}`;
  }
  return path.replace(/^\/(Users|home)\/[^/]+/, '~');
}
