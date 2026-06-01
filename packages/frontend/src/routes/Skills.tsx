import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Clock,
  HardDrive,
  Globe,
  FolderGit2,
  PackageOpen,
  Loader,
  AlertTriangle,
  RefreshCw,
  BookOpen,
  Plus,
  Lock,
  PenLine,
} from 'lucide-react';
import {
  fetchSkills,
  saveSkillFile,
  type SkillsResponse,
  type SkillsDirResult,
  type SkillFile,
} from '../api/client';
import { useWatcher } from '../hooks/useWatcher';
import { relativeTime } from '../lib/time';
import { SkillPreview } from '../components/SkillPreview';
import { SkillEditor } from '../components/SkillEditor';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function groupLabel(path: string): string {
  const normalized = path.replace(/\/+$/, '');
  const segments = normalized.split('/');
  const last = segments[segments.length - 1];
  if (!last) return 'Unknown';
  const parent = segments[segments.length - 2];
  if (last.toLowerCase() === 'skills' && parent) return parent;
  return last;
}

interface GroupState {
  [key: string]: boolean;
}

export function Skills() {
  const [data, setData] = useState<SkillsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'global' | 'project'>('global');
  const [selectedSkill, setSelectedSkill] = useState<SkillFile | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<SkillsDirResult | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<GroupState>({});
  const [showNewSkill, setShowNewSkill] = useState(false);
  const [newSkillDir, setNewSkillDir] = useState('');
  const didInitializeTab = useRef(false);
  const { subscribe, unsubscribe } = useWatcher();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSkills();
      setData(result);
      if (!didInitializeTab.current) {
        if (result.global.length === 0 && result.project.length > 0) {
          setActiveTab('project');
        }
        didInitializeTab.current = true;
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
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => load(), 300);
    };

    subscribe('config:changed', handler);
    return () => {
      unsubscribe('config:changed', handler);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [subscribe, unsubscribe, load]);

  const groups = activeTab === 'global' ? (data?.global ?? []) : (data?.project ?? []);
  const hasGlobal = (data?.global?.length ?? 0) > 0;
  const hasProject = (data?.project?.length ?? 0) > 0;

  useEffect(() => {
    setSelectedSkill(null);
    setSelectedGroup(null);
    setShowNewSkill(false);
  }, [activeTab]);

  const toggleGroup = (path: string) =>
    setCollapsedGroups((prev) => ({ ...prev, [path]: !prev[path] }));

  const handleSelectSkill = (skill: SkillFile, group: SkillsDirResult) => {
    if (selectedSkill?.absolutePath === skill.absolutePath) {
      setSelectedSkill(null);
      setSelectedGroup(null);
    } else {
      setSelectedSkill(skill);
      setSelectedGroup(group);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader className="w-5 h-5 text-fg-2 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="card p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-fg" />
            <p className="text-sm text-fg">{error}</p>
          </div>
          <button
            onClick={load}
            className="mt-3 btn-secondary btn-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalSkills = groups.reduce((sum, g) => sum + g.skills.length, 0);
  const globalSkillCount = data?.global.reduce((s, g) => s + g.skills.length, 0) ?? 0;
  const projectSkillCount = data?.project.reduce((s, g) => s + g.skills.length, 0) ?? 0;

  if (!data || (!hasGlobal && !hasProject) || totalSkills === 0) {
    return (
      <div className="w-full flex flex-col gap-6">
        <header className="border-b border-border pb-4">
          <h1 className="heading-page">Skills</h1>
          <p className="mt-1 text-sm text-fg-2">
            Index and audit agent instructions, context, and system prompts.
          </p>
        </header>

        <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-surface-2 w-fit">
          {(['global', 'project'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
                activeTab === tab ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
              }`}
            >
              {tab === 'global' ? 'Global' : 'Project'}
            </button>
          ))}
        </div>

        <div className="card flex flex-col items-center justify-center py-20 text-center">
          <PackageOpen className="w-10 h-10 mb-3 text-fg-3" />
          <h3 className="text-sm font-semibold text-fg">No skills found</h3>
          <p className="mt-1 text-sm text-fg-2 max-w-sm">
            {activeTab === 'global'
              ? 'No skills directories mounted in target registry.'
              : 'Workspace scan is unconfigured or inactive.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-6">
      <header className="border-b border-border pb-4">
        <h1 className="heading-page">Skills</h1>
        <p className="mt-1 text-sm text-fg-2">
          Index and audit agent instructions, context, and system prompts.
        </p>
      </header>

      <div className="flex items-center gap-1 p-0.5 rounded-md border border-border bg-surface-2 w-fit">
        <button
          onClick={() => setActiveTab('global')}
          className={`h-7 px-3 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'global' ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
          }`}
        >
          <Globe className="w-3.5 h-3.5" />
          Global
          {hasGlobal ? <span className="text-fg-3">{globalSkillCount}</span> : null}
        </button>
        <button
          onClick={() => setActiveTab('project')}
          className={`h-7 px-3 rounded text-xs font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'project' ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
          }`}
        >
          <FolderGit2 className="w-3.5 h-3.5" />
          Project
          {hasProject ? <span className="text-fg-3">{projectSkillCount}</span> : null}
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div
          className={`flex-1 min-w-0 ${selectedSkill ? 'lg:max-w-[45%] lg:h-[calc(100vh-240px)] lg:overflow-auto lg:pr-2' : 'w-full'}`}
        >
          <div className="space-y-4">
            {groups.length === 0 ? (
              <div className="card flex flex-col items-center justify-center py-16 text-center">
                <BookOpen className="w-8 h-8 mb-3 text-fg-3" />
                <h3 className="text-sm font-semibold text-fg">No skill folders</h3>
                <p className="mt-1 text-sm text-fg-2 max-w-sm">
                  {activeTab === 'global'
                    ? 'Mount global skill folders in the path registry.'
                    : 'Workspace local scan is unconfigured or inactive.'}
                </p>
              </div>
            ) : null}

            {groups.map((group) => {
              const groupKey = group.absolutePath;
              const isCollapsed = collapsedGroups[groupKey] ?? false;
              const label = groupLabel(group.absolutePath);
              const scopeLabel = group.scope === 'global' ? 'Global' : 'Project';

              return (
                <div key={groupKey} className="card overflow-hidden">
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="flex items-center gap-3 w-full text-left p-3 hover:bg-hover transition-colors"
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4 text-fg-2" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-fg-2" />
                    )}
                    <span className="text-sm font-medium text-fg">{label}</span>
                    <span className="badge">{scopeLabel}</span>
                    <span className="text-xs text-fg-2 ml-auto">
                      {group.skills.length} {group.skills.length === 1 ? 'file' : 'files'}
                    </span>
                  </button>

                  {!isCollapsed ? (
                    <div className="border-t border-border p-2 space-y-1 bg-surface-2">
                      {group.skills.map((skill) => {
                        const isSkillSelected = selectedSkill?.absolutePath === skill.absolutePath;
                        const isWritable = group.scope === 'project';
                        return (
                          <button
                            key={skill.absolutePath}
                            onClick={() => handleSelectSkill(skill, group)}
                            className={`w-full text-left p-2.5 rounded-md transition-colors ${
                              isSkillSelected ? 'bg-surface-3' : 'hover:bg-surface'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText
                                className={`w-3.5 h-3.5 flex-shrink-0 ${
                                  isSkillSelected ? 'text-fg' : 'text-fg-2'
                                }`}
                              />
                              <span
                                className={`text-sm truncate ${
                                  isSkillSelected ? 'text-fg font-medium' : 'text-fg-2'
                                }`}
                              >
                                {skill.filename}
                              </span>
                              <span
                                className="flex-shrink-0 ml-auto"
                                title={isWritable ? 'Writable' : 'Protected global file'}
                              >
                                {isWritable ? (
                                  <PenLine className="w-3 h-3 text-fg-2" />
                                ) : (
                                  <Lock className="w-3 h-3 text-fg-3" />
                                )}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-xs text-fg-2">
                              <span className="flex items-center gap-1">
                                <HardDrive className="w-3 h-3" />
                                {formatBytes(skill.sizeBytes)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {relativeTime(skill.lastModified)}
                              </span>
                            </div>
                            {skill.previewLines.length > 0 ? (
                              <div className="mt-2 space-y-0.5">
                                {skill.previewLines.slice(0, 2).map((line, i) => (
                                  <p
                                    key={i}
                                    className="text-xs text-fg-2 font-mono truncate leading-snug"
                                  >
                                    {line || '\u00A0'}
                                  </p>
                                ))}
                              </div>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {activeTab === 'project' && groups.length > 0 ? (
              <button
                onClick={() => {
                  const firstDir = groups[0]?.absolutePath;
                  setNewSkillDir(firstDir ?? '');
                  setShowNewSkill(true);
                }}
                className="w-full h-10 rounded-md border border-dashed border-border-strong text-sm text-fg-2 hover:text-fg hover:border-fg transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                New skill
              </button>
            ) : null}
          </div>
        </div>

        {selectedSkill && selectedGroup ? (
          <div className="flex-1 min-w-0 card p-5 min-h-[500px] lg:h-[calc(100vh-240px)] flex flex-col">
            <SkillPreview
              skill={selectedSkill}
              group={selectedGroup}
              onClose={() => {
                setSelectedSkill(null);
                setSelectedGroup(null);
              }}
              onSaved={load}
            />
          </div>
        ) : null}

        {showNewSkill && newSkillDir ? (
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-surface border border-border rounded-md overflow-hidden shadow-md">
              <SkillEditor
                filename="my-skill.md"
                initialContent={`# New Skill\n\n## Description\n\nAdd your skill description here.\n\n## Instructions\n\n`}
                isNew
                skillsDir={newSkillDir}
                onSave={async (content, newFilename) => {
                  const finalName = newFilename ?? 'my-skill.md';
                  const skillPath = `${newSkillDir}/${finalName}`;
                  await saveSkillFile(skillPath, content);
                  setShowNewSkill(false);
                  setNewSkillDir('');
                  await load();
                }}
                onClose={() => {
                  setShowNewSkill(false);
                  setNewSkillDir('');
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
