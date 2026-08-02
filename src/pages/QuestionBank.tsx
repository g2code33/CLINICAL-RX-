import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, EmptyState, Pill } from '../components/ui';
import { Modal } from '../components/Modal';
import { loadBank, saveBank, parseBankJson, type BankQuestion } from '../services/questionBank';

const SAMPLE_JSON = `[
  {
    "question": "Which class is amlodipine?",
    "options": ["CCB", "ACEi", "ARB", "Diuretic"],
    "answer": 0,
    "explanation": "Amlodipine is a dihydropyridine calcium channel blocker.",
    "category": "Pharmacology",
    "tags": ["antihypertensive"]
  },
  {
    "question": "First-line antimalarial for uncomplicated P. falciparum?",
    "options": ["Chloroquine", "Artemether/Lumefantrine", "Mefloquine", "Quinine"],
    "answer": 1,
    "explanation": "ACT (artemether/lumefantrine) is first-line for uncomplicated malaria.",
    "category": "Therapeutics",
    "tags": ["malaria"]
  }
]`;

export function QuestionBank() {
  const navigate = useNavigate();
  const [bank, setBank] = useState<BankQuestion[]>(() => loadBank());
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('all');
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState('');
  const [importCat, setImportCat] = useState('Imported');
  const [msg, setMsg] = useState('');
  const [preview, setPreview] = useState<BankQuestion[] | null>(null);

  const categories = Array.from(new Set(bank.map((b) => b.category).filter(Boolean)));

  function refresh() {
    setBank(loadBank());
  }

  function doImport() {
    const parsed = parseBankJson(jsonText, importCat);
    if (!parsed.ok) {
      setMsg('⚠️ ' + (parsed.error || 'Invalid'));
      setPreview(null);
      return;
    }
    setPreview(parsed.items);
    setMsg(`Found ${parsed.items.length} valid question(s). Review then confirm.`);
  }

  function confirmImport() {
    if (!preview || !preview.length) return;
    const existing = loadBank();
    saveBank([...existing, ...preview]);
    setPreview(null);
    setJsonText('');
    setImportOpen(false);
    setMsg('');
    refresh();
  }

  function remove(id: string) {
    saveBank(bank.filter((b) => b.id !== id));
    refresh();
  }

  function clearAll() {
    if (confirm('Delete ALL question bank items?')) {
      saveBank([]);
      refresh();
    }
  }

  const ql = search.trim().toLowerCase();
  const filtered = bank.filter((b) => {
    if (cat !== 'all' && b.category !== cat) return false;
    if (ql && !(b.question.toLowerCase().includes(ql) || b.tags.some((t) => t.toLowerCase().includes(ql)))) return false;
    return true;
  });

  return (
    <div>
      <PageHeader
        title="Question Bank"
        subtitle="Your personal bank of questions — neatly organized by category and tags. Start a quiz from these."
        action={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>⬆ Import JSON</button>
            <button className="btn-primary" onClick={() => navigate('/quiz')}>Start Quiz →</button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input className="input max-w-sm" placeholder="🔍 Search bank (question or tag)…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-[200px]" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-slate-400">{filtered.length} of {bank.length} shown</span>
        {bank.length > 0 && <button className="btn-ghost !py-1 text-xs !text-red-500" onClick={clearAll}>Clear all</button>}
      </div>

      {bank.length === 0 ? (
        <EmptyState
          icon="🗂"
          title="Question bank is empty"
          hint="Import questions from a JSON file to build your own bank — then generate a quiz from them."
          actions={<button className="btn-primary" onClick={() => setImportOpen(true)}>⬆ Import JSON</button>}
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon="🔍" title="No questions match" hint="Try a different search or category." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((b) => (
            <div key={b.id} className="card flex flex-col justify-between">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Pill color="brand">{b.category || 'General'}</Pill>
                  {b.tags.map((t) => <Pill key={t} color="slate">#{t}</Pill>)}
                </div>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{b.question}</p>
                <div className="mt-2 space-y-0.5 text-xs text-slate-500 dark:text-slate-300">
                  {b.options.map((o, oi) => (
                    <div key={oi} className={oi === b.answer ? 'font-medium text-green-600' : ''}>
                      {String.fromCharCode(65 + oi)}. {o} {oi === b.answer ? '✓' : ''}
                    </div>
                  ))}
                </div>
                {b.explanation && <div className="mt-2 text-xs text-slate-400">💡 {b.explanation}</div>}
              </div>
              <button className="btn-ghost !py-1 text-xs hover:!text-red-500" onClick={() => remove(b.id)}>Delete</button>
            </div>
          ))}
        </div>
      )}

      {/* Import modal */}
      <Modal open={importOpen} onClose={() => { setImportOpen(false); setJsonText(''); setPreview(null); setMsg(''); }} title="Import questions (JSON)" wide>
        <div className="space-y-3">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">
            <p className="mb-1 font-semibold text-slate-600 dark:text-slate-200">📄 Accepted JSON format</p>
            <p>Paste a JSON <strong>array of question objects</strong>, or an object with a <code>"questions"</code> array. Each question:</p>
            <pre className="mt-1 whitespace-pre-wrap rounded bg-slate-100 p-2 text-[11px] dark:bg-slate-800">
{`{
  "question": "The question text",
  "options": ["A", "B", "C", "D"],
  "answer": 0,           // 0-based index of the correct option
  "explanation": "Optional 1-line explanation",
  "category": "Pharmacology",   // optional
  "tags": ["malaria"]           // optional
}`}
            </pre>
            <button className="mt-2 btn-ghost !p-0 text-xs text-brand-600" onClick={() => setJsonText(SAMPLE_JSON)}>Load sample JSON</button>
          </div>

          <div>
            <label className="label">Category for imported questions</label>
            <input className="input" value={importCat} onChange={(e) => setImportCat(e.target.value)} placeholder="e.g. Pharmacology" />
          </div>

          <textarea
            className="input"
            rows={8}
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder='Paste your JSON here, e.g. [{"question":"...","options":["A","B"],"answer":0}]'
          />

          {msg && <div className="rounded-lg bg-slate-50 p-2 text-sm text-slate-600 dark:bg-slate-700 dark:text-slate-200">{msg}</div>}

          {preview && preview.length > 0 && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2 dark:border-slate-700">
              {preview.map((p, i) => (
                <div key={i} className="text-xs text-slate-600 dark:text-slate-300">• {p.question} <span className="text-slate-400">({p.options.length} options)</span></div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setImportOpen(false)}>Cancel</button>
            {preview && preview.length > 0 ? (
              <button className="btn-primary" onClick={confirmImport}>✓ Confirm import ({preview.length})</button>
            ) : (
              <button className="btn-primary" onClick={doImport} disabled={!jsonText.trim()}>Preview</button>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}
