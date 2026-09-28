import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Accessible modal dialog (Phase 9 §27, §28).
 *
 * The Phase 9 audit found this component had no dialog semantics at all: no
 * role, no label, no Escape handling, no focus trap, and focus was never
 * returned to whatever opened it. A keyboard or screen-reader user could tab
 * straight out of an open dialog into the page behind it.
 *
 * Upgraded in place so all 17 existing call sites benefit without changes.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? []
      );

    // Focus the first control (or the panel) so keyboard users start inside.
    (focusables()[0] ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = focusables();
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      // Return focus to the trigger, so the user does not lose their place.
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`max-h-[92vh] w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-y-auto rounded-2xl bg-white p-4 text-slate-900 shadow-2xl outline-none dark:bg-slate-800 dark:text-slate-100 sm:p-6`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          <button className="btn-ghost !p-1 text-xl" onClick={onClose} aria-label="Close dialog" title="Close">
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState('');

  function add() {
    const t = text.trim();
    if (t && !value.includes(t)) {
      onChange([...value, t]);
      setText('');
    }
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          className="input"
          value={text}
          placeholder={placeholder ?? 'Type and press Add'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn-secondary shrink-0" onClick={add}>+ Add</button>
      </div>
      {value.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800 dark:bg-brand-900 dark:text-brand-200">
              {v}
              <button
                className="hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
                onClick={() => onChange(value.filter((x) => x !== v))}
                aria-label={`Remove tag ${v}`}
                title={`Remove ${v}`}
              >
                <span aria-hidden="true">×</span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
