import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from './Modal';
import { useData } from '../stores/data';
import { loadConversations } from '../services/aiConversations';

interface Result {
  icon: string;
  /** Module this result belongs to — drives the grouping (§7). */
  group: string;
  title: string;
  subtitle: string;
  route: string;
}

/**
 * 🔎 GLOBAL SEARCH (Phase 9 §6–7)
 *
 * One search box across every module. Results are grouped by module rather
 * than dumped in a flat list, because a student searching "warfarin" wants to
 * see at a glance that it appears in a Medicine record, two Ward Rounds and a
 * Question — not scroll through 40 undifferentiated rows.
 *
 * Every result is openable and keyboard reachable (arrow keys + Enter).
 */

// Order matters: this is the order groups appear in the results list.
const GROUP_ORDER = [
  'Learning',
  'Medicines',
  'Diseases',
  'Investigations',
  'Questions',
  'Ward Rounds',
  'Clinical Days',
  'Bundles',
  'Courses',
  'Skills',
  'Projects',
  'Research',
  'Achievements',
  'Goals',
  'AI Conversations',
  'Academic',
  'Pages',
  'Actions',
];

const PAGES: Result[] = [
  { icon: '🏠', group: 'Pages', title: 'Dashboard', subtitle: 'Home', route: '/' },
  { icon: '📚', group: 'Pages', title: 'Learning', subtitle: 'Notes and learning overview', route: '/learning' },
  { icon: '📋', group: 'Pages', title: 'Clinical Days', subtitle: 'Record daily clinical activity', route: '/clinical' },
  { icon: '🎓', group: 'Pages', title: 'PharmD Journey', subtitle: 'Academic timeline, previous years, promotion', route: '/journey' },
  { icon: '🏥', group: 'Pages', title: 'Ward Rounds', subtitle: 'Capture learning during ward rounds', route: '/ward-rounds' },
  { icon: '📅', group: 'Pages', title: 'Calendar', subtitle: 'See clinical days on a calendar', route: '/calendar' },
  { icon: '🦠', group: 'Pages', title: 'Diseases', subtitle: 'Conditions, WHO→DT framework', route: '/diseases' },
  { icon: '💊', group: 'Pages', title: 'Medicines', subtitle: 'Drugs, mechanism, dosing', route: '/medicines' },
  { icon: '🧪', group: 'Pages', title: 'Investigations', subtitle: 'Labs and tests', route: '/investigations' },
  { icon: '❓', group: 'Pages', title: 'Questions', subtitle: 'Questions vault', route: '/questions' },
  { icon: '🧠', group: 'Pages', title: 'Revision', subtitle: 'Revision engine', route: '/revision' },
  { icon: '📝', group: 'Pages', title: 'Quiz', subtitle: 'AI exam-style quizzes', route: '/quiz' },
  { icon: '📦', group: 'Pages', title: 'Bundles', subtitle: 'Automatic, manual and merged bundles', route: '/bundles' },
  { icon: '📊', group: 'Pages', title: 'Progress', subtitle: 'Stats and insights', route: '/progress' },
  { icon: '🤖', group: 'Pages', title: 'AI Workspace', subtitle: 'Ask CLINICAL Rx AI', route: '/ai' },
  { icon: '📁', group: 'Pages', title: 'Portfolio', subtitle: 'Professional portfolio and CV builder', route: '/journey/portfolio' },
  { icon: '⭐', group: 'Pages', title: 'Skills', subtitle: 'Competencies and evidence', route: '/journey/skills' },
  { icon: '🎯', group: 'Pages', title: 'Goals', subtitle: 'Goals and milestones', route: '/journey/goals' },
  { icon: '☁️', group: 'Pages', title: 'Sync Center', subtitle: 'Cloud sync and backup', route: '/sync' },
  { icon: '⚙️', group: 'Pages', title: 'Settings', subtitle: 'Appearance, AI, data, account', route: '/settings' },
  { icon: '🔒', group: 'Pages', title: 'Security & Privacy', subtitle: 'App lock, audit log, privacy', route: '/settings/security' },
];

export function SearchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const navigate = useNavigate();

  // Subscribe so results stay live while the modal is open.
  const store = useData();

  const ql = q.trim().toLowerCase();

  const results = useMemo<Result[]>(() => {
    if (!ql) return [];
    const s = store;
    const hit = (...vals: Array<string | undefined | null>) => vals.some((v) => v && v.toLowerCase().includes(ql));

    const out: Result[] = [];

    // ---- Records, module by module -------------------------------------
    for (const m of s.medicines) {
      if (hit(m.name, m.className, m.mechanism)) {
        out.push({ icon: '💊', group: 'Medicines', title: m.name, subtitle: m.className || 'Medicine', route: '/medicines' });
      }
    }
    for (const d of s.diseases) {
      if (hit(d.name, d.what, d.why)) {
        out.push({ icon: '🦠', group: 'Diseases', title: d.name, subtitle: d.what || 'Disease', route: '/diseases' });
      }
    }
    for (const i of s.investigations) {
      if (hit(i.name, i.interpretation, i.clinicalSignificance)) {
        out.push({ icon: '🧪', group: 'Investigations', title: i.name, subtitle: i.interpretation || 'Investigation', route: '/investigations' });
      }
    }
    for (const x of s.questions) {
      if (hit(x.text)) {
        out.push({ icon: '❓', group: 'Questions', title: x.text, subtitle: `${x.category} · ${x.status}`, route: '/questions' });
      }
    }
    for (const l of s.lessons) {
      if (hit(l.title, l.content)) {
        out.push({ icon: '💡', group: 'Learning', title: l.title, subtitle: 'Learning note', route: '/notes' });
      }
    }
    for (const b of s.bundles) {
      if (hit(b.title, b.summary)) {
        out.push({ icon: '📦', group: 'Bundles', title: b.title, subtitle: b.type, route: '/bundles' });
      }
    }
    for (const d of s.days) {
      if (hit(d.date, d.site, ...(d.conditions ?? []), ...(d.medicines ?? []))) {
        out.push({ icon: '📋', group: 'Clinical Days', title: `Clinical Day ${d.dayNumber}`, subtitle: `${d.date} · ${d.site}`, route: '/clinical' });
      }
    }
    for (const r of s.wardRounds) {
      if (hit(r.ward, r.date, r.focus)) {
        out.push({ icon: '🏥', group: 'Ward Rounds', title: r.ward, subtitle: `${r.date}${r.focus ? ' · ' + r.focus : ''}`, route: `/ward-rounds?round=${r.id}` });
      }
    }
    for (const e of s.wardEntries) {
      if (hit(e.title, e.content)) {
        out.push({
          icon: '🏥',
          group: 'Ward Rounds',
          title: e.title || e.content.slice(0, 60),
          subtitle: e.title && e.content ? e.content.slice(0, 70) : 'Ward round capture',
          route: `/ward-rounds?round=${e.roundId}`,
        });
      }
    }
    for (const c of s.courses) {
      if (hit(c.title, c.code)) {
        out.push({ icon: '📚', group: 'Courses', title: c.title, subtitle: c.code || 'Course', route: '/courses' });
      }
    }

    // ---- Professional / career records (same dataset, §6) ---------------
    for (const k of s.skills) {
      if (hit(k.title, k.description, k.notes)) {
        out.push({ icon: '⭐', group: 'Skills', title: k.title, subtitle: `${k.category} · ${k.confidence}/5`, route: '/journey/skills' });
      }
    }
    for (const p of s.projects) {
      if (hit(p.title, p.description, p.role, p.outcomes)) {
        out.push({ icon: '💻', group: 'Projects', title: p.title, subtitle: `${p.status}${p.role ? ' · ' + p.role : ''}`, route: '/journey/projects' });
      }
    }
    for (const r of s.research) {
      if (hit(r.title, r.description, r.topic)) {
        out.push({ icon: '🔬', group: 'Research', title: r.title, subtitle: r.kind, route: '/journey/research' });
      }
    }
    for (const a of s.achievements) {
      if (hit(a.title, a.description)) {
        out.push({ icon: '🏆', group: 'Achievements', title: a.title, subtitle: `${a.category} · ${a.date}`, route: '/journey/achievements' });
      }
    }
    for (const g of s.goals) {
      if (hit(g.title, g.description, g.notes)) {
        out.push({ icon: '🎯', group: 'Goals', title: g.title, subtitle: `${g.category} · ${g.status}`, route: '/journey/goals' });
      }
    }
    for (const a of s.academicStages) {
      if (hit(a.name, a.academicYear, a.level)) {
        out.push({ icon: '🎓', group: 'Academic', title: a.name, subtitle: `${a.academicYear} · ${a.status}`, route: `/journey/archive?stage=${a.id}` });
      }
    }

    // ---- AI conversations (§6) ------------------------------------------
    try {
      for (const c of loadConversations()) {
        const inTitle = hit(c.title);
        const inBody = c.messages?.some((m) => hit(m.content));
        if (inTitle || inBody) {
          out.push({ icon: '🤖', group: 'AI Conversations', title: c.title, subtitle: `${c.module} · ${c.messages?.length ?? 0} messages`, route: '/ai' });
        }
      }
    } catch {
      // Conversations live in local storage; a read failure must never break search.
    }

    // ---- Pages & actions --------------------------------------------------
    for (const p of PAGES) if (hit(p.title, p.subtitle)) out.push(p);

    const action = (icon: string, title: string, subtitle: string, route: string, ...keys: string[]) => {
      if (hit(...keys)) out.push({ icon, group: 'Actions', title, subtitle, route });
    };
    action('🎨', 'Appearance & theme', 'Light, dark or system', '/settings', 'light', 'dark', 'theme', 'appearance', 'contrast');
    action('🗂', 'Data management', 'Backup, import, export, clear', '/settings', 'data', 'backup', 'export', 'import', 'clear');
    action('🤖', 'AI configuration', 'Providers, keys and models', '/settings/ai', 'ai', 'api', 'key', 'model', 'provider', 'local', 'cloud');
    action('☁️', 'Cloud account & sync', 'Sign in, sync, restore', '/sync', 'account', 'login', 'sign', 'sync', 'cloud', 'password');
    action('🔒', 'Security & privacy', 'App lock, audit log', '/settings/security', 'lock', 'security', 'privacy', 'pin', 'audit');
    action('⌨️', 'Keyboard shortcuts', 'Press ? to view all shortcuts', '/settings', 'keyboard', 'shortcut', 'hotkey');

    return out.slice(0, 100);
  }, [ql, store]);

  // Group results, preserving GROUP_ORDER.
  const grouped = useMemo(() => {
    const map = new Map<string, Result[]>();
    for (const r of results) {
      const list = map.get(r.group) ?? [];
      list.push(r);
      map.set(r.group, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ group: g, items: map.get(g)! }));
  }, [results]);

  // Flattened order = what arrow keys walk through.
  const flat = useMemo(() => grouped.flatMap((g) => g.items), [grouped]);

  function go(r: Result) {
    setQ('');
    setCursor(0);
    onClose();
    navigate(r.route);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, flat.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === 'Enter' && flat[cursor]) {
      e.preventDefault();
      go(flat[cursor]);
    }
  }

  let runningIndex = -1;

  return (
    <Modal
      open={open}
      onClose={() => {
        setQ('');
        setCursor(0);
        onClose();
      }}
      title="🔎 Search everything"
      wide
    >
      <input
        autoFocus
        type="search"
        className="input mb-1"
        placeholder="Search notes, medicines, ward rounds, bundles, skills, AI chats…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
        }}
        onKeyDown={onKeyDown}
        aria-label="Search all records"
        aria-describedby="search-hint"
      />
      <p id="search-hint" className="mb-3 text-[11px] text-slate-400">
        Use ↑ ↓ to move between results, Enter to open, Esc to close.
      </p>

      {ql.length === 0 ? (
        <div className="text-sm text-slate-400">
          <p className="mb-2">Search across every module — records, pages and settings.</p>
          <div className="flex flex-wrap gap-1.5">
            {['hypertension', 'amlodipine', 'ward round', 'bundle', 'skills', 'goal', 'ai', 'theme', 'backup'].map((x) => (
              <button
                key={x}
                className="focus-ring rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 hover:bg-brand-100 dark:bg-slate-700 dark:text-slate-300"
                onClick={() => setQ(x)}
              >
                {x}
              </button>
            ))}
          </div>
        </div>
      ) : flat.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center dark:border-slate-600">
          <p className="text-sm font-medium">No results for “{q}”.</p>
          <p className="mt-1 text-xs text-slate-400">Try a shorter word, or check a different module.</p>
        </div>
      ) : (
        <>
          <p className="sr-only" role="status" aria-live="polite">
            {flat.length} results in {grouped.length} modules
          </p>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto">
            {grouped.map(({ group, items }) => (
              <section key={group}>
                <h3 className="mb-1 px-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  {group} <span className="font-normal">({items.length})</span>
                </h3>
                <div className="space-y-0.5">
                  {items.map((r, i) => {
                    runningIndex += 1;
                    const active = runningIndex === cursor;
                    return (
                      <button
                        key={`${group}-${i}`}
                        className={`focus-ring flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left ${
                          active ? 'bg-brand-100 dark:bg-brand-900' : 'hover:bg-brand-50 dark:hover:bg-brand-900/50'
                        }`}
                        onClick={() => go(r)}
                      >
                        <span className="mt-0.5 text-lg" aria-hidden="true">
                          {r.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{r.title}</span>
                          <span className="block truncate text-xs text-slate-400">{r.subtitle}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
