import { useState } from 'react';
import Editor from '@monaco-editor/react';
import { X, Save, Loader } from 'lucide-react';

interface SkillEditorProps {
  filename: string;
  initialContent: string;
  onSave: (content: string, filename?: string) => Promise<void>;
  onClose: () => void;
  isNew?: boolean;
  skillsDir?: string;
}

export function SkillEditor({
  filename: initialFilename,
  initialContent,
  onSave,
  onClose,
  isNew = false,
  skillsDir,
}: SkillEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [filename, setFilename] = useState(initialFilename);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorTheme = document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark';

  const handleSave = async () => {
    if (!filename.trim()) {
      setError('Filename is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(content, isNew ? filename : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 pb-3 border-b border-border">
        <span className="text-sm font-medium text-fg">
          {isNew ? 'New skill' : 'Editing'}
        </span>
        {!isNew ? <span className="text-sm text-fg-2 truncate">{filename}</span> : null}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={handleSave} disabled={saving} className="btn-primary btn-sm">
            {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            {saving ? 'Saving' : 'Save'}
          </button>
          <button onClick={onClose} className="btn-icon" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isNew ? (
        <div className="py-3 border-b border-border space-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs text-fg-2 flex-shrink-0">Filename</label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder="my-skill.md"
              className="input flex-1 text-xs"
              autoFocus
            />
          </div>
          {skillsDir ? (
            <p className="font-mono text-xs text-fg-2 truncate" title={skillsDir}>
              {skillsDir}/
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <div className="mt-2 card p-3 border-border-strong">
          <p className="text-xs text-fg">{error}</p>
        </div>
      ) : null}

      <div className="flex-1 mt-3 rounded-md border border-border overflow-hidden">
        <Editor
          height="100%"
          language="markdown"
          value={content}
          theme={editorTheme}
          onChange={(value) => setContent(value ?? '')}
          options={{
            fontSize: 13,
            lineNumbers: 'off',
            wordWrap: 'on',
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            renderLineHighlight: 'none',
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            guides: { indentation: false },
            folding: false,
            lineDecorationsWidth: 12,
          }}
        />
      </div>
    </div>
  );
}
