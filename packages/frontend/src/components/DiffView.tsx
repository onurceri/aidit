import { useMemo } from 'react';
import { createPatch } from 'diff';
import { html } from 'diff2html';
import 'diff2html/bundles/css/diff2html.min.css';

interface DiffViewProps {
  oldJson: Record<string, unknown>;
  newJson: Record<string, unknown>;
  oldLabel?: string;
  newLabel?: string;
}

export function DiffView({
  oldJson,
  newJson,
  oldLabel = 'Source',
  newLabel = 'Target',
}: DiffViewProps) {
  const diffHtml = useMemo(() => {
    const oldStr = JSON.stringify(oldJson, null, 2) + '\n';
    const newStr = JSON.stringify(newJson, null, 2) + '\n';
    const patch = createPatch('config', oldStr, newStr, oldLabel, newLabel);
    return html(patch, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
    });
  }, [oldJson, newJson, oldLabel, newLabel]);

  return (
    <div className="text-xs">
      <div dangerouslySetInnerHTML={{ __html: diffHtml }} />
    </div>
  );
}
