import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Full-height page: a fixed header and a body that scrolls on its own. */
export function Page({
  title,
  description,
  actions,
  children,
  bare = false,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** When true, children manage their own scrolling (e.g. a SplitView). */
  bare?: boolean;
}) {
  return (
    <div className="page">
      <header className="page-header">
        <div className="min-w-0">
          <h1 className="text-base font-semibold tracking-tight text-fg truncate">{title}</h1>
          {description ? <p className="text-xs text-fg-2 truncate">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2 flex-shrink-0">{actions}</div> : null}
      </header>
      {bare ? (
        children
      ) : (
        <div className="page-body">
          <div className="page-content">{children}</div>
        </div>
      )}
    </div>
  );
}

/** Master/detail layout: a list pane and a detail pane that scroll independently. */
export function SplitView({ aside, children }: { aside: ReactNode; children: ReactNode }) {
  return (
    <div className="split">
      <aside className="split-aside">{aside}</aside>
      <section className="split-main">{children}</section>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-10 h-10 rounded-lg border border-border bg-surface-2 flex items-center justify-center mb-3">
        <Icon className="w-5 h-5 text-fg-2" strokeWidth={1.5} />
      </div>
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children ? <p className="mt-1 text-sm text-fg-2 max-w-sm">{children}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
