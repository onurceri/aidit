import type { DialectId } from './dialects.js';

export interface ScanResult {
  scannedAt: string;
  workingDirectory: string;
  /** User home directory, so the UI can display paths as `~/…`. */
  homeDir: string;
  os: 'macos' | 'linux' | 'windows-wsl';
  agents: AgentResult[];
  projectConfigs: ConfigResult[];
  errors: ScanError[];
}

export interface AgentResult {
  id: string;
  label: string;
  homepage?: string;
  found: boolean;
  configs: ConfigResult[];
  skillsDirs: SkillsDirResult[];
}

export interface ConfigResult {
  pathEntryId: string;
  absolutePath: string;
  scope: 'global' | 'project';
  format: ConfigFormat;
  raw: string;
  parsed: object | null;
  /** MCP layout detected for this file, or null when it holds no MCP servers. */
  dialect: DialectId | null;
  /** Whether aidit can add servers to this file through the structured editor. */
  canAddServers: boolean;
  /** Whether servers in this file can be enabled/disabled without deleting them. */
  canToggleServers: boolean;
  mcpServers: McpServer[];
  parseError: string | null;
  lastModified: string;
  sizeBytes: number;
  firstSeenAt?: string;
}

export type ConfigFormat = 'json' | 'jsonc' | 'yaml' | 'toml';

export type McpTransport = 'stdio' | 'sse' | 'http' | 'unknown';

export interface McpServer {
  name: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  enabled: boolean;
  control: McpServerControl;
  raw: object;
}

export interface McpServerControl {
  dialect: DialectId;
  collectionPath: string;
  canToggle: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface SkillsDirResult {
  absolutePath: string;
  scope: 'global' | 'project';
  /** Owning agent, when the directory belongs to one. */
  agentId?: string | null;
  agentLabel?: string;
  skills: SkillFile[];
}

export interface SkillFile {
  /** Skill name from SKILL.md frontmatter, falling back to the folder name. */
  name: string;
  description: string;
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
