import { useState, useCallback, useEffect, useRef } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { Loader, Check, AlertTriangle } from 'lucide-react';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface JsonEditorProps {
  content: string;
  language?: 'json' | 'yaml';
  readOnly?: boolean;
  onSave?: (content: string) => Promise<void>;
}

export function JsonEditor({
  content,
  language = 'json',
  readOnly = false,
  onSave,
}: JsonEditorProps) {
  const [editorContent, setEditorContent] = useState(content);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setEditorContent(content);
  }, [content]);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    };
  }, []);

  const handleSave = useCallback(async () => {
    if (!onSave || saveStatus === 'saving') return;
    setSaveStatus('saving');
    setSaveError(null);
    try {
      await onSave(editorContent);
      setSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : 'Save failed');
    }
  }, [onSave, editorContent, saveStatus]);

  const handleMount: OnMount = useCallback(
    (editor, monaco) => {
      editorRef.current = editor;

      editor.addAction({
        id: 'save-content',
        label: 'Save Config',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
        run: () => handleSave(),
      });
    },
    [handleSave],
  );

  const lines = editorContent.split('\n').length;
  const height = Math.min(Math.max(lines * 18 + 40, 200), 600);
  const editorTheme = document.documentElement.dataset.theme === 'light' ? 'vs' : 'vs-dark';

  return (
    <div className="relative">
      {!readOnly ? (
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-xs">
            {saveStatus === 'saving' ? (
              <span className="flex items-center gap-1.5 text-fg-2">
                <Loader className="w-3 h-3 animate-spin" />
                Saving…
              </span>
            ) : null}
            {saveStatus === 'saved' ? (
              <span className="flex items-center gap-1.5 text-fg">
                <Check className="w-3 h-3" />
                Saved
              </span>
            ) : null}
            {saveStatus === 'error' ? (
              <span className="flex items-center gap-1.5 text-fg">
                <AlertTriangle className="w-3 h-3" />
                {saveError ?? 'Save failed'}
              </span>
            ) : null}
          </div>
          <span className="text-xs text-fg-2">Cmd/Ctrl+S to save</span>
        </div>
      ) : null}
      <div className="rounded-md border border-border overflow-hidden">
        <Editor
          height={height}
          language={language}
          value={editorContent}
          theme={editorTheme}
          onChange={(value) => setEditorContent(value ?? '')}
          onMount={handleMount}
          options={{
            readOnly,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            fontSize: 13,
            tabSize: 2,
            renderLineHighlight: readOnly ? 'none' : 'line',
            overviewRulerLanes: readOnly ? 0 : 3,
            hideCursorInOverviewRuler: readOnly,
            overviewRulerBorder: !readOnly,
            lineNumbersMinChars: 3,
          }}
        />
      </div>
    </div>
  );
}
