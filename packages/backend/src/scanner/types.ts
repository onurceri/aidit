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
