import { useEffect, useState, useCallback, useRef } from 'react';
import { Moon, Sun, Search } from 'lucide-react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { WsProvider } from './context/WsContext';
import { ScanProvider } from './context/ScanContext';
import { ToastProvider } from './context/ToastContext';
import { useScan } from './hooks/useScan';
import { useWatcher } from './hooks/useWatcher';
import { LiveIndicator } from './components/LiveIndicator';
import { CommandPalette } from './components/CommandPalette';
import { Overview } from './routes/Overview';
import { McpConfig } from './routes/McpConfig';
import { Skills } from './routes/Skills';
import { DiffSync } from './routes/DiffSync';
import { Settings } from './routes/Settings';
import { PathRegistry } from './routes/PathRegistry';
import type { WsEvent } from './api/client';

type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'aidit-theme-mode';

const NAV_ITEMS = [
  { to: '/', label: 'Agents', end: true },
  { to: '/mcp', label: 'MCP' },
  { to: '/skills', label: 'Skills' },
  { to: '/diff', label: 'Compare' },
  { to: '/settings', label: 'Settings' },
];

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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="h-full w-full max-w-6xl mx-auto px-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-8">
            <NavLink to="/" className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-md bg-fg text-accent-fg flex items-center justify-center text-xs font-semibold tracking-tight">
                ai
              </div>
              <span className="text-base font-semibold tracking-tight text-fg">aidit</span>
            </NavLink>

            <nav className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `px-3 h-9 inline-flex items-center text-sm font-medium rounded-md transition-colors ${
                      isActive
                        ? 'text-fg bg-surface-3'
                        : 'text-fg-2 hover:text-fg hover:bg-hover'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleThemeMode}
              className="btn-ghost"
              aria-label={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
              title={`Switch to ${themeMode === 'dark' ? 'light' : 'dark'} theme`}
            >
              {themeMode === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="hidden sm:inline">{themeMode === 'dark' ? 'Light' : 'Dark'}</span>
            </button>
            <div className="hidden md:flex items-center gap-1.5 text-[11px] text-fg-2 px-2">
              <Search className="w-3 h-3" />
              <kbd className="font-mono text-[11px] px-1 py-0.5 rounded bg-surface-3 border border-border">
                ⌘K
              </kbd>
            </div>
            <div className="hidden md:block w-px h-5 bg-border" />
            <LiveIndicator />
          </div>
        </div>
      </header>

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
