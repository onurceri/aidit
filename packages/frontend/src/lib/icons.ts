import {
  Monitor,
  Terminal,
  Code,
  Bot,
  MousePointer,
  Wind,
  Zap,
  Bird,
  ArrowRight,
  Wand,
  Layout,
  Rocket,
  Lock,
  Puzzle,
  Cloud,
  Github,
  Brain,
  Table,
  PenTool,
  FastForward,
  Circle,
  type LucideIcon,
} from 'lucide-react';

export interface AgentFamilyMeta {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  'claude-desktop': Monitor,
  'claude-code': Terminal,
  cursor: MousePointer,
  windsurf: Wind,
  'vscode-copilot': Code,
  goose: Bird,
  cline: Zap,
  'roo-code': Zap,
  continue: ArrowRight,
  aider: Wand,
  zed: Layout,
  trae: Rocket,
  opencode: Lock,
  augment: Puzzle,
  'amazon-q': Cloud,
  'github-copilot-cli': Github,
  supermaven: Brain,
  tabnine: Table,
  jetbrains: PenTool,
  warp: FastForward,
  void: Circle,
};

export const DEFAULT_AGENT_ICON = Code;

const DEFAULT_AGENT_FAMILY: AgentFamilyMeta = {
  id: 'standalone',
  label: 'Standalone',
  icon: DEFAULT_AGENT_ICON,
};

export const AGENT_FAMILY_MAP: Record<string, AgentFamilyMeta> = {
  'claude-desktop': {
    id: 'claude',
    label: 'Claude',
    icon: Bot,
  },
  'claude-code': {
    id: 'claude',
    label: 'Claude',
    icon: Bot,
  },
  'vscode-copilot': {
    id: 'vscode',
    label: 'VS Code',
    icon: Code,
  },
  cursor: {
    id: 'cursor',
    label: 'Cursor',
    icon: MousePointer,
  },
  windsurf: {
    id: 'windsurf',
    label: 'Windsurf',
    icon: Wind,
  },
  goose: {
    id: 'goose',
    label: 'Goose',
    icon: Bird,
  },
  cline: {
    id: 'cline',
    label: 'Cline',
    icon: Zap,
  },
  'roo-code': {
    id: 'roo',
    label: 'Roo',
    icon: Zap,
  },
  continue: {
    id: 'continue',
    label: 'Continue',
    icon: ArrowRight,
  },
  aider: {
    id: 'aider',
    label: 'Aider',
    icon: Wand,
  },
  zed: {
    id: 'zed',
    label: 'Zed',
    icon: Layout,
  },
  trae: {
    id: 'trae',
    label: 'Trae',
    icon: Rocket,
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    icon: Lock,
  },
  augment: {
    id: 'augment',
    label: 'Augment',
    icon: Puzzle,
  },
  'amazon-q': {
    id: 'amazon-q',
    label: 'Amazon Q',
    icon: Cloud,
  },
  'github-copilot-cli': {
    id: 'github-copilot',
    label: 'GitHub Copilot',
    icon: Github,
  },
  supermaven: {
    id: 'supermaven',
    label: 'Supermaven',
    icon: Brain,
  },
  tabnine: {
    id: 'tabnine',
    label: 'Tabnine',
    icon: Table,
  },
  jetbrains: {
    id: 'jetbrains',
    label: 'JetBrains',
    icon: PenTool,
  },
  warp: {
    id: 'warp',
    label: 'Warp',
    icon: FastForward,
  },
  void: {
    id: 'void',
    label: 'Void',
    icon: Circle,
  },
};

export function getAgentIcon(agentId: string): LucideIcon {
  return AGENT_ICON_MAP[agentId] ?? DEFAULT_AGENT_ICON;
}

export function getAgentFamily(agentId: string): AgentFamilyMeta {
  return AGENT_FAMILY_MAP[agentId] ?? {
    ...DEFAULT_AGENT_FAMILY,
    id: agentId,
    label: agentId,
  };
}
