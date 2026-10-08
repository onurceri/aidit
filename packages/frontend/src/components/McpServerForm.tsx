import { useState, useEffect } from 'react';
import { Plus, X, Loader } from 'lucide-react';
import type { McpServer, ServerInput } from '../api/client';

interface FormData {
  name: string;
  transport: 'stdio' | 'sse' | 'http';
  command: string;
  args: string[];
  env: { key: string; value: string }[];
  url: string;
  headers?: Record<string, string>;
  enabled: boolean;
}

interface FieldError {
  field: string;
  message: string;
}

interface McpServerFormProps {
  server: McpServer | null;
  saving?: boolean;
  apiErrors?: FieldError[] | null;
  onSave: (data: FormData) => void;
  onCancel: () => void;
  /** Whether the target config has an enable/disable flag. */
  canToggle?: boolean;
}

function emptyForm(): FormData {
  return {
    name: '',
    transport: 'stdio',
    command: '',
    args: [],
    env: [],
    url: '',
    enabled: true,
  };
}

function serverToForm(server: McpServer): FormData {
  const env = server.env ? Object.entries(server.env).map(([key, value]) => ({ key, value })) : [];
  return {
    name: server.name,
    transport: server.transport === 'unknown' ? 'stdio' : server.transport,
    command: server.command ?? '',
    args: server.args ?? [],
    url: server.url ?? '',
    headers: server.headers,
    enabled: server.enabled,
    env,
  };
}

function formToServerInput(data: FormData): ServerInput {
  const env: Record<string, string> = {};
  for (const { key, value } of data.env) {
    if (key.trim()) env[key.trim()] = value;
  }
  const base = { name: data.name.trim(), transport: data.transport, enabled: data.enabled };
  return data.transport === 'stdio'
    ? {
        ...base,
        command: data.command.trim(),
        args: data.args.filter((a) => a.trim()),
        env,
      }
    : { ...base, url: data.url.trim(), headers: data.headers, env };
}

export type { FormData };
export { formToServerInput, serverToForm, emptyForm };

export function McpServerForm({
  server,
  saving,
  apiErrors,
  onSave,
  onCancel,
  canToggle = true,
}: McpServerFormProps) {
  const [data, setData] = useState<FormData>(server ? serverToForm(server) : emptyForm());
  const [touched, setTouched] = useState<Set<string>>(new Set());

  useEffect(() => {
    setData(server ? serverToForm(server) : emptyForm());
    setTouched(new Set());
  }, [server]);

  const isCreate = !server;

  function update<K extends keyof FormData>(field: K, value: FormData[K]) {
    setData((prev) => ({ ...prev, [field]: value }));
    setTouched((prev) => new Set(prev).add(field));
  }

  const clientErrors: FieldError[] = [];
  if (!data.name.trim()) {
    clientErrors.push({ field: 'name', message: 'Server name is required' });
  }
  if (data.transport === 'stdio' && !data.command.trim()) {
    clientErrors.push({ field: 'command', message: 'Command is required for stdio transport' });
  }
  if ((data.transport === 'sse' || data.transport === 'http') && !data.url.trim()) {
    clientErrors.push({ field: 'url', message: `URL is required for ${data.transport} transport` });
  }

  const allErrors = [...clientErrors];
  if (apiErrors) {
    for (const e of apiErrors) {
      if (!allErrors.some((c) => c.field === e.field)) allErrors.push(e);
    }
  }

  function getError(field: string): string | undefined {
    return allErrors.find((e) => e.field === field)?.message;
  }
  function hasError(field: string): boolean {
    return !!getError(field) && touched.has(field);
  }

  const canSave = clientErrors.length === 0 && !saving;

  function addArg() {
    setData((prev) => ({ ...prev, args: [...prev.args, ''] }));
  }
  function removeArg(index: number) {
    setData((prev) => ({ ...prev, args: prev.args.filter((_, i) => i !== index) }));
  }
  function updateArg(index: number, value: string) {
    setData((prev) => {
      const args = [...prev.args];
      args[index] = value;
      return { ...prev, args };
    });
  }
  function addEnv() {
    setData((prev) => ({ ...prev, env: [...prev.env, { key: '', value: '' }] }));
  }
  function removeEnv(index: number) {
    setData((prev) => ({ ...prev, env: prev.env.filter((_, i) => i !== index) }));
  }
  function updateEnv(index: number, field: 'key' | 'value', val: string) {
    setData((prev) => ({
      ...prev,
      env: prev.env.map((e, i) => (i === index ? { ...e, [field]: val } : e)),
    }));
  }

  const inputClass = (field: string) =>
    `input font-sans ${hasError(field) ? 'border-border-strong' : ''}`;

  return (
    <div className="card p-6">
      <h3 className="text-lg font-semibold text-fg mb-6">
        {isCreate ? 'Add MCP server' : `Edit ${server?.name}`}
      </h3>

      <div className="space-y-4">
        <div>
          <label className="label">Name</label>
          <input
            type="text"
            className={inputClass('name')}
            value={data.name}
            onChange={(e) => update('name', e.target.value)}
            onBlur={() => setTouched((prev) => new Set(prev).add('name'))}
            placeholder="my-mcp-server"
          />
          {hasError('name') ? <p className="helper text-fg">{getError('name')}</p> : null}
        </div>

        <div>
          <label className="label">Transport</label>
          <div className="flex gap-1 p-0.5 rounded-md border border-border bg-surface-2 w-fit">
            {(['stdio', 'sse', 'http'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update('transport', t)}
                className={`h-7 px-3 rounded text-xs font-medium transition-colors ${
                  data.transport === t ? 'bg-surface text-fg' : 'text-fg-2 hover:text-fg'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {data.transport === 'stdio' ? (
          <div>
            <label className="label">Command</label>
            <input
              type="text"
              className={`${inputClass('command')} font-mono`}
              value={data.command}
              onChange={(e) => update('command', e.target.value)}
              onBlur={() => setTouched((prev) => new Set(prev).add('command'))}
              placeholder="npx -y @modelcontextprotocol/server-filesystem"
            />
            {hasError('command') ? <p className="helper text-fg">{getError('command')}</p> : null}
          </div>
        ) : null}

        {data.transport === 'sse' || data.transport === 'http' ? (
          <div>
            <label className="label">URL</label>
            <input
              type="text"
              className={`${inputClass('url')} font-mono`}
              value={data.url}
              onChange={(e) => update('url', e.target.value)}
              onBlur={() => setTouched((prev) => new Set(prev).add('url'))}
              placeholder={
                data.transport === 'http' ? 'http://localhost:3000' : 'https://example.com/sse'
              }
            />
            {hasError('url') ? <p className="helper text-fg">{getError('url')}</p> : null}
          </div>
        ) : null}

        {data.transport === 'stdio' ? (
          <div>
            <label className="label">Arguments</label>
            <div className="space-y-2">
              {data.args.map((arg, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    className="input flex-1 font-mono"
                    value={arg}
                    onChange={(e) => updateArg(i, e.target.value)}
                    placeholder={`arg ${i + 1}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeArg(i)}
                    className="btn-icon"
                    aria-label="Remove argument"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addArg}
              className="mt-2 flex items-center gap-1 text-xs text-fg-2 hover:text-fg"
            >
              <Plus className="w-3 h-3" />
              Add argument
            </button>
          </div>
        ) : null}

        <div>
          <label className="label">Environment variables</label>
          <div className="space-y-2">
            {data.env.map((env, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  className="input w-40 font-mono"
                  value={env.key}
                  onChange={(e) => updateEnv(i, 'key', e.target.value)}
                  placeholder="KEY"
                />
                <span className="text-fg-2 text-sm">=</span>
                <input
                  type="text"
                  className="input flex-1 font-mono"
                  value={env.value}
                  onChange={(e) => updateEnv(i, 'value', e.target.value)}
                  placeholder="value"
                />
                <button
                  type="button"
                  onClick={() => removeEnv(i)}
                  className="btn-icon"
                  aria-label="Remove env var"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addEnv}
            className="mt-2 flex items-center gap-1 text-xs text-fg-2 hover:text-fg"
          >
            <Plus className="w-3 h-3" />
            Add env var
          </button>
        </div>

        <div className={`flex items-center justify-between ${canToggle ? '' : 'hidden'}`}>
          <label className="text-sm font-medium text-fg">Enabled</label>
          <button
            type="button"
            onClick={() => update('enabled', !data.enabled)}
            role="switch"
            aria-checked={data.enabled}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              data.enabled ? 'bg-fg' : 'bg-fg-3'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-surface transition-transform ${
                data.enabled ? 'translate-x-4' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>
      </div>

      {apiErrors && apiErrors.length > 0 ? (
        <div className="mt-4 p-3 rounded-md border border-border-strong bg-surface-2">
          <p className="text-xs font-medium text-fg mb-1">Server returned errors</p>
          {apiErrors.map((err, i) => (
            <p key={i} className="text-xs text-fg-2">
              {err.field}: {err.message}
            </p>
          ))}
        </div>
      ) : null}

      <div className="mt-6 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onSave(data)}
          disabled={!canSave}
          className="btn-primary"
        >
          {saving ? <Loader className="w-3.5 h-3.5 animate-spin" /> : null}
          {isCreate ? 'Add server' : 'Save changes'}
        </button>
      </div>
    </div>
  );
}
