export interface ScanResult {
  scannedAt: string;
  workingDirectory: string;
  os: 'macos' | 'linux' | 'windows-wsl';
  agents: AgentResult[];
  projectConfigs: ConfigResult[];
  errors: ScanError[];
}

export interface AgentResult {
  id: string;
  label: string;
  found: boolean;
  configs: ConfigResult[];
  skillsDirs: SkillsDirResult[];
}

export interface ConfigResult {
  pathEntryId: string;
  absolutePath: string;
  scope: 'global' | 'project';
  format: 'json' | 'jsonc' | 'yaml';
  raw: string;
  parsed: object | null;
  mcpServers: McpServer[];
  parseError: string | null;
  lastModified: string;
  sizeBytes: number;
  firstSeenAt?: string;
}

export interface McpServer {
  name: string;
  transport: 'stdio' | 'sse' | 'http' | 'unknown';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  enabled: boolean;
  control: McpServerControl;
  raw: object;
}

export interface McpServerControl {
  collectionPath: string;
  enableMode: 'disabled-array-or-entry-disabled' | 'entry-enabled' | 'none';
  canToggle: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface SkillsDirResult {
  absolutePath: string;
  scope: 'global' | 'project';
  skills: SkillFile[];
}

export interface SkillFile {
  filename: string;
  absolutePath: string;
  sizeBytes: number;
  lastModified: string;
  previewLines: string[];
}

export interface ScanError {
  pathEntryId?: string;
  absolutePath?: string;
  message: string;
}

export interface SkillsResponse {
  global: SkillsDirResult[];
  project: SkillsDirResult[];
}

export interface SkillFileResponse {
  path: string;
  content: string;
  lastModified: string;
}

export interface BackupEntry {
  filename: string;
  absolutePath: string;
  sizeBytes: number;
  createdAt: string;
}

export interface ConfigBackups {
  pathEntryId: string;
  label: string;
  backups: BackupEntry[];
}

export interface AllBackupsResponse {
  backups: ConfigBackups[];
  backupDir: string;
}

export interface PathEntry {
  id: string;
  label: string;
  path: string;
  type: 'mcp-config' | 'skills-dir' | 'unknown';
  agent: string | null;
  scope: 'global' | 'project';
  source: 'builtin' | 'user';
  enabled: boolean;
}

export interface PathRegistry {
  version: number;
  entries: PathEntry[];
}

export interface WsEvent {
  event: 'config:changed' | 'scan:full' | 'scan:partial' | 'registry:updated';
  pathEntryId?: string;
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? 'unknown', body.message ?? res.statusText);
  }
  return res.json();
}

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function fetchScan(): Promise<ScanResult> {
  return request<ScanResult>('/api/scan');
}

export function fetchConfig(id: string): Promise<ConfigResult> {
  return request<ConfigResult>(`/api/config/${id}`);
}

export function fetchSkills(): Promise<SkillsResponse> {
  return request<SkillsResponse>('/api/skills');
}

export function fetchSkillFile(path: string): Promise<SkillFileResponse> {
  return request<SkillFileResponse>(`/api/skills/file?path=${encodeURIComponent(path)}`);
}

export function fetchPaths(): Promise<PathRegistry> {
  return request<PathRegistry>('/api/paths');
}

export function patchConfig(
  id: string,
  content: string,
  format: 'json' | 'jsonc' | 'yaml',
): Promise<ConfigResult> {
  return request<ConfigResult>(`/api/config/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, format }),
  });
}

export function fetchBackups(id: string): Promise<{ pathEntryId: string; backups: BackupEntry[] }> {
  return request<{ pathEntryId: string; backups: BackupEntry[] }>(`/api/backups/${id}`);
}

export function restoreBackup(id: string, filename: string): Promise<ConfigResult> {
  return request<ConfigResult>(`/api/backups/${id}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename }),
  });
}

export function putPaths(registry: PathRegistry): Promise<PathRegistry> {
  return request<PathRegistry>('/api/paths', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(registry),
  });
}

export function testPath(
  path: string,
): Promise<{ resolved: string; found: boolean; matches: string[] }> {
  return request<{ resolved: string; found: boolean; matches: string[] }>('/api/paths/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
}

export function saveSkillFile(path: string, content: string): Promise<SkillFileResponse> {
  return request<SkillFileResponse>('/api/skills/file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
}

export function resetEntry(id: string): Promise<PathRegistry> {
  return request<PathRegistry>('/api/paths/reset-entry', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  });
}

export function resetBuiltins(): Promise<PathRegistry> {
  return request<PathRegistry>('/api/paths/reset-builtins', { method: 'POST' });
}

export interface ImportResult {
  added: number;
  skipped: number;
  errors: string[];
  registry: PathRegistry;
}

export async function exportPaths(): Promise<void> {
  const res = await fetch('/api/paths/export');
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'aidit-path-registry.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importPaths(file: File): Promise<ImportResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const json = JSON.parse(reader.result as string);
        const result = await request<ImportResult>('/api/paths/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(json),
        });
        resolve(result);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function fetchAllBackups(): Promise<AllBackupsResponse> {
  return request<AllBackupsResponse>('/api/backups');
}

export function fetchSettings(): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/settings');
}

export function updateSetting(key: string, value: unknown): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
}

export function openBackupFolder(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('/api/settings/open-backup-folder', { method: 'POST' });
}

export interface WriteLogHistoryEntry {
  id: number;
  writtenAt: string;
  trigger: 'user_form' | 'user_json' | 'sync' | 'restore';
  backupPath: string;
  contentBeforePreview: string;
  contentAfterPreview: string;
}

export interface ConfigHistoryResponse {
  pathEntryId: string;
  entries: WriteLogHistoryEntry[];
}

export interface ConfigHistoryDetail {
  id: number;
  writtenAt: string;
  trigger: 'user_form' | 'user_json' | 'sync' | 'restore';
  contentBefore: string;
  contentAfter: string;
}

export function fetchConfigHistory(pathEntryId: string): Promise<ConfigHistoryResponse> {
  return request<ConfigHistoryResponse>(`/api/config/${pathEntryId}/history`);
}

export function fetchConfigHistoryDetail(
  pathEntryId: string,
  writeLogId: number,
): Promise<ConfigHistoryDetail> {
  return request<ConfigHistoryDetail>(`/api/config/${pathEntryId}/history/${writeLogId}`);
}

export function restoreHistory(pathEntryId: string, writeLogId: number): Promise<ConfigResult> {
  return request<ConfigResult>(`/api/config/${pathEntryId}/history/${writeLogId}/restore`, {
    method: 'POST',
  });
}
