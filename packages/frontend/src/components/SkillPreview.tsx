import { useState, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import remarkGfm from 'remark-gfm';
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
import { displayPath } from '../lib/paths';
import { useToast } from '../context/ToastContext';
import 'highlight.js/styles/github-dark-dimmed.css';

const REHYPE_PLUGINS = [rehypeHighlight];
// GitHub-flavoured markdown: tables, task lists, strikethrough, autolinks.
const REMARK_PLUGINS = [remarkGfm];
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;

function stripFrontmatter(markdown: string): string {
  return markdown.replace(FRONTMATTER_RE, '').trimStart();
}

interface SkillPreviewProps {
  skill: SkillFile;
  group: SkillsDirResult;
  onClose?: () => void;
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
      addToast('error', err instanceof Error ? err.message : 'Failed to copy path to clipboard');
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
      <div className="p-6 h-full flex flex-col">
        <SkillEditor
          filename={skill.filename}
          initialContent={content}
          onSave={handleSave}
          onClose={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <div className="sticky top-0 z-10 border-b border-border bg-bg/95 backdrop-blur-sm px-6 pt-5 pb-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg truncate">{skill.name}</h2>
              {!writable ? (
                <span className="badge" title="Global skills are read-only in aidit">
                  <Lock className="w-3 h-3" />
                  read-only
                </span>
              ) : null}
            </div>
            {skill.description ? (
              <p className="mt-1 text-sm text-fg-2 line-clamp-2">{skill.description}</p>
            ) : null}
            <button
              onClick={handleCopyPath}
              className="group mt-1.5 flex items-center gap-1.5 max-w-full text-xs text-fg-3 hover:text-fg font-mono"
              title="Copy path"
            >
              <FolderOpen className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{displayPath(skill.absolutePath)}</span>
              <Copy className="w-3 h-3 flex-shrink-0 opacity-0 group-hover:opacity-100" />
            </button>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <div className="segmented mr-1">
              <button
                onClick={() => setViewRaw(false)}
                className={`segment ${!viewRaw ? 'segment-active' : ''}`}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
              <button
                onClick={() => setViewRaw(true)}
                className={`segment ${viewRaw ? 'segment-active' : ''}`}
              >
                <EyeOff className="w-3 h-3" />
                Source
              </button>
            </div>
            {writable && content !== null ? (
              <button onClick={() => setEditing(true)} className="btn-secondary btn-sm">
                <PenLine className="w-3.5 h-3.5" />
                Edit
              </button>
            ) : null}
            <button
              onClick={() => setExpanded(true)}
              className="btn-icon"
              aria-label="Open in fullscreen reader"
              title="Fullscreen"
              disabled={loading || content === null}
            >
              <Maximize2 className="w-4 h-4" />
            </button>
            {onClose ? (
              <button onClick={onClose} className="btn-icon" aria-label="Close preview">
                <X className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 px-6 py-5">
        <div className="max-w-3xl">
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
            <pre className="font-mono text-xs bg-surface-2 border border-border p-4 rounded-md overflow-x-auto whitespace-pre-wrap text-fg">
              {content}
            </pre>
          ) : null}

          {renderedContent && !viewRaw ? (
            <article className="md-surface">
              <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                {renderedContent}
              </ReactMarkdown>
            </article>
          ) : null}
        </div>
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
              <span className="text-sm font-semibold text-fg truncate">{skill.name}</span>
              <span className="text-xs text-fg-3 font-mono truncate hidden sm:inline">
                {displayPath(skill.absolutePath)}
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
                  <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS}>
                    {renderedContent ?? ''}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
