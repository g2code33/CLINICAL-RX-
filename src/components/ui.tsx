import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function StatCard({ icon, label, value, accent }: { icon: string; label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl ${accent ?? 'bg-brand-100 dark:bg-brand-900'}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</div>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, hint, actions }: { icon: string; title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="mt-2 font-semibold text-slate-600 dark:text-slate-300">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-slate-400">{hint}</div>}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

export function Pill({ children, color }: { children: ReactNode; color?: string }) {
  const map: Record<string, string> = {
    green: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    red: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
    brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[color ?? 'slate']}`}>
      {children}
    </span>
  );
}
