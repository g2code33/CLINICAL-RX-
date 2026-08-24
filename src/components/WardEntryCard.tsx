import { useState } from 'react';
import { WARD_ENTRY_META } from '../services/defaults';
import { deleteEntry, entryHeading, updateEntry } from '../services/wardRounds';
import { askAboutEntry, canRunAi, EXPLAIN_MODES, type ExplainMode } from '../services/wardAi';
import type { WardEntry } from '../types';

function timeOf(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/**
 * A single captured item inside a ward round.
 * The student's text is shown verbatim; AI answers appear in a clearly
 * separated panel below so original and AI content are never confused.
 */
export function WardEntryCard({
  entry,
  selectable,
  selected,
  onToggleSelect,
  onChanged,
}: {
  entry: WardEntry;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: (v: boolean) => void;
  onChanged?: () => void;
}) {
  const meta = WARD_ENTRY_META[entry.type];
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(entry.title);
  const [content, setContent] = useState(entry.content);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState(entry.aiSuggestion?.answer ?? '');

  async function saveEdit() {
    await updateEntry(entry, { title: title.trim(), content: content.trim() });
    setEditing(false);
    onChanged?.();
  }

  async function remove() {
    if (!confirm('Delete this capture? This cannot be undone from here (use Undo in the toast).')) return;
    await deleteEntry(entry.id);
    onChanged?.();
  }

  async function ask(mode: ExplainMode) {
    setAiOpen(true);
    setAiBusy(true);
    setAiText('');
    const res = await askAboutEntry(entry, mode, (t) => setAiText((prev) => prev + t));
    setAiBusy(false);
    if (!res.ok) setAiText('⚠️ ' + res.text);
    else if (!aiText) setAiText(res.text);
  }

  /** Store the student's own answer to a captured question. */
  async function saveAnswer() {
    await updateEntry(entry, {
      aiSuggestion: { ...(entry.aiSuggestion ?? { acceptedAt: Date.now() }), acceptedAt: Date.now(), answer: answer.trim() },
    });
    setAnswering(false);
    onChanged?.();
  }

  return (
    <div
      className={`rounded-xl border p-3 transition-colors ${
        selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-950' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {selectable && (
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 shrink-0 accent-brand-600"
            checked={!!selected}
            onChange={(e) => onToggleSelect?.(e.target.checked)}
            aria-label="Select capture"
          />
        )}
        <span className="text-xl leading-none">{meta.icon}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="space-y-2">
              {meta.titleLabel && (
                <input className="input !py-1.5 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={meta.titleLabel} />
              )}
              <textarea className="input min-h-[70px] resize-y text-sm" value={content} onChange={(e) => setContent(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button
                  className="btn-ghost !py-1 text-xs"
                  onClick={() => {
                    setEditing(false);
                    setTitle(entry.title);
                    setContent(entry.content);
                  }}
                >
                  Cancel
                </button>
                <button className="btn-primary !py-1 text-xs" onClick={saveEdit}>
                  Save
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-bold uppercase tracking-wide text-slate-800 dark:text-slate-100">
                  {entryHeading(entry)}
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{meta.label}</span>
              </div>
              {entry.title && entry.content && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{entry.content}</p>
              )}
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
                <span>Captured {timeOf(entry.createdAt)}</span>
                {entry.type === 'question' && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-0.5 capitalize dark:bg-slate-700">
                    Priority: {entry.priority}
                  </span>
                )}
                {entry.linkedRecordId && <span title="Also added to your compartments">🔗 linked</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Saved answer to a question (student's own, or accepted from AI) */}
      {!editing && entry.aiSuggestion?.answer && !answering && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200">
          <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Answer</div>
          <p className="mt-0.5 whitespace-pre-wrap">{entry.aiSuggestion.answer}</p>
        </div>
      )}

      {answering && (
        <div className="mt-2 space-y-2">
          <textarea
            autoFocus
            className="input min-h-[70px] resize-y text-sm"
            placeholder="Write the answer in your own words…"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-ghost !py-1 text-xs" onClick={() => setAnswering(false)}>
              Cancel
            </button>
            <button className="btn-primary !py-1 text-xs" onClick={saveAnswer} disabled={!answer.trim()}>
              Save answer
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setEditing(true)}>
            Edit
          </button>
          <button className="btn-ghost !px-2 !py-1 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950" onClick={remove}>
            Delete
          </button>
          {entry.type === 'question' && (
            <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setAnswering(true)}>
              Answer
            </button>
          )}
          <div className="relative">
            <button
              className="btn-ghost !px-2 !py-1 text-xs"
              onClick={() => setAiOpen((v) => !v)}
              title={canRunAi() ? 'Ask AI about this' : 'AI needs a key in Settings → AI (and internet)'}
            >
              🤖 Ask AI
            </button>
          </div>
        </div>
      )}

      {/* AI panel — clearly separated from the student's own words */}
      {aiOpen && (
        <div className="mt-2 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5 dark:border-brand-800 dark:bg-brand-950/40">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {EXPLAIN_MODES.map((m) => (
              <button
                key={m.key}
                className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-brand-800 shadow-sm transition-colors hover:bg-brand-100 disabled:opacity-50 dark:bg-slate-800 dark:text-brand-200"
                onClick={() => ask(m.key)}
                disabled={aiBusy}
                title={m.hint}
              >
                {m.label}
              </button>
            ))}
            <button className="ml-auto text-[11px] text-slate-400 hover:text-slate-600" onClick={() => setAiOpen(false)}>
              Close
            </button>
          </div>
          {!canRunAi() && !aiText && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              AI is unavailable right now (offline or no API key). Your capture is safely saved either way.
            </p>
          )}
          {aiBusy && !aiText && <p className="animate-pulse text-xs text-slate-500">🤖 Thinking…</p>}
          {aiText && (
            <>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-brand-700 dark:text-brand-300">
                AI explanation
              </div>
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">{aiText}</p>
              {entry.type === 'question' && !aiBusy && (
                <button
                  className="btn-secondary mt-2 !py-1 text-xs"
                  onClick={() => {
                    setAnswer(aiText);
                    setAnswering(true);
                  }}
                >
                  Use as my answer
                </button>
              )}
              <p className="mt-2 text-[10px] text-slate-400">
                AI-generated · verify against your guidelines, formulary or supervisor. Your original note is unchanged.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
