import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';

/**
 * 🎨 CLINICAL Rx DESIGN SYSTEM — shared primitives (Phase 9 §46, §47)
 *
 * The Phase 9 audit found the same patterns hand-rolled across many pages:
 * tab pills in 9 files, ad-hoc empty states in 18, icon-only buttons with no
 * accessible name in 24 places, and a Modal with no dialog semantics.
 *
 * These components are the single implementation of each. They wrap the
 * existing `.btn` / `.card` / `.input` CSS layer rather than replacing it, so
 * adopting them changes nothing visually — it just removes duplication and
 * adds the accessibility that was missing.
 */

// ---- Design tokens (§47) ----------------------------------------------
//
// Centralised so spacing/radius decisions live in ONE place instead of being
// re-typed as literals on every page.

export const tokens = {
  radius: { sm: 'rounded-lg', md: 'rounded-xl', lg: 'rounded-2xl', pill: 'rounded-full' },
  gap: { tight: 'gap-1', snug: 'gap-2', normal: 'gap-3', loose: 'gap-4' },
  stack: { tight: 'space-y-1', snug: 'space-y-2', normal: 'space-y-3', loose: 'space-y-4' },
  text: { hint: 'text-xs opacity-70', label: 'text-xs opacity-75', body: 'text-sm' },
} as const;

/** Semantic status colours. Never used as the ONLY status signal (§27). */
export type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200',
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200',
  success: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  info: 'bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200',
};

// ---- Badge -------------------------------------------------------------

export function Badge({
  children,
  tone = 'neutral',
  icon,
  title,
}: {
  children: ReactNode;
  tone?: Tone;
  /** Paired with colour so status never depends on colour alone (§27). */
  icon?: string;
  title?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 ${tokens.radius.pill} px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
      title={title}
    >
      {icon && <span aria-hidden="true">{icon}</span>}
      {children}
    </span>
  );
}

// ---- IconButton (§27) --------------------------------------------------

/**
 * An icon-only button that CANNOT be created without an accessible name.
 * `label` is required — that is the entire point of this component.
 */
export function IconButton({
  icon,
  label,
  onClick,
  tone = 'neutral',
  disabled,
  className = '',
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  tone?: 'neutral' | 'danger';
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center ${tokens.radius.sm} transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:opacity-50 ${
        tone === 'danger'
          ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30'
          : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
      } ${className}`}
    >
      <span aria-hidden="true">{icon}</span>
    </button>
  );
}

// ---- Tabs (§46) --------------------------------------------------------

export interface TabItem<T extends string = string> {
  key: T;
  label: string;
  icon?: string;
  /** Optional count shown after the label. */
  count?: number;
}

/**
 * The tab-pill pattern that was duplicated across nine pages, now with real
 * tablist semantics and arrow-key navigation.
 */
export function Tabs<T extends string>({
  items,
  active,
  onChange,
  ariaLabel = 'Sections',
}: {
  items: Array<TabItem<T>>;
  active: T;
  onChange: (key: T) => void;
  ariaLabel?: string;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const move = (dir: 1 | -1) => {
    const i = items.findIndex((t) => t.key === active);
    const next = items[(i + dir + items.length) % items.length];
    if (next) {
      onChange(next.key);
      refs.current[next.key]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className={`flex flex-wrap ${tokens.gap.tight}`}>
      {items.map((t) => {
        const selected = t.key === active;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[t.key] = el;
            }}
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight') {
                e.preventDefault();
                move(1);
              } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                move(-1);
              }
            }}
            className={`${tokens.radius.pill} px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
              selected ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'
            }`}
          >
            {t.icon && <span aria-hidden="true">{t.icon} </span>}
            {t.label}
            {typeof t.count === 'number' && <span className="ml-1 opacity-70">({t.count})</span>}
          </button>
        );
      })}
    </div>
  );
}

// ---- State components (§29, §30, §31) ----------------------------------

/**
 * EmptyState already existed in `../ui` and is used across 18 pages, so it is
 * re-exported here rather than reimplemented. `primitives` stays the single
 * import surface without creating a second competing component (§45).
 */
export { EmptyState } from '../ui';

/** Skeleton loading — avoids blank white screens (§30). */
export function LoadingState({ message = 'Loading…', rows = 3 }: { message?: string; rows?: number }) {
  return (
    <div className="card" role="status" aria-live="polite">
      <p className="text-sm opacity-75">{message}</p>
      <div className="mt-3 space-y-2" aria-hidden="true">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="h-4 animate-pulse rounded bg-slate-200 dark:bg-slate-700" style={{ width: `${90 - i * 12}%` }} />
        ))}
      </div>
    </div>
  );
}

/** Friendly recovery UI instead of a technical error wall (§31). */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  reassurance = 'Your local data is still safe.',
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  reassurance?: string;
}) {
  return (
    <div className="card border-amber-400/40 bg-amber-400/5" role="alert">
      <h3 className="font-semibold">⚠️ {title}</h3>
      {message && <p className="mt-1 text-sm opacity-85">{message}</p>}
      <p className="mt-1 text-sm opacity-75">{reassurance}</p>
      {onRetry && (
        <button className="btn-secondary mt-3" onClick={onRetry}>
          Retry
        </button>
      )}
    </div>
  );
}

// ---- Accessible Modal (§27, §28) ---------------------------------------

/**
 * Dialog with the semantics the old Modal lacked: role, labelling, Escape to
 * close, a focus trap, and focus restored to whatever opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input:not([disabled]), select, [tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus into the dialog so keyboard users are not stranded behind it.
    const first = focusables()[0] ?? panelRef.current;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (!list.length) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-y-auto ${tokens.radius.lg} bg-white p-6 shadow-2xl outline-none dark:bg-slate-800`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-slate-800 dark:text-slate-100">
            {title}
          </h2>
          <IconButton icon="✕" label="Close dialog" onClick={onClose} />
        </div>
        {children}
        {footer && <div className="mt-4 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// ---- Confirm dialog (§34) ----------------------------------------------

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get a red button and stronger wording. */
  destructive?: boolean;
  /** Extra reassurance, e.g. "Your local data is not deleted." */
  note?: string;
}

/**
 * Replaces `window.confirm`, which is unstyled, un-themeable, blocks the whole
 * renderer and cannot be reached by assistive tech consistently.
 */
export function ConfirmDialog({
  open,
  options,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  options: ConfirmOptions | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!options) return null;
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={options.title}
      footer={
        <>
          <button className="btn-secondary" onClick={onCancel}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            className={options.destructive ? 'btn bg-red-600 text-white hover:bg-red-700' : 'btn-primary'}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? 'Confirm'}
          </button>
        </>
      }
    >
      <p className="text-sm">{options.message}</p>
      {options.note && <p className="mt-2 text-xs opacity-75">{options.note}</p>}
    </Dialog>
  );
}

/** Hook giving any page a themed confirm without prop-drilling. */
export function useConfirm() {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useMemo(
    () => (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setState({ options, resolve });
      }),
    []
  );

  const element = (
    <ConfirmDialog
      open={!!state}
      options={state?.options ?? null}
      onConfirm={() => {
        state?.resolve(true);
        setState(null);
      }}
      onCancel={() => {
        state?.resolve(false);
        setState(null);
      }}
    />
  );

  return { confirm, confirmDialog: element };
}

// ---- Section + collapsible (§36) ---------------------------------------

export function Section({
  title,
  icon,
  subtitle,
  action,
  children,
}: {
  title: string;
  icon?: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold">
            {icon && <span aria-hidden="true">{icon} </span>}
            {title}
          </h2>
          {subtitle && <div className={tokens.text.hint}>{subtitle}</div>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Collapsible panel for dense clinical information (§36). */
export function Collapsible({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`${tokens.radius.sm} border border-slate-200 p-2 dark:border-slate-700`} open={defaultOpen}>
      <summary className="cursor-pointer text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
        {title}
        {typeof count === 'number' && <span className="ml-1 opacity-70">({count})</span>}
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// ---- Field (§46) -------------------------------------------------------

/** A labelled form control with a real <label for> association. */
export function Field({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: (id: string) => ReactNode;
  required?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-xs opacity-75">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </label>
      <div className="mt-0.5">{children(id)}</div>
      {hint && <p className="mt-0.5 text-[11px] opacity-60">{hint}</p>}
    </div>
  );
}
