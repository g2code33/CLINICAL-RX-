import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col items-start justify-between gap-3 sm:mb-5 sm:flex-row sm:items-center">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight text-slate-800 dark:text-slate-100 sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </div>
      {action && <div className="flex w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  );
}

export function StatCard({ icon, label, value, accent, to }: { icon: string; label: string; value: ReactNode; accent?: string; to?: string }) {
  const inner = (
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
  if (to) {
    return <Link to={to} className="block transition-opacity hover:opacity-80">{inner}</Link>;
  }
  return inner;
}

/**
 * The single empty-state component for the whole app (§29, §45).
 * The icon is decorative — the title carries the meaning, so screen readers
 * are not read a stream of emoji names.
 */
export function EmptyState({ icon, title, hint, actions }: { icon: string; title: string; hint?: string; actions?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center justify-center py-12 text-center">
      <div className="text-4xl" aria-hidden="true">{icon}</div>
      <div className="mt-2 font-semibold text-slate-600 dark:text-slate-300">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-slate-400">{hint}</div>}
      {actions && <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}

/** Password field with an eye toggle to show/hide the typed value. */
export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement> & { className?: string }) {
  const [show, setShow] = useState(false);
  const { className, ...rest } = props;
  return (
    <div className={`relative ${className ?? ''}`}>
      <input {...rest} type={show ? 'text' : 'password'} className="input w-full pr-9" />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-lg leading-none text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
        title={show ? 'Hide password' : 'Show password'}
      >
        {show ? '🙈' : '👁'}
      </button>
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
