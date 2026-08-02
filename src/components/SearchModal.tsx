import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { useData } from '../stores/data';

interface Result {
  icon: string;
  module: 'disease' | 'medicine' | 'investigation' | 'question' | 'day' | 'lesson' | 'bundle';
  title: string;
  subtitle: string;
  route: string;
}

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const navigate = useNavigate();
  const s = useData.getState();

  const ql = q.trim().toLowerCase();

  function matches(...vals: Array<string | undefined | null>): boolean {
    if (!ql) return false;
    return vals.some((v) => v && v.toLowerCase().includes(ql));
  }

  let results: Result[] = [];
  if (ql.length >= 1) {
    results = [
      ...s.diseases
        .filter((d) => matches(d.name, d.what, d.why))
        .map((d) => ({ icon: '🦠', module: 'disease' as const, title: d.name, subtitle: d.what || 'Disease', route: '/diseases' })),
      ...s.medicines
        .filter((m) => matches(m.name, m.className, m.mechanism))
        .map((m) => ({ icon: '💊', module: 'medicine' as const, title: m.name, subtitle: m.className || 'Medicine', route: '/medicines' })),
      ...s.investigations
        .filter((i) => matches(i.name, i.interpretation, i.clinicalSignificance))
        .map((i) => ({ icon: '🧪', module: 'investigation' as const, title: i.name, subtitle: i.interpretation || 'Investigation', route: '/investigations' })),
      ...s.questions
        .filter((x) => matches(x.text))
        .map((x) => ({ icon: '❓', module: 'question' as const, title: x.text, subtitle: `${x.category} · ${x.status}`, route: '/questions' })),
      ...s.lessons
        .filter((l) => matches(l.title, l.content))
        .map((l) => ({ icon: '💡', module: 'lesson' as const, title: l.title, subtitle: 'Lesson', route: '/revision' })),
      ...s.bundles
        .filter((b) => matches(b.title, b.summary))
        .map((b) => ({ icon: '📦', module: 'bundle' as const, title: b.title, subtitle: b.type, route: '/bundles' })),
      ...s.days
        .filter((d) => matches(d.date, ...d.conditions, ...d.medicines))
        .map((d) => ({ icon: '📋', module: 'day' as const, title: `Clinical Day ${d.dayNumber}`, subtitle: `${d.date} · ${d.site}`, route: '/clinical' })),
    ];
    results = results.slice(0, 40);
  }

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
        placeholder="Search diseases, medicines, labs, questions, days, bundles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {ql.length === 0 ? (
        <p className="text-sm text-slate-400">Type to search everything in your clinical knowledge base.</p>
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
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
