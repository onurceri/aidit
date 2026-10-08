import type { DialectId, DialectOptions } from '../scanner/dialects.js';

export interface AgentInfo {
  id: string;
  label: string;
  homepage: string;
  /** MCP layout used by this agent's config files. */
  dialect: DialectId;
  dialectOptions?: DialectOptions;
}

/**
 * Catalog of agents aidit knows about. Paths live in `builtins.ts`; this file holds
 * per-agent metadata. Keep ids stable — they are stored in users' path registries.
 */
export const AGENTS: AgentInfo[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    homepage: 'https://code.claude.com/docs',
    dialect: 'mcp-servers',
  },
  {
    id: 'claude-desktop',
    label: 'Claude Desktop',
    homepage: 'https://claude.ai/download',
    dialect: 'mcp-servers',
  },
  {
    id: 'codex',
    label: 'OpenAI Codex',
    homepage: 'https://developers.openai.com/codex',
    dialect: 'codex',
  },
  {
    id: 'antigravity',
    label: 'Google Antigravity',
    homepage: 'https://antigravity.google',
    dialect: 'mcp-servers',
    dialectOptions: { remoteUrlKey: 'serverUrl', toggle: true },
  },
  {
    id: 'gemini-cli',
    label: 'Gemini CLI (legacy)',
    homepage: 'https://geminicli.com',
    dialect: 'mcp-servers',
    dialectOptions: { remoteUrlKey: 'httpUrl' },
  },
  {
    id: 'github-copilot-cli',
    label: 'GitHub Copilot CLI',
    homepage: 'https://docs.github.com/en/copilot/how-tos/copilot-cli',
    dialect: 'mcp-servers',
  },
  {
    id: 'vscode-copilot',
    label: 'VS Code (Copilot)',
    homepage: 'https://code.visualstudio.com/docs/copilot/customization/mcp-servers',
    dialect: 'vscode',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    homepage: 'https://cursor.com/docs',
    dialect: 'mcp-servers',
  },
  {
    id: 'windsurf',
    label: 'Devin Desktop (Windsurf)',
    homepage: 'https://docs.devin.ai/desktop',
    dialect: 'mcp-servers',
    dialectOptions: { remoteUrlKey: 'serverUrl' },
  },
  {
    id: 'kiro',
    label: 'Kiro',
    homepage: 'https://kiro.dev/docs',
    dialect: 'mcp-servers',
    dialectOptions: { toggle: true },
  },
  {
    id: 'amazon-q',
    label: 'Amazon Q Developer',
    homepage: 'https://aws.amazon.com/q/developer/',
    dialect: 'mcp-servers',
    dialectOptions: { toggle: true },
  },
  {
    id: 'cline',
    label: 'Cline',
    homepage: 'https://docs.cline.bot',
    dialect: 'mcp-servers',
    dialectOptions: { toggle: true },
  },
  {
    id: 'roo-code',
    label: 'Roo Code (archived)',
    homepage: 'https://github.com/RooCodeInc/Roo-Code',
    dialect: 'mcp-servers',
    dialectOptions: { toggle: true },
  },
  {
    id: 'kilo-code',
    label: 'Kilo Code',
    homepage: 'https://kilo.ai/docs',
    dialect: 'opencode',
  },
  {
    id: 'continue',
    label: 'Continue',
    homepage: 'https://docs.continue.dev',
    dialect: 'continue',
  },
  {
    id: 'zed',
    label: 'Zed',
    homepage: 'https://zed.dev/docs/ai/mcp',
    dialect: 'zed',
  },
  {
    id: 'opencode',
    label: 'opencode',
    homepage: 'https://opencode.ai/docs',
    dialect: 'opencode',
  },
  {
    id: 'crush',
    label: 'Crush',
    homepage: 'https://github.com/charmbracelet/crush',
    dialect: 'crush',
  },
  {
    id: 'amp',
    label: 'Amp',
    homepage: 'https://ampcode.com/manual',
    dialect: 'amp',
  },
  {
    id: 'goose',
    label: 'Goose',
    homepage: 'https://goose-docs.ai',
    dialect: 'goose',
  },
  {
    id: 'qwen-code',
    label: 'Qwen Code',
    homepage: 'https://qwenlm.github.io/qwen-code-docs/',
    dialect: 'mcp-servers',
    dialectOptions: { remoteUrlKey: 'httpUrl' },
  },
  {
    id: 'factory',
    label: 'Factory Droid',
    homepage: 'https://docs.factory.com',
    dialect: 'mcp-servers',
    dialectOptions: { toggle: true },
  },
  {
    id: 'augment',
    label: 'Augment (Auggie)',
    homepage: 'https://docs.augmentcode.com',
    dialect: 'mcp-servers',
  },
  {
    id: 'junie',
    label: 'JetBrains Junie',
    homepage: 'https://junie.jetbrains.com/docs/',
    dialect: 'mcp-servers',
  },
  {
    id: 'warp',
    label: 'Warp',
    homepage: 'https://docs.warp.dev',
    dialect: 'mcp-servers',
  },
  {
    id: 'mistral-vibe',
    label: 'Mistral Vibe',
    homepage: 'https://github.com/mistralai/mistral-vibe',
    dialect: 'vibe',
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    homepage: 'https://moonshotai.github.io/kimi-cli/',
    dialect: 'mcp-servers',
  },
  {
    id: 'grok',
    label: 'Grok Build',
    homepage: 'https://docs.x.ai',
    dialect: 'codex',
  },
  {
    id: 'trae',
    label: 'Trae',
    homepage: 'https://trae.ai',
    dialect: 'mcp-servers',
  },
  {
    id: 'lm-studio',
    label: 'LM Studio',
    homepage: 'https://lmstudio.ai/docs/app/mcp',
    dialect: 'mcp-servers',
  },
  {
    id: 'agent-skills',
    label: 'Shared Agent Skills (.agents)',
    homepage: 'https://agentskills.io',
    dialect: 'mcp-servers',
  },
];

const BY_ID = new Map(AGENTS.map((agent) => [agent.id, agent]));

export function getAgentInfo(id: string | null | undefined): AgentInfo | undefined {
  return id ? BY_ID.get(id) : undefined;
}
