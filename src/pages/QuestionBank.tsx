import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import {
  loadGroups, saveGroups, loadBank, saveBank, parseBankJson,
  createGroup, addToGroup, deleteGroup, renameGroup, totalQuestions,
  type BankGroup, type BankQuestion,
} from '../services/questionBank';

export function QuestionBank() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<BankGroup[]>(() => loadGroups());
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [groupLabel, setGroupLabel] = useState('');
  const [importCat, setImportCat] = useState('General');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<BankQuestion[] | null>(null);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');

  function refresh() { setGroups(loadGroups()); }

  const openGroup = groups.find((g) => g.id === openGroupId) || null;
  const total = totalQuestions();

  function doImport() {
    const parsed = parseBankJson(jsonText, importCat);
    if (!parsed.ok) { setMsg('⚠️ ' + (parsed.error || 'Invalid')); setPreview(null); return; }
    setPreview(parsed.items);
    setMsg(`Found ${parsed.items.length} valid question(s). Label them, then confirm.`);
  }

  function confirmImport() {
    if (!preview || !preview.length) return;
    if (openGroup) {
      // Append into the currently-open group (keeps its label + date).
      addToGroup(openGroup.id, preview);
    } else {
      // Create a labeled, dated GROUP (organized unit).
      createGroup(groupLabel, preview);
    }
    setPreview(null); setJsonText(''); setGroupLabel(''); setImportOpen(false); setMsg('');
    refresh();
  }

  function removeQuestion(groupId: string, qid: string) {
    const gs = loadGroups();
    const g = gs.find((x) => x.id === groupId);
    if (!g) return;
    g.questions = g.questions.filter((q) => q.id !== qid);
    saveGroups(gs);
    refresh();
  }

  function clearAll() {
    if (!confirm('Delete ALL question bank groups?')) return;
    saveGroups([]);
    refresh();
  }

  const fmtDate = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div>
      <PageHeader
        title="Question Bank"
        subtitle="Imported questions are organized into labeled, dated groups — click a group to open its questions."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-secondary" onClick={() => navigate('/quiz')}>📝 Go to Quiz</button>
            <button className="btn-primary" onClick={() => setImportOpen(true)}>⬆ Import questions</button>
          </div>
        }
      />

      {msg && <div className="mb-4 rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-700">{msg}</div>}

      {groups.length === 0 ? (
        <EmptyState
          icon="🗂"
          title="No question groups yet"
          hint={`Import questions from a JSON file — they'll be labeled and dated automatically, then click to open. ${loadBank().length ? `(Also have ${loadBank().length} legacy question(s) from before groups — they still work in quizzes.)` : ''}`}
          actions={<button className="btn-primary" onClick={() => setImportOpen(true)}>⬆ Import JSON</button>}
        />
      ) : openGroup ? (
        /* ---- Opened group: its questions ---- */
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <button className="btn-ghost !p-0 text-sm text-brand-600 dark:text-brand-400" onClick={() => setOpenGroupId(null)}>← All groups</button>
              <h2 className="mt-1 text-lg font-bold">{openGroup.label}</h2>
              <div className="text-xs text-slate-400">📅 {fmtDate(openGroup.createdAt)} · {openGroup.questions.length} questions</div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary !py-1 text-xs" onClick={() => setImportOpen(true)}>＋ Add to group</button>
              <button className="btn-ghost !py-1 text-xs text-red-500" onClick={() => { if (confirm('Delete this group?')) { deleteGroup(openGroup.id); refresh(); setOpenGroupId(null); } }}>🗑 Delete group</button>
            </div>
          </div>
          <div className="space-y-2">
            {openGroup.questions.map((b) => (
              <div key={b.id} className="card !p-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill color="brand">{b.category || 'General'}</Pill>
                  {b.tags.map((t) => <Pill key={t} color="slate">#{t}</Pill>)}
                </div>
                <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">{b.question}</p>
                <div className="mt-2 space-y-0.5 text-xs text-slate-500 dark:text-slate-300">
                  {b.options.map((o, oi) => (
                    <div key={oi} className={oi === b.answer ? 'font-medium text-green-600' : ''}>
                      {String.fromCharCode(65 + oi)}. {o} {oi === b.answer ? '✓' : ''}
                    </div>
                  ))}
                </div>
                {b.explanation && <div className="mt-2 text-xs text-slate-400">💡 {b.explanation}</div>}
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">Added {fmtDate(b.addedAt)}</span>
                  <button className="btn-ghost !p-1 text-xs hover:!text-red-500" onClick={() => removeQuestion(openGroup.id, b.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* ---- Group cards: label + date + count, click to open ---- */
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((g) => (
            <div key={g.id} className="card flex cursor-pointer flex-col justify-between transition-colors hover:border-brand-400" onClick={() => setOpenGroupId(g.id)}>
              <div>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{g.label}</h3>
                  <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-900 dark:text-brand-300">{g.questions.length}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">📅 {fmtDate(g.createdAt)}</div>
                <p className="mt-2 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{g.questions[0]?.question || 'No questions'}</p>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <button className="btn-secondary !py-1 text-xs" onClick={(e) => { e.stopPropagation(); setRenameId(g.id); setRenameVal(g.label); }}>✏️ Rename</button>
                <span className="text-xs text-brand-600 dark:text-brand-400">Open →</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rename modal */}
      <Modal open={!!renameId} onClose={() => setRenameId(null)} title="Rename group">
        <div className="space-y-3">
          <input className="input" value={renameVal} onChange={(e) => setRenameVal(e.target.value)} autoFocus />
          <button className="btn-primary w-full" onClick={() => { if (renameId) renameGroup(renameId, renameVal); setRenameId(null); refresh(); }}>Rename ✓</button>
        </div>
      </Modal>

      {/* Import modal */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setJsonText(''); setPreview(null); setMsg(''); setGroupLabel(''); }} title="Import questions (JSON)" wide>
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-200">📄 Accepted JSON format</p>
            <p>Paste a JSON <strong>array of question objects</strong>, or an object with a <code>"questions"</code> array. Each question needs <code>question</code>, <code>options</code> (≥2), <code>answer</code> (0-based), optional <code>explanation</code>.</p>
          </div>
          <div>
            <label className="label">Group label (shown on the card)</label>
            <input className="input" value={groupLabel} onChange={(e) => setGroupLabel(e.target.value)} placeholder={openGroup ? `Add to "${openGroup.label}"` : 'e.g. Week 3 — Pharmacology'} />
          </div>
          {!openGroup && (
            <div>
              <label className="label">Default category</label>
              <input className="input" value={importCat} onChange={(e) => setImportCat(e.target.value)} placeholder="e.g. Pharmacology" />
            </div>
          )}
          <div>
            <label className="label">JSON</label>
            <textarea className="input min-h-32 font-mono text-xs" value={jsonText} onChange={(e) => setJsonText(e.target.value)} placeholder='[{"question":"...","options":["A","B"],"answer":0}]' />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setImportOpen(false)}>Cancel</button>
            <button className="btn-secondary" onClick={doImport}>Preview</button>
            {preview && (
              <button className="btn-primary" onClick={confirmImport}>✓ Confirm import ({preview.length})</button>
            )}
          </div>
          {preview && (
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {preview.map((p, i) => (
                <div key={i} className="truncate text-xs text-slate-500 dark:text-slate-300">{i + 1}. {p.question}</div>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
