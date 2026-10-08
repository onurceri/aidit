import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Globe,
  FolderGit2,
  BookOpen,
  Loader,
  AlertTriangle,
  RefreshCw,
  Plus,
  Search,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
} from 'lucide-react';
import {
  fetchSkills,
  saveSkillFile,
  type SkillsResponse,
  type SkillsDirResult,
  type SkillFile,
} from '../api/client';
import { useWatcher } from '../hooks/useWatcher';
import { getAgentIcon } from '../lib/icons';
import { SkillPreview } from '../components/SkillPreview';
import { SkillEditor } from '../components/SkillEditor';
import { displayPath } from '../lib/paths';
import { Page, SplitView, EmptyState } from '../components/Layout';

type Scope = 'global' | 'project';

function groupTitle(group: SkillsDirResult): string {
  if (group.agentLabel) return group.agentLabel;
  const parts = group.absolutePath.replace(/\/+$/, '').split('/');
  return parts.slice(-2).join('/');
}

const COLLAPSED_KEY = 'aidit-skills-collapsed-v2';

/** Null until the user collapses/expands something; then their choice is remembered. */
function loadCollapsed(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}

function saveCollapsed(collapsed: Set<string>): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    /* storage unavailable — collapse state just won't persist */
  }
}

function newSkillTemplate(name: string): string {
  return `---\nname: ${name}\ndescription: What this skill does and when the agent should use it.\n---\n\n# ${name}\n\n## Instructions\n\n`;
}

export function Skills() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('global');
  const [query, setQuery] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [newSkillDir, setNewSkillDir] = useState<string | null>(null);
  const [savedCollapsed, setCollapsed] = useState<Set<string> | null>(loadCollapsed);
  const didInitScope = useRef(false);
  const { subscribe, unsubscribe } = useWatcher();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSkills();
      setData(result);
      if (!didInitScope.current) {
        if (result.global.length === 0 && result.project.length > 0) setScope('project');
        didInitScope.current = true;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const handler = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => load(), 300);
    };
    subscribe('config:changed', handler);
    return () => {
      unsubscribe('config:changed', handler);
      if (timer) clearTimeout(timer);
    };
  }, [subscribe, unsubscribe, load]);

  const groups = useMemo(
    () => (scope === 'global' ? data?.global : data?.project) ?? [],
    [data, scope],
  );
  const counts = {
    global: data?.global.reduce((n, g) => n + g.skills.length, 0) ?? 0,
    project: data?.project.reduce((n, g) => n + g.skills.length, 0) ?? 0,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((group) => ({
        group,
        skills: q
          ? group.skills.filter((s) =>
              `${s.name} ${s.description} ${groupTitle(group)}`.toLowerCase().includes(q),
            )
          : group.skills,
      }))
      .filter((g) => g.skills.length > 0);
  }, [groups, query]);

  const selected = useMemo(() => {
    for (const group of groups) {
      const skill = group.skills.find((s) => s.absolutePath === selectedPath);
      if (skill) return { skill, group };
    }
    return null;
  }, [groups, selectedPath]);

  // Keep a skill selected so the detail pane is never empty when there are skills.
  useEffect(() => {
    if (!selected && filtered[0]) setSelectedPath(filtered[0].skills[0].absolutePath);
  }, [selected, filtered]);

  const select = (skill: SkillFile) => {
    setSelectedPath(skill.absolutePath);
    setNewSkillDir(null);
  };

  const description = `${counts.global + counts.project} skills across ${(data?.global.length ?? 0) + (data?.project.length ?? 0)} folders`;

  if (loading && !data) {
    return (
      <Page title="Skills" description="Agent Skills (SKILL.md) on this machine" bare>
        <div className="flex-1 flex items-center justify-center">
          <Loader className="w-5 h-5 text-fg-2 animate-spin" />
        </div>
      </Page>
    );
  }

  if (error) {
    return (
      <Page title="Skills">
        <div className="card">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load skills"
            action={
              <button onClick={load} className="btn-secondary btn-sm">
                <RefreshCw className="w-3.5 h-3.5" />
                Retry
              </button>
            }
          >
            {error}
          </EmptyState>
        </div>
      </Page>
    );
  }

  // Default view: only the first folder is expanded.
  const collapsed = savedCollapsed ?? new Set(groups.slice(1).map((g) => g.absolutePath));
  const updateCollapsed = (next: Set<string>) => {
    setCollapsed(next);
    saveCollapsed(next);
  };
  const toggleGroup = (path: string) => {
    const next = new Set(collapsed);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    updateCollapsed(next);
  };
  const searching = query.trim().length > 0;
  const allCollapsed =
    filtered.length > 0 && filtered.every((g) => collapsed.has(g.group.absolutePath));
  const toggleAll = () => {
    const next = new Set(collapsed);
    for (const { group } of filtered) {
      if (allCollapsed) next.delete(group.absolutePath);
      else next.add(group.absolutePath);
    }
    updateCollapsed(next);
  };

  const aside = (
    <>
      <div className="p-3 space-y-2 border-b border-border">
        <div className="segmented w-full">
          {(['global', 'project'] as const).map((value) => (
            <button
              key={value}
              onClick={() => {
                setScope(value);
                setSelectedPath(null);
                setNewSkillDir(null);
              }}
              className={`segment flex-1 justify-center ${scope === value ? 'segment-active' : ''}`}
            >
              {value === 'global' ? (
                <Globe className="w-3 h-3" />
              ) : (
                <FolderGit2 className="w-3 h-3" />
              )}
              {value === 'global' ? 'Global' : 'Project'}
              <span className="text-fg-3 tabular-nums">{counts[value]}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="relative block flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-3" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter skills…"
              className="input h-8 pl-8"
            />
          </label>
          <button
            type="button"
            onClick={toggleAll}
            disabled={filtered.length === 0 || searching}
            className="btn-icon flex-shrink-0"
            title={allCollapsed ? 'Expand all' : 'Collapse all'}
            aria-label={allCollapsed ? 'Expand all groups' : 'Collapse all groups'}
          >
            {allCollapsed ? (
              <ChevronsUpDown className="w-4 h-4" />
            ) : (
              <ChevronsDownUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2.5 py-6 text-xs text-fg-3">
            {query
              ? `No skills match “${query}”.`
              : scope === 'project'
                ? 'No project skills in this directory.'
                : 'No global skills found.'}
          </p>
        ) : null}
        {filtered.map(({ group, skills }) => {
          const Icon = group.agentId ? getAgentIcon(group.agentId) : BookOpen;
          // While filtering, always show matches.
          const open = searching || !collapsed.has(group.absolutePath);
          return (
            <div key={group.absolutePath}>
              <div className="section-label section-label-sticky" title={group.absolutePath}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.absolutePath)}
                  disabled={searching}
                  aria-expanded={open}
                  className="flex flex-1 items-center gap-1.5 normal-case tracking-normal text-xs font-medium text-fg-2 hover:text-fg min-w-0 text-left disabled:opacity-100 disabled:cursor-default"
                >
                  <ChevronRight
                    className={`w-3 h-3 flex-shrink-0 text-fg-3 transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" strokeWidth={1.75} />
                  <span className="truncate">{groupTitle(group)}</span>
                </button>
                <span className="flex items-center gap-1">
                  {scope === 'project' ? (
                    <button
                      onClick={() => setNewSkillDir(group.absolutePath)}
                      className="btn-icon w-5 h-5"
                      title={`New skill in ${displayPath(group.absolutePath)}`}
                      aria-label="New skill"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  ) : null}
                  {skills.length}
                </span>
              </div>
              {open
                ? skills.map((skill) => {
                    const active = skill.absolutePath === selectedPath && !newSkillDir;
                    return (
                      <button
                        key={skill.absolutePath}
                        onClick={() => select(skill)}
                        className={`list-row flex-col !items-start !gap-0 ${active ? 'list-row-active' : ''}`}
                      >
                        <span
                          className={`w-full truncate text-sm ${active ? 'text-fg font-medium' : 'text-fg'}`}
                        >
                          {skill.name}
                        </span>
                        {skill.description ? (
                          <span className="w-full truncate text-xs text-fg-3">
                            {skill.description}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                : null}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <Page title="Skills" description={description} bare>
      <SplitView aside={aside}>
        {newSkillDir ? (
          <div className="p-6 h-full flex flex-col">
            <SkillEditor
              filename=""
              initialContent={newSkillTemplate('my-skill')}
              isNew
              skillsDir={newSkillDir}
              onSave={async (content, name) => {
                const slug = (name ?? 'my-skill').trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
                const path = `${newSkillDir}/${slug}/SKILL.md`;
                await saveSkillFile(path, content);
                setNewSkillDir(null);
                setSelectedPath(path);
                await load();
              }}
              onClose={() => setNewSkillDir(null)}
            />
          </div>
        ) : selected ? (
          <SkillPreview
            key={selected.skill.absolutePath}
            skill={selected.skill}
            group={selected.group}
            onSaved={load}
          />
        ) : (
          <EmptyState icon={BookOpen} title="No skills here yet">
            Skills are folders containing a <code className="code">SKILL.md</code>. aidit looks in
            every agent&apos;s skills directory, including the shared{' '}
            <code className="code">~/.agents/skills</code>.
          </EmptyState>
        )}
      </SplitView>
    </Page>
  );
}
