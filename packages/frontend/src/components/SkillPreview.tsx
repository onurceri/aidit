import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import {
  Loader,
  AlertTriangle,
  X,
  Copy,
  FileText,
  Eye,
  EyeOff,
  FolderOpen,
  Lock,
  Maximize2,
  PenLine,
} from 'lucide-react';
import { fetchSkillFile, saveSkillFile } from '../api/client';
import type { SkillFile } from '../api/client';
import type { SkillsDirResult } from '../api/client';
import { SkillEditor } from './SkillEditor';
import { useToast } from '../context/ToastContext';
import 'highlight.js/styles/github-dark-dimmed.css';

const REHYPE_PLUGINS = [rehypeHighlight];
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_RE, '').trimStart();
}

interface SkillPreviewProps {
  skill: SkillFile;
  group: SkillsDirResult;
  onClose: () => void;
  onSaved?: () => void;
}

export function SkillPreview({ skill, group, onClose, onSaved }: SkillPreviewProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewRaw, setViewRaw] = useState(false);
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { addToast } = useToast();

  const writable = group.scope === 'project';
  const renderedContent = useMemo(() => (content ? stripFrontmatter(content) : null), [content]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    setViewRaw(false);
    setEditing(false);

    fetchSkillFile(skill.absolutePath)
      .then((result) => {
        if (!cancelled) setContent(result.content);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load skill file');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [skill.absolutePath]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded]);

  const handleCopyPath = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(skill.absolutePath);
      addToast('success', 'Path copied to clipboard');
    } catch (err) {
      addToast(
        'error',
        err instanceof Error ? err.message : 'Failed to copy path to clipboard',
      );
    }
  }, [skill.absolutePath]);

  const handleSave = useCallback(
    async (newContent: string) => {
      const result = await saveSkillFile(skill.absolutePath, newContent);
      setContent(result.content);
      setEditing(false);
      onSaved?.();
    },
    [skill.absolutePath, onSaved],
  );

  if (editing && content !== null) {
    return (
      <SkillEditor
        filename={skill.filename}
        initialContent={content}
        onSave={handleSave}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <FileText className="w-4 h-4 text-fg-2 flex-shrink-0" />
        <span className="text-sm font-semibold text-fg truncate">{skill.filename}</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setExpanded(true)}
            className="btn-icon"
            aria-label="Open in fullscreen reader"
            title="Open in fullscreen reader"
            disabled={loading || content === null}
          >
            <Maximize2 className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            className="btn-icon"
            aria-label="Close preview"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="py-2 text-xs text-fg-2 flex items-center gap-1.5">
        <FolderOpen className="w-3 h-3 flex-shrink-0" />
        <span className="font-mono truncate" title={skill.absolutePath}>
          {skill.absolutePath}
        </span>
      </div>

      <div className="flex items-center gap-2 py-2 border-t border-border">
        {!writable ? (
          <span
            className="flex items-center gap-1 text-xs text-fg-2"
            title="Shared/global skills are read-only"
          >
            <Lock className="w-3 h-3" />
            Read-only
          </span>
        ) : null}
        <button
          onClick={() => setViewRaw((v) => !v)}
          className="btn-ghost btn-sm"
        >
          {viewRaw ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {viewRaw ? 'Rendered' : 'Raw'}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleCopyPath}
          className="btn-ghost btn-sm"
        >
          <Copy className="w-3.5 h-3.5" />
          Copy path
        </button>
        {writable && content !== null ? (
          <button onClick={() => setEditing(true)} className="btn-secondary btn-sm">
            <PenLine className="w-3.5 h-3.5" />
            Edit
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto py-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-5 h-5 text-fg-2 animate-spin" />
          </div>
        ) : null}

        {error ? (
          <div className="flex flex-col items-center gap-2 py-8">
            <AlertTriangle className="w-8 h-8 text-fg-3" />
            <p className="text-sm text-fg-2 text-center">{error}</p>
          </div>
        ) : null}

        {content && viewRaw ? (
          <pre className="font-mono text-xs bg-surface-2 p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-fg">
            {content}
          </pre>
        ) : null}

        {renderedContent && !viewRaw ? (
          <article className="md-surface">
            <ReactMarkdown rehypePlugins={REHYPE_PLUGINS}>{renderedContent}</ReactMarkdown>
          </article>
        ) : null}
      </div>

      {expanded && content ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setExpanded(false)}
            aria-hidden
          />
          <div className="relative w-full max-w-4xl max-h-full bg-surface border border-border rounded-md shadow-md flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-border flex-shrink-0">
              <FileText className="w-4 h-4 text-fg-2 flex-shrink-0" />
              <span className="text-sm font-semibold text-fg truncate">{skill.filename}</span>
              <span className="text-xs text-fg-3 font-mono truncate hidden sm:inline">
                {skill.absolutePath}
              </span>
              <button
                onClick={() => setExpanded(false)}
                className="ml-auto btn-icon"
                aria-label="Close fullscreen reader"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-6 sm:px-10 py-6">
              {viewRaw ? (
                <pre className="font-mono text-xs bg-surface-2 p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-fg">
                  {content}
                </pre>
              ) : (
                <article className="md-surface md-surface--lg">
                  <ReactMarkdown rehypePlugins={REHYPE_PLUGINS}>{renderedContent ?? ''}</ReactMarkdown>
                </article>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
