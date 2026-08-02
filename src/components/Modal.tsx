import React, { useState, type ReactNode } from 'react';

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-800`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
          <button className="btn-ghost !p-1 text-xl" onClick={onClose}>✕</button>
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
              <button className="hover:text-red-500" onClick={() => onChange(value.filter((x) => x !== v))}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
