import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Moon,
  Sun,
  Search,
  LayoutGrid,
  Plug,
  BookOpen,
  GitCompareArrows,
  Settings as SettingsIcon,
  type LucideIcon,
} from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { WsProvider } from './context/WsContext';
import { ScanProvider } from './context/ScanContext';
import { ToastProvider } from './context/ToastContext';
import { useScan } from './hooks/useScan';
import { useWatcher } from './hooks/useWatcher';
import { LiveIndicator } from './components/LiveIndicator';
import { CommandPalette, OPEN_PALETTE_EVENT } from './components/CommandPalette';
import { Overview } from './routes/Overview';
import { McpConfig } from './routes/McpConfig';
import { Skills } from './routes/Skills';
import { DiffSync } from './routes/DiffSync';
import { Settings } from './routes/Settings';
import { PathRegistry } from './routes/PathRegistry';
import type { WsEvent } from './api/client';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'aidit-theme-mode';

type NavCounts = { agents: number; servers: number; skills: number };

const NAV_ITEMS: {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  count?: keyof NavCounts;
}[] = [
  { to: '/', label: 'Agents', icon: LayoutGrid, end: true, count: 'agents' },
  { to: '/mcp', label: 'MCP servers', icon: Plug, count: 'servers' },
  { to: '/skills', label: 'Skills', icon: BookOpen, count: 'skills' },
  { to: '/diff', label: 'Compare & sync', icon: GitCompareArrows },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

function useNavCounts(): NavCounts | null {
  const { scanResult } = useScan();
  if (!scanResult) return null;
  const found = scanResult.agents.filter((a) => a.found);
  return {
    agents: found.length,
    servers: found.reduce((n, a) => n + a.configs.reduce((m, c) => m + c.mcpServers.length, 0), 0),
    skills: found.reduce((n, a) => n + a.skillsDirs.reduce((m, d) => m + d.skills.length, 0), 0),
  };
}

function Logo() {
  return (
    <NavLink to="/" className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-md bg-fg text-accent-fg flex items-center justify-center text-[11px] font-bold tracking-tight">
        ai
      </div>
      <span className="text-sm font-semibold tracking-tight text-fg">aidit</span>
    </NavLink>
  );
}

function RegistryUpdateNotifier() {
  const { subscribe, unsubscribe } = useWatcher();
  const { refresh } = useScan();
  const [notification, setNotification] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEvent = useCallback(
    (event: WsEvent) => {
      if (event.event === 'registry:updated') {
        setNotification('Path registry was updated. Scanning with new paths...');
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          refresh();
          setNotification(null);
        }, 800);
      }
    },
    [refresh],
  );

  useEffect(() => {
    subscribe('registry:updated', handleEvent);
    return () => {
      unsubscribe('registry:updated', handleEvent);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [subscribe, unsubscribe, handleEvent]);

  if (!notification) return null;

  return (
    <div className="fixed top-16 right-4 z-50 px-3 py-2 bg-surface border border-border-strong rounded-md text-xs text-fg shadow-md">
      {notification}
    </div>
  );
}

function AppShell() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'dark';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.classList.toggle('dark', themeMode === 'dark');
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  const toggleThemeMode = useCallback(() => {
    setThemeMode((current) => (current === 'dark' ? 'light' : 'dark'));
  }, []);

  const counts = useNavCounts();
  const openPalette = () => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT));
  const themeLabel = `Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`;

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="h-16 flex items-center px-4 border-b border-border">
          <Logo />
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={openPalette}
            className="w-full flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-surface text-xs text-fg-3 hover:text-fg-2 hover:border-border-strong transition-colors"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Search…</span>
            <kbd className="font-mono text-[10px] px-1 rounded bg-surface-3 border border-border">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="flex-1 px-3 space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
            >
              <item.icon className="w-4 h-4" strokeWidth={1.75} />
              <span className="flex-1">{item.label}</span>
              {item.count && counts ? (
                <span className="text-[11px] tabular-nums text-fg-3">{counts[item.count]}</span>
              ) : null}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border flex items-center justify-between">
          <LiveIndicator />
          <button
            type="button"
            onClick={toggleThemeMode}
            className="btn-icon"
            aria-label={themeLabel}
            title={themeLabel}
          >
            {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </aside>

      <div className="app-topbar">
        <div className="mr-2">
          <Logo />
        </div>
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `nav-item whitespace-nowrap ${isActive ? 'nav-item-active' : ''}`
            }
          >
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          onClick={toggleThemeMode}
          className="btn-icon ml-auto flex-shrink-0"
          aria-label={themeLabel}
        >
          {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/mcp" element={<McpConfig />} />
          <Route path="/mcp/:agentId" element={<McpConfig />} />
          <Route path="/skills" element={<Skills />} />
          <Route path="/diff" element={<DiffSync />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/settings/paths" element={<PathRegistry />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <CommandPalette />
      <RegistryUpdateNotifier />
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <WsProvider>
          <ScanProvider>
            <AppShell />
          </ScanProvider>
        </WsProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
