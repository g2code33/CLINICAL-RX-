import { useEffect, useRef, useState } from 'react';
import { Modal } from './Modal';
import { WARD_ENTRY_META } from '../services/defaults';
import { ENTRY_TYPES, addEntry, findExistingKnowledge, moduleForEntryType, type KnowledgeMatch } from '../services/wardRounds';
import { canRunAi, interpretNote, type WardSuggestion } from '../services/wardAi';
import type { WardEntryType } from '../types';

/**
 * Quick Capture — the fastest path from "I just learned something" to a saved
 * record. Optimised for use during an ACTIVE ward round:
 *  - one tap to pick a type, type, Enter to save
 *  - the sheet stays open so several things can be captured in a row
 *  - works entirely offline; AI is an optional extra
 */
export function WardQuickCapture({
  open,
  roundId,
  initialType,
  patientLabel,
  onClose,
  onSaved,
}: {
  open: boolean;
  roundId: string;
  initialType?: WardEntryType | null;
  patientLabel?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [type, setType] = useState<WardEntryType | null>(initialType ?? null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);
  // Link-to-existing: suggestions shown as the user types a subject.
  const [linkId, setLinkId] = useState<string | null>(null);
  const [linkName, setLinkName] = useState<string>('');
  // Structured clinical reasoning fields.
  const [reasoning, setReasoning] = useState({ considered: '', relevantInfo: '', understood: '', confused: '', investigateFurther: '' });

  // Natural-language mode
  const [nlOpen, setNlOpen] = useState(false);
  const [nlText, setNlText] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [nlError, setNlError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<WardSuggestion[] | null>(null);

  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (open) {
      setType(initialType ?? null);
      setTitle('');
      setContent('');
      setLinkId(null);
      setLinkName('');
      setReasoning({ considered: '', relevantInfo: '', understood: '', confused: '', investigateFurther: '' });
      setJustSaved(null);
      setNlOpen(false);
      setNlText('');
      setSuggestions(null);
      setNlError(null);
    }
  }, [open, initialType]);

  useEffect(() => {
    if (type && firstFieldRef.current) firstFieldRef.current.focus();
  }, [type]);

  const meta = type ? WARD_ENTRY_META[type] : null;
  // Suggest existing records so the SAME knowledge accumulates across rounds.
  const matches: KnowledgeMatch[] =
    type && moduleForEntryType(type) && title.trim().length >= 2 ? findExistingKnowledge(type, title) : [];
  const needsTitle = !!meta?.titleLabel;
  const reasoningFilled = Object.values(reasoning).some((v) => v.trim());
  const canSave =
    type === 'reasoning'
      ? reasoningFilled || !!content.trim()
      : needsTitle
      ? !!title.trim() || !!content.trim()
      : !!content.trim() || !!title.trim();

  async function save(keepOpen: boolean) {
    if (!type || !canSave || saving) return;
    setSaving(true);
    try {
      const isReasoning = type === 'reasoning';
      await addEntry(
        roundId,
        type,
        needsTitle ? title : '',
        content || title,
        'medium',
        {
          linkId: linkId ?? undefined,
          reasoning: isReasoning ? { ...reasoning } : undefined,
          patientLabel: patientLabel?.trim() || undefined,
        }
      );
      setJustSaved(linkId ? `${meta?.icon} Saved · linked to ${linkName}` : `${meta?.icon} Saved`);
      setTitle('');
      setContent('');
      setLinkId(null);
      setLinkName('');
      setReasoning({ considered: '', relevantInfo: '', understood: '', confused: '', investigateFurther: '' });
      onSaved?.();
      if (!keepOpen) onClose();
      else setTimeout(() => firstFieldRef.current?.focus(), 0);
    } finally {
      setSaving(false);
    }
  }

  async function runInterpret() {
    const text = nlText.trim();
    if (!text || nlBusy) return;
    setNlBusy(true);
    setNlError(null);
    setSuggestions(null);
    const res = await interpretNote(text);
    setNlBusy(false);
    if (!res.ok) setNlError(res.error ?? 'Could not interpret that note.');
    else setSuggestions(res.suggestions);
  }

  /** Save the raw note exactly as typed — never altered by AI. */
  async function keepOriginal() {
    const text = nlText.trim();
    if (!text) return;
    await addEntry(roundId, 'note', '', text, 'medium', { patientLabel: patientLabel?.trim() || undefined });
    setNlText('');
    setSuggestions(null);
    onSaved?.();
    setJustSaved('📝 Note saved as written');
  }

  async function acceptSuggestion(s: WardSuggestion, index: number) {
    await addEntry(roundId, s.type, s.title, s.content, 'medium', { patientLabel: patientLabel?.trim() || undefined });
    setSuggestions((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
    onSaved?.();
    setJustSaved('✓ Added');
  }

  async function acceptAll() {
    if (!suggestions) return;
    for (const s of suggestions) await addEntry(roundId, s.type, s.title, s.content, 'medium', { patientLabel: patientLabel?.trim() || undefined });
    setSuggestions(null);
    setNlText('');
    onSaved?.();
    setJustSaved('✓ All added');
  }

  function updateSuggestion(i: number, patch: Partial<WardSuggestion>) {
    setSuggestions((prev) => (prev ? prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) : prev));
  }

  return (
    <Modal open={open} onClose={onClose} title="⚡ Quick Capture" wide={nlOpen}>
      {patientLabel && (
        <div className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-sm font-medium text-brand-800 dark:bg-brand-950 dark:text-brand-200">
          🧑‍⚕️ Capturing for: <strong>{patientLabel}</strong>
        </div>
      )}
      {justSaved && (
        <div className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
          {justSaved} · keep going, the round is still open
        </div>
      )}

      {/* ---------- Natural language mode ---------- */}
      {nlOpen ? (
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">🧠 Write it however you like</div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Type freely — AI suggests a structure. Your original words are never changed.
              </p>
            </div>
            <button className="btn-ghost !py-1 text-xs" onClick={() => setNlOpen(false)}>
              ← Back
            </button>
          </div>

          <textarea
            autoFocus
            className="input min-h-[110px] resize-y"
            placeholder="e.g. I learned that amlodipine is a calcium channel blocker and can cause ankle edema."
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
          />

          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={runInterpret} disabled={!nlText.trim() || nlBusy}>
              {nlBusy ? '🤖 Interpreting…' : '🤖 Suggest structure'}
            </button>
            <button className="btn-secondary" onClick={keepOriginal} disabled={!nlText.trim()}>
              📝 Save as written
            </button>
          </div>

          {nlError && (
            <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {nlError} — you can still save the note exactly as written.
            </div>
          )}

          {suggestions && suggestions.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  AI suggestion · review before saving
                </div>
                <button className="btn-ghost !py-0.5 text-xs" onClick={acceptAll}>
                  Accept all
                </button>
              </div>
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto !py-1 text-xs"
                      value={s.type}
                      onChange={(e) => updateSuggestion(i, { type: e.target.value as WardEntryType })}
                    >
                      {ENTRY_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {WARD_ENTRY_META[t].icon} {WARD_ENTRY_META[t].label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="input !w-auto flex-1 !py-1 text-xs"
                      value={s.title}
                      placeholder="Subject"
                      onChange={(e) => updateSuggestion(i, { title: e.target.value })}
                    />
                  </div>
                  <textarea
                    className="input min-h-[60px] resize-y text-sm"
                    value={s.content}
                    onChange={(e) => updateSuggestion(i, { content: e.target.value })}
                  />
                  {(s.className || s.adverseEffects?.length) && (
                    <div className="mt-1.5 flex flex-wrap gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {s.className && <span className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">{s.className}</span>}
                      {s.adverseEffects?.map((a) => (
                        <span key={a} className="rounded bg-amber-50 px-1.5 py-0.5 dark:bg-amber-950">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      className="btn-ghost !py-1 text-xs"
                      onClick={() => setSuggestions((prev) => (prev ? prev.filter((_, idx) => idx !== i) : prev))}
                    >
                      Reject
                    </button>
                    <button className="btn-primary !py-1 text-xs" onClick={() => acceptSuggestion(s, i)}>
                      Accept
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-slate-400">
                Editing here only changes what gets saved — your typed note above is untouched.
              </p>
            </div>
          )}
        </div>
      ) : !type ? (
        /* ---------- Type picker ---------- */
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {ENTRY_TYPES.map((t) => {
              const m = WARD_ENTRY_META[t];
              return (
                <button
                  key={t}
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-4 text-center text-slate-900 transition-colors hover:border-brand-500 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                  onClick={() => setType(t)}
                >
                  <span className="text-2xl leading-none">{m.icon}</span>
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{m.label}</span>
                </button>
              );
            })}
          </div>
          <button
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-300 px-3 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-950"
            onClick={() => setNlOpen(true)}
          >
            🧠 Just write it — let AI organise it
            {!canRunAi() && <span className="text-[10px] font-normal text-slate-400">(needs AI)</span>}
          </button>
        </div>
      ) : (
        /* ---------- Minimal entry form ---------- */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {meta?.icon} {meta?.label}
            </div>
            <button className="btn-ghost !py-1 text-xs" onClick={() => setType(null)}>
              ← Change type
            </button>
          </div>

          {needsTitle && (
            <div>
              <label className="label">{meta?.titleLabel}</label>
              <input
                ref={firstFieldRef as React.RefObject<HTMLInputElement>}
                className="input"
                placeholder={meta?.titleLabel}
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setLinkId(null);
                  setLinkName('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    save(true);
                  }
                }}
              />
              {/* Link to an existing record instead of duplicating it. */}
              {!linkId && title.trim().length >= 2 && matches.length > 0 && (
                <div className="mt-1.5 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Already in your knowledge base — link instead of duplicating
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800 transition-colors hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-200"
                        onClick={() => {
                          setLinkId(m.id);
                          setLinkName(m.name);
                          setTitle(m.name);
                        }}
                      >
                        🔗 {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {linkId && (
                <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  🔗 Linking to your existing <strong>{linkName}</strong> record
                  <button
                    className="ml-auto text-emerald-700 hover:underline dark:text-emerald-300"
                    onClick={() => {
                      setLinkId(null);
                      setLinkName('');
                    }}
                  >
                    unlink
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Structured clinical reasoning — learning and reflection only. */}
          {type === 'reasoning' && (
            <div className="space-y-2">
              {([
                ['considered', 'What was being considered?'],
                ['relevantInfo', 'What information was relevant?'],
                ['understood', 'What did I understand?'],
                ['confused', 'What confused me?'],
                ['investigateFurther', 'What would I like to investigate further?'],
              ] as const).map(([key, label]) => (
                <div key={key}>
                  <label className="label !mb-1 !text-[11px]">{label}</label>
                  <textarea
                    className="input min-h-[48px] resize-y text-sm"
                    value={reasoning[key]}
                    onChange={(e) => setReasoning((r) => ({ ...r, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="label">{needsTitle ? 'What did I learn?' : meta?.label}</label>
            <textarea
              ref={!needsTitle ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
              className="input min-h-[90px] resize-y"
              placeholder={meta?.placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save(true);
                }
              }}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Ctrl/⌘ + Enter saves and keeps this open for the next capture.
            </p>
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>
              Done
            </button>
            <button className="btn-secondary" onClick={() => save(true)} disabled={!canSave || saving}>
              Save & add another
            </button>
            <button className="btn-primary" onClick={() => save(false)} disabled={!canSave || saving}>
              Save ✓
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}
