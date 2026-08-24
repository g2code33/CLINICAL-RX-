import { useMemo, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { useUi } from '../stores/ui';
import { retrieveKnowledge } from '../services/intelligence';

/**
 * ⌘K COMMAND BAR
 *
 * One bar, four destinations. Whatever the student types is routed to the
 * right place:
 *   - a page name        → NAVIGATE
 *   - words in a record  → SEARCH their real data (deterministic, offline-safe)
 *   - a question         → ASK AI
 *   - a verb like "new"  → APP ACTION
 *
 * Records are matched through the Intelligence Layer, so the bar reaches
 * everything in the app and keeps working with no internet and no AI.
 */

interface Command {
  id: string;
  icon: string;
  label: string;
  hint?: string;
  group?: 'ai' | 'record' | 'action' | 'navigate';
  run: () => void;
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen);
  const setOpen = useUi((s) => s.setPaletteOpen);
  const navigate = useNavigate();
  const setSearchOpen = useUi((s) => s.setSearchOpen);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const s = useData.getState();
    const go = (r: string) => () => { setOpen(false); navigate(r); };
    const base: Command[] = [
      { id: 'home', icon: '🏠', label: 'Go to Home', run: go('/') },
      { id: 'days', icon: '📋', label: 'Clinical Days', run: go('/clinical') },
      { id: 'journey', icon: '🎓', label: 'PharmD Journey', run: go('/journey') },
      { id: 'wardrounds', icon: '🏥', label: 'Ward Rounds', run: go('/ward-rounds') },
      { id: 'calendar', icon: '📅', label: 'Calendar', run: go('/calendar') },
      { id: 'diseases', icon: '🦠', label: 'Diseases', run: go('/diseases') },
      { id: 'medicines', icon: '💊', label: 'Medicines', run: go('/medicines') },
      { id: 'investigations', icon: '🧪', label: 'Investigations', run: go('/investigations') },
      { id: 'questions', icon: '❓', label: 'Questions', run: go('/questions') },
      { id: 'revision', icon: '📚', label: 'Revision', run: go('/revision') },
      { id: 'bundles', icon: '📦', label: 'Bundles', run: go('/bundles') },
      { id: 'progress', icon: '📊', label: 'Progress', run: go('/progress') },
      // Phase 6 — PharmD Journey sections
      { id: 'clinexp', icon: '🏥', label: 'Clinical Experience', hint: 'Rotations', run: go('/journey/clinical-experience') },
      { id: 'skills', icon: '🧠', label: 'Skills', run: go('/journey/skills') },
      { id: 'projects', icon: '💻', label: 'Projects', run: go('/journey/projects') },
      { id: 'research', icon: '🔬', label: 'Research', run: go('/journey/research') },
      { id: 'leadership', icon: '🏅', label: 'Leadership & Activities', run: go('/journey/leadership') },
      { id: 'achievements', icon: '🏆', label: 'Achievements', run: go('/journey/achievements') },
      { id: 'certs', icon: '📜', label: 'Certifications', run: go('/journey/certifications') },
      { id: 'goals', icon: '🎯', label: 'Goals', run: go('/journey/goals') },
      { id: 'portfolio', icon: '📁', label: 'Portfolio & CV', run: go('/journey/portfolio') },
      { id: 'acadarchive', icon: '📚', label: 'Academic Archive', run: go('/journey/archive') },
      { id: 'protimeline', icon: '📈', label: 'Professional Timeline', run: go('/journey/timeline') },
      { id: 'ai', icon: '🤖', label: 'AI Workspace', run: go('/ai') },
      { id: 'settings', icon: '⚙️', label: 'Settings', run: go('/settings') },
      { id: 'sync', icon: '☁️', label: 'Sync Center', hint: 'Account, sync & backup', run: go('/sync') },
      { id: 'security', icon: '🔐', label: 'Security & Privacy', hint: 'App Lock, privacy, activity', run: go('/settings/security') },
      { id: 'search', icon: '🔍', label: 'Open global search', run: () => { setOpen(false); setSearchOpen(true); } },
      { id: 'newday', icon: '＋', label: 'New clinical day', run: () => { setOpen(false); navigate('/clinical'); } },
      { id: 'newround', icon: '🏥', label: 'Start ward round', run: () => { setOpen(false); navigate('/ward-rounds'); } },
      { id: 'quickadd', icon: '⚡', label: 'Capture by typing (AI extract)', run: () => { setOpen(false); navigate('/ai-capture'); } },
      { id: 'autodaily', icon: '🤖', label: 'Generate auto daily bundle', hint: 'Bundle Library', run: () => { setOpen(false); navigate('/bundles'); } },
    ];
    for (const b of base) b.group = b.group ?? 'navigate';
    const dynamic: Command[] = [];
    for (const d of s.diseases.slice(0, 5)) dynamic.push({ id: 'd-' + d.id, icon: '🦠', label: 'Disease: ' + d.name, hint: 'Open', group: 'record', run: () => { setOpen(false); navigate('/diseases'); } });
    for (const m of s.medicines.slice(0, 5)) dynamic.push({ id: 'm-' + m.id, icon: '💊', label: 'Medicine: ' + m.name, hint: 'Open', group: 'record', run: () => { setOpen(false); navigate('/medicines'); } });
    return [...base, ...dynamic];
  }, [navigate, setOpen, setSearchOpen]);

  /** Route map from a record's module to the page that shows it. */
  const ROUTES: Record<string, string> = {
    disease: '/diseases',
    medicine: '/medicines',
    investigation: '/investigations',
    question: '/questions',
    lesson: '/notes',
    wardRound: '/ward-rounds',
    wardEntry: '/ward-rounds',
    bundle: '/bundles',
    course: '/courses',
    revision: '/revision',
    quiz: '/quiz',
    day: '/clinical',
    academicStage: '/journey',
    clinicalExperience: '/journey/clinical-experience',
    skill: '/journey/skills',
    project: '/journey/projects',
    research: '/journey/research',
    leadership: '/journey/leadership',
    achievement: '/journey/achievements',
    certification: '/journey/certifications',
    goal: '/journey/goals',
  };

  /**
   * Live results from the student's real records, plus an "Ask AI" row when
   * the input reads like a question. Retrieval is deterministic, so this list
   * appears whether or not AI is configured.
   */
  const smart = useMemo<Command[]>(() => {
    const query = q.trim();
    if (query.length < 2) return [];
    const out: Command[] = [];

    const looksLikeQuestion =
      /\?$/.test(query) ||
      /^(what|why|how|when|where|which|who|explain|compare|summar|quiz|tell me)\b/i.test(query) ||
      query.split(/\s+/).length >= 4;

    if (looksLikeQuestion) {
      out.push({
        id: 'ask-ai',
        icon: '🤖',
        label: `Ask AI: "${query}"`,
        hint: 'AI',
        group: 'ai',
        run: () => {
          setOpen(false);
          navigate(`/ai?q=${encodeURIComponent(query)}`);
        },
      });
    }

    try {
      const found = retrieveKnowledge({ query, limit: 6 });
      for (const r of found.records) {
        out.push({
          id: `r-${r.module}-${r.id}`,
          icon: '📄',
          label: r.title,
          hint: String(r.module),
          group: 'record',
          run: () => {
            setOpen(false);
            navigate(ROUTES[String(r.module)] ?? '/');
          },
        });
      }
    } catch {
      /* retrieval must never break the bar */
    }

    out.push({
      id: 'full-search',
      icon: '🔍',
      label: `Search all records for "${query}"`,
      hint: 'Search',
      group: 'action',
      run: () => {
        setOpen(false);
        setSearchOpen(true);
      },
    });

    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, navigate, setOpen, setSearchOpen]);

  const matches = commands.filter((c) => {
    if (!q.trim()) return true;
    return c.label.toLowerCase().includes(q.toLowerCase()) || (c.hint ?? '').toLowerCase().includes(q.toLowerCase());
  });
  // Smart results (AI + real records) lead; static commands follow.
  const filtered = q.trim().length >= 2 ? [...smart, ...matches.slice(0, 6)] : matches;

  useEffect(() => {
    setSel(0);
  }, [q]);

  if (!open) return null;

  const pick = (c: Command) => c.run();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className="text-slate-400">⌘</span>
          <input
            ref={inputRef}
            className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            placeholder="Search records, ask AI, or jump to a page…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, filtered.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
              else if (e.key === 'Enter' && filtered[sel]) pick(filtered[sel]);
              else if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
        <div className="max-h-80 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-4 text-center text-sm text-slate-400">Nothing matched. Try different words.</p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${i === sel ? 'bg-brand-600 text-white' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'}`}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(c)}
              >
                <span>{c.icon}</span>
                <span className="flex-1">{c.label}</span>
                {c.hint && <span className="text-xs opacity-60">{c.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
