import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { useData } from '../stores/data';

interface Result {
  icon: string;
  kind: string;
  title: string;
  subtitle: string;
  route: string;
}

// Pages / tabs + app-wide actions (settings, theme, data) that the search can
// jump to — makes the search "very powerful" beyond just records.
const PAGES: Result[] = [
  { icon: '🏠', kind: 'Page', title: 'Home', subtitle: 'Dashboard', route: '/' },
  { icon: '📋', kind: 'Page', title: 'Clinical Days', subtitle: 'Record daily clinical activity', route: '/clinical' },
  { icon: '🎓', kind: 'Page', title: 'PharmD Journey', subtitle: 'Academic timeline, previous years, promotion', route: '/journey' },
  { icon: '🏥', kind: 'Page', title: 'Ward Rounds', subtitle: 'Capture learning during ward rounds', route: '/ward-rounds' },
  { icon: '📅', kind: 'Page', title: 'Calendar', subtitle: 'See clinical days on a calendar', route: '/calendar' },
  { icon: '🦠', kind: 'Page', title: 'Diseases', subtitle: 'Conditions, WHO→DT framework', route: '/diseases' },
  { icon: '💊', kind: 'Page', title: 'Medicines', subtitle: 'Drugs, mechanism, dosing', route: '/medicines' },
  { icon: '🧪', kind: 'Page', title: 'Investigations', subtitle: 'Labs and tests', route: '/investigations' },
  { icon: '❓', kind: 'Page', title: 'Questions', subtitle: 'Questions vault', route: '/questions' },
  { icon: '📚', kind: 'Page', title: 'Revision', subtitle: 'Revision engine', route: '/revision' },
  { icon: '📝', kind: 'Page', title: 'Quiz', subtitle: 'AI exam-style quizzes', route: '/quiz' },
  { icon: '📦', kind: 'Page', title: 'Bundles', subtitle: 'Automatic/manual/merged bundles', route: '/bundles' },
  { icon: '📊', kind: 'Page', title: 'Progress', subtitle: 'Stats and insights', route: '/progress' },
  { icon: '🤖', kind: 'Page', title: 'AI Chat', subtitle: 'Ask Clinical AI', route: '/ai' },
  { icon: '⚙️', kind: 'Page', title: 'Settings', subtitle: 'Appearance, AI config, data, account', route: '/settings' },
];

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const s = useData.getState();

  const ql = q.trim().toLowerCase();

  function matches(...vals: Array<string | undefined | null>): boolean {
    if (!ql) return false;
    return vals.some((v) => v && v.toLowerCase().includes(ql));
  }

  // App-wide actions (theme, data, ai) surfaced by keywords.
  const actionResults: Result[] = [];
  if (ql && matches('light', 'dark', 'theme', 'mode')) actionResults.push({ icon: '🎨', kind: 'Action', title: 'Theme / Light / Dark mode', subtitle: 'Change appearance in Settings', route: '/settings' });
  if (ql && matches('data', 'backup', 'export', 'import', 'clear', 'sample')) actionResults.push({ icon: '🗂', kind: 'Action', title: 'Data management', subtitle: 'Backup, import, export, sample data, clear', route: '/settings' });
  if (ql && matches('ai', 'api', 'key', 'model', 'openai', 'nvidia', 'gpt')) actionResults.push({ icon: '🤖', kind: 'Action', title: 'AI configuration', subtitle: 'API keys and models per module', route: '/settings' });
  if (ql && matches('account', 'login', 'sign', 'sync', 'cloud', 'password', 'reset')) actionResults.push({ icon: '☁️', kind: 'Action', title: 'Cloud account & sync', subtitle: 'Sign in, sync, forgot password', route: '/settings' });
  if (ql && matches('update', 'version', 'check')) actionResults.push({ icon: '🔄', kind: 'Action', title: 'Check for updates', subtitle: 'Version and updates', route: '/settings' });
  if (ql && matches('keyboard', 'shortcut', 'help', 'palette')) actionResults.push({ icon: '⌨️', kind: 'Action', title: 'Keyboard shortcuts', subtitle: 'Press ? or see Settings', route: '/' });

  const pageResults = PAGES.filter((p) => ql && matches(p.title, p.subtitle));

  let recordResults: Result[] = [];
  if (ql.length >= 1) {
    recordResults = [
      ...s.diseases.filter((d) => matches(d.name, d.what, d.why)).map((d) => ({ icon: '🦠', kind: 'Disease' as const, title: d.name, subtitle: d.what || 'Disease', route: '/diseases' })),
      ...s.medicines.filter((m) => matches(m.name, m.className, m.mechanism)).map((m) => ({ icon: '💊', kind: 'Medicine' as const, title: m.name, subtitle: m.className || 'Medicine', route: '/medicines' })),
      ...s.investigations.filter((i) => matches(i.name, i.interpretation, i.clinicalSignificance)).map((i) => ({ icon: '🧪', kind: 'Investigation' as const, title: i.name, subtitle: i.interpretation || 'Investigation', route: '/investigations' })),
      ...s.questions.filter((x) => matches(x.text)).map((x) => ({ icon: '❓', kind: 'Question' as const, title: x.text, subtitle: `${x.category} · ${x.status}`, route: '/questions' })),
      ...s.lessons.filter((l) => matches(l.title, l.content)).map((l) => ({ icon: '💡', kind: 'Lesson' as const, title: l.title, subtitle: 'Lesson', route: '/revision' })),
      ...s.bundles.filter((b) => matches(b.title, b.summary)).map((b) => ({ icon: '📦', kind: 'Bundle' as const, title: b.title, subtitle: b.type, route: '/bundles' })),
      ...s.days.filter((d) => matches(d.date, ...d.conditions, ...d.medicines)).map((d) => ({ icon: '📋', kind: 'Day' as const, title: `Clinical Day ${d.dayNumber}`, subtitle: `${d.date} · ${d.site}`, route: '/clinical' })),
      ...s.wardRounds.filter((r) => matches(r.ward, r.date, r.focus)).map((r) => ({ icon: '🏥', kind: 'Ward round' as const, title: `${r.ward}`, subtitle: `${r.date}${r.focus ? ' · ' + r.focus : ''}`, route: `/ward-rounds?round=${r.id}` })),
      ...s.wardEntries.filter((e) => matches(e.title, e.content)).map((e) => ({ icon: '🏥', kind: 'Ward capture' as const, title: e.title || e.content.slice(0, 60), subtitle: e.title && e.content ? e.content.slice(0, 70) : 'Ward round capture', route: `/ward-rounds?round=${e.roundId}` })),
      // PharmD-side records are part of the SAME dataset, so they are
      // searchable from anywhere in the app.
      ...s.academicStages.filter((a) => matches(a.name, a.academicYear, a.level)).map((a) => ({ icon: '🎓', kind: 'Academic year' as const, title: a.name, subtitle: `${a.academicYear} · ${a.status}`, route: '/archive' })),
      ...s.courses.filter((c) => matches(c.title, c.code)).map((c) => ({ icon: '📚', kind: 'Course' as const, title: c.title, subtitle: c.code || 'Course', route: '/courses' })),
    ];
  }

  const results = [...actionResults, ...pageResults, ...recordResults].slice(0, 50);

  function go(r: Result) {
    setQ('');
    onClose();
    navigate(r.route);
  }

  return (
    <Modal open={open} onClose={() => { setQ(''); onClose(); }} title="🔍 Global Search">
      <input
        autoFocus
        className="input mb-4"
        placeholder="Search records, pages, AI, settings, theme, data…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {ql.length === 0 ? (
        <div className="text-sm text-slate-400">
          <p className="mb-2">Type to search across everything:</p>
          <div className="flex flex-wrap gap-1.5">
            {['disease', 'medicine', 'hypertension', 'amlodipine', 'ai', 'light mode', 'quiz', 'data', 'sync', 'theme'].map((x) => (
              <button key={x} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 hover:bg-brand-100 dark:bg-slate-700 dark:text-slate-300" onClick={() => setQ(x)}>{x}</button>
            ))}
          </div>
        </div>
      ) : results.length === 0 ? (
        <p className="text-sm text-slate-400">No results for “{q}”.</p>
      ) : (
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {results.map((r, i) => (
            <button
              key={i}
              className="flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-brand-50 dark:hover:bg-brand-900"
              onClick={() => go(r)}
            >
              <span className="mt-0.5 text-lg">{r.icon}</span>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{r.title}</div>
                <div className="truncate text-xs text-slate-400">{r.subtitle}</div>
              </div>
              <span className="ml-auto shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:bg-slate-700">{r.kind}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
