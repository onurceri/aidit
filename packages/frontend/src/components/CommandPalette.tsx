import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import { Search, Zap, BookOpen, GitCompare, Settings, Database, LayoutDashboard } from 'lucide-react';
import { useScan } from '../hooks/useScan';
import { getAgentIcon } from '../lib/icons';
import type { AgentResult } from '../api/client';

interface Action {
  id: string;
  label: string;
  icon: React.ReactNode;
  keywords: string[];
  onSelect: () => void;
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  const { scanResult } = useScan();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const runAction = useCallback((fn: () => void) => {
    setOpen(false);
    setSearch('');
    fn();
  }, []);

  const actions: Action[] = [
    {
      id: 'agents',
      label: 'Agents',
      icon: <LayoutDashboard className="w-4 h-4" />,
      keywords: ['home', 'overview', 'dashboard'],
      onSelect: () => runAction(() => navigate('/')),
    },
    {
      id: 'mcp',
      label: 'MCP Config',
      icon: <Zap className="w-4 h-4" />,
      keywords: ['servers', 'configuration'],
      onSelect: () => runAction(() => navigate('/mcp')),
    },
    {
      id: 'skills',
      label: 'Skills',
      icon: <BookOpen className="w-4 h-4" />,
      keywords: ['prompts', 'instructions'],
      onSelect: () => runAction(() => navigate('/skills')),
    },
    {
      id: 'diff',
      label: 'Compare & Sync',
      icon: <GitCompare className="w-4 h-4" />,
      keywords: ['compare', 'sync', 'diff'],
      onSelect: () => runAction(() => navigate('/diff')),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-4 h-4" />,
      keywords: ['preferences', 'backups'],
      onSelect: () => runAction(() => navigate('/settings')),
    },
    {
      id: 'path-registry',
      label: 'Path Registry',
      icon: <Database className="w-4 h-4" />,
      keywords: ['paths', 'directories'],
      onSelect: () => runAction(() => navigate('/settings/paths')),
    },
  ];

  const agentItems =
    scanResult?.agents
      .filter((a: AgentResult) => a.found)
      .sort((a: AgentResult, b: AgentResult) => a.label.localeCompare(b.label))
      .map((agent: AgentResult) => {
        const Icon = getAgentIcon(agent.id);
        return {
          id: `agent:${agent.id}`,
          label: `MCP: ${agent.label}`,
          icon: <Icon className="w-4 h-4" />,
          keywords: [agent.label, agent.id, 'mcp config'],
        };
      }) ?? [];

  const filteredAgents = agentItems.filter(
    (item) =>
      !search ||
      item.label.toLowerCase().includes(search.toLowerCase()) ||
      item.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase())),
  );

  const filteredActions = search
    ? actions.filter(
        (a) =>
          a.label.toLowerCase().includes(search.toLowerCase()) ||
          a.keywords.some((k) => k.toLowerCase().includes(search.toLowerCase())),
      )
    : actions;

  const hasResults = filteredActions.length > 0 || filteredAgents.length > 0;

  return (
    <>
      <Command.Dialog
        open={open}
        onOpenChange={setOpen}
        label="Command Palette"
        className="fixed inset-0 z-50"
      >
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div className="relative flex items-start justify-center pt-[20vh] px-4">
          <div className="w-full max-w-lg bg-surface border border-border rounded-md overflow-hidden shadow-md">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Search className="w-4 h-4 text-fg-3 flex-shrink-0" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search actions and agents…"
                className="flex-1 bg-transparent text-sm text-fg placeholder:text-fg-3 outline-none"
                autoFocus
              />
              <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-surface-3 border border-border text-fg-2">
                esc
              </kbd>
            </div>

            <Command.List className="max-h-80 overflow-y-auto p-2">
              {!hasResults && (
                <div className="py-10 text-center text-sm text-fg-3">No results</div>
              )}

              {filteredActions.length > 0 && (
                <Command.Group
                  heading="Actions"
                  className="pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-2 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {filteredActions.map((action) => (
                    <Command.Item
                      key={action.id}
                      value={action.id}
                      onSelect={action.onSelect}
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-hover"
                    >
                      <span className="text-fg-2 flex-shrink-0">{action.icon}</span>
                      <span>{action.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {filteredAgents.length > 0 && (
                <Command.Group
                  heading="Agents"
                  className="pb-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-2 [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider"
                >
                  {filteredAgents.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      onSelect={() =>
                        runAction(() => navigate(`/mcp/${item.id.replace('agent:', '')}`))
                      }
                      className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-fg aria-selected:bg-hover"
                    >
                      <span className="text-fg-2 flex-shrink-0">{item.icon}</span>
                      <span>{item.label}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
          </div>
        </div>
      </Command.Dialog>
    </>
  );
}
