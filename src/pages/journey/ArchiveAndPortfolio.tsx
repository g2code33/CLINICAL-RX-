import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { Tabs } from '../../components/ui/primitives';
import { useData } from '../../stores/data';
import { allStages } from '../../services/academic';
import { stageArchive, portfolioRecords, exportableRecords, CAREER_MODULES } from '../../services/career';
import {
  AI_REVIEW_NOTICE,
  buildCv,
  cvToMarkdown,
  exportToMarkdown,
  portfolioToMarkdown,
  type Cv,
} from '../../services/portfolio';
import { downloadText, copyToClipboard } from '../../services/export';
import { askAi, availability } from '../../services/aiOrchestrator';
import { JourneyAiButton } from '../../components/JourneyAiButton';

/**
 * 📚 ACADEMIC ARCHIVE and 📁 PROFESSIONAL PORTFOLIO / 📄 CV
 *
 * The archive proves history is immutable: it reads records by their original
 * academic stamp, so a Level 200 page looks identical years after promotion.
 *
 * The portfolio proves privacy is real: it can only ever show records the
 * student explicitly promoted out of PRIVATE.
 */

// =========================================================================
// 📚 ACADEMIC ARCHIVE
// =========================================================================

const ROUTES: Record<string, string> = {
  lesson: '/notes',
  disease: '/diseases',
  medicine: '/medicines',
  investigation: '/investigations',
  question: '/questions',
  revision: '/revision',
  wardRound: '/ward-rounds',
  bundle: '/bundles',
  course: '/courses',
  clinicalExperience: '/journey/clinical-experience',
  skill: '/journey/skills',
  achievement: '/journey/achievements',
  project: '/journey/projects',
  research: '/journey/research',
  leadership: '/journey/leadership',
  goal: '/journey/goals',
};

export function AcademicArchive() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const stages = useData((s) => s.academicStages);
  // Subscribe broadly so the archive reflects edits immediately.
  useData((s) => s.lessons);
  useData((s) => s.skills);

  const ordered = useMemo(() => allStages().slice().sort((a, b) => (b.order ?? 0) - (a.order ?? 0)), [stages]);
  const selected = params.get('stage') ?? ordered.find((s) => s.status !== 'current')?.id ?? ordered[0]?.id ?? '';
  const [query, setQuery] = useState('');

  const archive = useMemo(() => (selected ? stageArchive(selected) : null), [selected, stages]);

  const filtered = useMemo(() => {
    if (!archive) return [];
    const q = query.trim().toLowerCase();
    if (!q) return archive.groups;
    return archive.groups
      .map((g) => ({
        ...g,
        records: g.records.filter((r: any) =>
          JSON.stringify([r.title, r.name, r.ward, r.question, r.description]).toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.records.length > 0);
  }, [archive, query]);

  const titleOf = (r: any) => r.title ?? r.name ?? r.ward ?? r.question ?? 'Untitled';

  return (
    <div className="space-y-4">
      <PageHeader
        title="📚 Academic Archive"
        subtitle="Every previous level, exactly as you recorded it. Nothing is ever rewritten by progressing."
        action={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="archive"
              prompt="Review my academic archive across previous levels. Compare what I learned/recorded at each level and surface topics that have recurred (so I should really know them cold) and topics that appeared once and dropped off (so I should revisit)."
            />
            <button className="btn-secondary" onClick={() => navigate('/journey')}>
              ← Journey
            </button>
          </div>
        }
      />

      <div className="card">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Academic levels">
          {ordered.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={s.id === selected}
              className={`focus-ring rounded-full px-3 py-1 text-xs ${
                s.id === selected ? 'bg-brand-600 text-white' : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600'
              }`}
              onClick={() => setParams({ stage: s.id })}
            >
              <span aria-hidden="true">{s.status === 'current' ? '●' : s.status === 'completed' ? '✓' : '○'}</span>{' '}
              {s.name} · {s.academicYear}
              <span className="sr-only"> ({s.status})</span>
            </button>
          ))}
        </div>
        {ordered.length === 0 && <p className="text-sm opacity-70">No academic stages yet.</p>}
      </div>

      {archive?.snapshot && (
        <div className="card">
          <h2 className="font-semibold">
            {archive.stage?.name} — {archive.stage?.academicYear}
          </h2>
          <p className="text-xs opacity-70">
            {archive.stage?.status === 'completed' ? 'Archived level. ' : ''}All counts are real records stamped to this level.
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {Object.entries(archive.snapshot.counts)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => (
                <div key={k} className="rounded border border-slate-200 p-2 text-center dark:border-slate-700">
                  <div className="text-lg font-semibold">{v}</div>
                  <div className="text-[11px] capitalize opacity-70">{k.replace(/([A-Z])/g, ' $1')}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      <div className="card">
        <input
          className="input w-full"
          placeholder="Search inside this level…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="mt-1 text-xs opacity-70">Archived records stay fully searchable — offline, forever.</p>
      </div>

      {filtered.length === 0 ? (
        <div className="card text-center text-sm opacity-70">
          {query ? 'Nothing in this level matches that search.' : 'No records were recorded during this level.'}
        </div>
      ) : (
        filtered.map((g) => (
          <div className="card" key={g.key}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">
                {g.icon} {g.label} ({g.records.length})
              </h3>
              {ROUTES[g.key] && (
                <button className="text-xs underline" onClick={() => navigate(ROUTES[g.key])}>
                  Open section →
                </button>
              )}
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {g.records.slice(0, 50).map((r: any) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-1 dark:border-slate-700">
                  <span className="truncate">{titleOf(r)}</span>
                  <span className="text-xs opacity-60">{r.date ?? r.startDate ?? r.dateObtained ?? ''}</span>
                </li>
              ))}
            </ul>
            {g.records.length > 50 && (
              <p className="mt-1 text-xs opacity-60">Showing the first 50 of {g.records.length}.</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// =========================================================================
// 📁 PORTFOLIO + 📄 CV
// =========================================================================

export function PortfolioPage() {
  const navigate = useNavigate();
  // Re-render whenever any professional record changes.
  const skills = useData((s) => s.skills);
  const projects = useData((s) => s.projects);
  const experiences = useData((s) => s.clinicalExperiences);
  const achievements = useData((s) => s.achievements);
  const certifications = useData((s) => s.certifications);
  const research = useData((s) => s.research);
  const leadership = useData((s) => s.leadership);
  const goals = useData((s) => s.goals);

  const deps = [skills, projects, experiences, achievements, certifications, research, leadership, goals];

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inPortfolio = useMemo(() => portfolioRecords(), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const forExport = useMemo(() => exportableRecords(), deps);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cv = useMemo<Cv>(() => buildCv(), deps);

  const [tab, setTab] = useState<'portfolio' | 'cv' | 'ai'>('portfolio');
  const [edited, setEdited] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');

  const totalPrivate = useMemo(() => {
    const st = useData.getState();
    return CAREER_MODULES.reduce(
      (n, m) => n + (st.all(m.module) as any[]).filter((r) => (r.visibility ?? 'private') === 'private' && !r.archived).length,
      0
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const cvText = useMemo(() => {
    const merged: Cv = {
      ...cv,
      sections: cv.sections.map((s) => (edited[s.key] != null ? { ...s, lines: edited[s.key].split('\n').filter(Boolean) } : s)),
    };
    return cvToMarkdown(merged);
  }, [cv, edited]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="📁 Professional Portfolio"
        subtitle="Only what you explicitly choose to show. Everything else stays private."
        action={
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <JourneyAiButton
              section="portfolio"
              prompt="Critique my professional portfolio vs my private records. What's strong? What important evidence is still marked private that I should consider promoting? Suggest an ordering of sections for maximum CV impact and tell me what a recruiter would notice first."
            />
            <button className="btn-secondary" onClick={() => navigate('/journey')}>
              ← Journey
            </button>
          </div>
        }
      />

      <div className="card text-sm">
        <p>
          🔒 <strong>{totalPrivate}</strong> record{totalPrivate === 1 ? '' : 's'} are private and appear nowhere below.{' '}
          <strong>{inPortfolio.reduce((n, g) => n + g.records.length, 0)}</strong> are in your portfolio,{' '}
          <strong>{forExport.reduce((n, g) => n + g.records.length, 0)}</strong> are approved for export.
        </p>
        <p className="mt-1 text-xs opacity-70">
          Open any professional record and set its visibility to Portfolio or Export to include it here. Nothing is ever
          uploaded automatically.
        </p>
      </div>

      <Tabs
        items={[
          { key: 'portfolio' as const, label: 'Portfolio', icon: '📁' },
          { key: 'cv' as const, label: 'CV Builder', icon: '📄' },
          { key: 'ai' as const, label: 'Career AI', icon: '🎓' },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="Portfolio sections"
      />

      {status && <div className="card text-sm">{status}</div>}

      {tab === 'portfolio' && (
        <>
          {inPortfolio.length === 0 ? (
            <div className="card text-center">
              <div className="text-3xl">📁</div>
              <h3 className="mt-2 font-semibold">Your portfolio is empty</h3>
              <p className="mt-1 text-sm opacity-75">
                That is the safe default. Go to any skill, project or rotation and switch its visibility to 📁 Portfolio.
              </p>
            </div>
          ) : (
            inPortfolio.map((g) => (
              <div className="card" key={String(g.module)}>
                <h3 className="font-semibold">
                  {g.icon} {g.label} ({g.records.length})
                </h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {g.records.map((r: any) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{r.title}</span>
                      <span className="text-xs opacity-60">{r.visibility === 'export' ? '📤 export-approved' : '📁 portfolio'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}

          <div className="card flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => {
                downloadText('portfolio.md', portfolioToMarkdown());
                setStatus('📁 Portfolio exported (portfolio-visible records only).');
              }}
            >
              Export portfolio (.md)
            </button>
            <button
              className="btn-secondary"
              onClick={() => {
                downloadText('professional-export.md', exportToMarkdown());
                setStatus('📤 Exported only the records you approved for export.');
              }}
            >
              Export approved-only (.md)
            </button>
            <button
              className="btn-secondary"
              onClick={async () => {
                await copyToClipboard(portfolioToMarkdown());
                setStatus('Copied to clipboard.');
              }}
            >
              Copy portfolio
            </button>
          </div>
        </>
      )}

      {tab === 'cv' && (
        <>
          <div className="card border-amber-400/40 bg-amber-400/5 text-sm">
            <strong>{cv.reviewNotice}</strong>
            <p className="mt-1 text-xs opacity-80">
              This draft is assembled only from portfolio-visible records. Edit any section below before you export — the
              app will not embellish your experience for you.
            </p>
          </div>

          {cv.sections.map((s) => (
            <div className="card" key={s.key}>
              <h3 className="font-semibold">{s.heading}</h3>
              {s.lines.length === 0 ? (
                <p className="mt-1 text-xs opacity-70">
                  Nothing portfolio-visible for this section yet.
                </p>
              ) : (
                <textarea
                  className="input mt-2 w-full font-mono text-xs"
                  rows={Math.min(8, s.lines.length + 1)}
                  defaultValue={s.lines.join('\n')}
                  onBlur={(e) => setEdited({ ...edited, [s.key]: e.target.value })}
                />
              )}
            </div>
          ))}

          <div className="card flex flex-wrap gap-2">
            <button
              className="btn-primary"
              onClick={() => {
                downloadText('cv-draft.md', cvText);
                setStatus('📄 CV draft exported. Review every line before sending it anywhere.');
              }}
            >
              Export CV draft (.md)
            </button>
            <button
              className="btn-secondary"
              onClick={async () => {
                await copyToClipboard(cvText);
                setStatus('Copied. Remember to review before use.');
              }}
            >
              Copy CV draft
            </button>
          </div>
        </>
      )}

      {tab === 'ai' && <CareerAiPanel />}
    </div>
  );
}

// =========================================================================
// 🎓 CAREER AI
// =========================================================================

const CAREER_PROMPTS = [
  { label: 'Summarize my professional development', q: 'Summarise my professional development so far.' },
  { label: 'What skills have I developed?', q: 'What skills have I developed, and what evidence backs each one?' },
  { label: 'What are my strongest areas?', q: 'Based only on my records, what are my strongest areas?' },
  { label: 'What should I improve?', q: 'Which professional areas look thin in my records, and what evidence is missing?' },
  { label: 'Which projects show technology skills?', q: 'Which of my projects demonstrate technology skills?' },
  { label: 'Help me prepare for an internship interview', q: 'Help me prepare for an internship interview using my actual recorded experience. Suggest likely questions and how my real records answer them.' },
  { label: 'Draft a professional summary', q: 'Draft a short professional summary I could adapt for a CV, using only my real records.' },
];

function CareerAiPanel() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<Array<{ type: string; id: string; title: string }>>([]);
  const [error, setError] = useState('');
  const [input, setInput] = useState('');

  const avail = availability('career');

  const ask = async (q: string) => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setAnswer('');
    setError('');
    setSources([]);

    // The Career persona retrieves professional records through the
    // Intelligence Layer, plus a factual brief of counts and titles.
    const { careerBrief } = await import('../../services/portfolio');
    const res = await askAi({
      persona: 'career',
      query: `${q}\n\n--- FACTUAL RECORD OF MY PROFESSIONAL ACTIVITY (the only facts you may use) ---\n${careerBrief()}`,
      retrieval: { domain: 'professional', limit: 40 },
    });

    setBusy(false);
    if (res.ok) {
      setAnswer(res.text);
      setSources(res.sources);
    } else {
      setError(res.error ?? 'Career AI is unavailable.');
    }
  };

  return (
    <div className="space-y-3">
      <div className="card">
        <h3 className="font-semibold">🎓 Career AI</h3>
        <p className="mt-1 text-xs opacity-75">
          Career AI reads your real PharmD Journey — stages, rotations, skills, projects, research, leadership,
          achievements, certifications and goals. It cannot invent an achievement, and it will tell you when something is
          missing rather than filling the gap.
        </p>
        {avail.effective === 'none' && (
          <div className="mt-2 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-sm">
            {avail.reason ?? 'No AI provider is available.'}{' '}
            <button className="underline" onClick={() => navigate('/settings/ai')}>
              [ Open AI Settings ]
            </button>
            <p className="mt-1 text-xs opacity-80">
              Your portfolio, CV builder and every other Journey feature keep working without AI.
            </p>
          </div>
        )}
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-1">
          {CAREER_PROMPTS.map((p) => (
            <button
              key={p.label}
              className="rounded-full bg-slate-100 px-3 py-1 text-xs hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600"
              disabled={busy || avail.effective === 'none'}
              onClick={() => void ask(p.q)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="input flex-1"
            placeholder="Ask Career AI about your professional development…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(input);
            }}
            disabled={avail.effective === 'none'}
          />
          <button className="btn-primary shrink-0" disabled={busy || !input.trim()} onClick={() => void ask(input)}>
            {busy ? 'Thinking…' : 'Ask'}
          </button>
        </div>
      </div>

      {error && <div className="card text-sm text-red-600">{error}</div>}

      {answer && (
        <div className="card space-y-2">
          <div className="rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs font-medium">
            ⚠️ {AI_REVIEW_NOTICE} — this is AI wording built from your records, not a verified statement of fact.
          </div>
          <div className="whitespace-pre-wrap text-sm">{answer}</div>
          {sources.length > 0 && (
            <details className="rounded border border-slate-200 p-2 text-xs dark:border-slate-700">
              <summary className="cursor-pointer font-medium">
                📎 Sources — {sources.length} of YOUR records
              </summary>
              <ul className="mt-1 space-y-0.5">
                {sources.map((s) => (
                  <li key={`${s.type}:${s.id}`} className="flex items-center justify-between gap-2">
                    <span>
                      <span className="opacity-70">[{s.type}]</span> {s.title}
                    </span>
                    <button className="underline" onClick={() => navigate(ROUTES[s.type] ?? '/journey')}>
                      Open Source
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <button
            className="btn-secondary"
            onClick={() => downloadText('career-ai-draft.md', `# ${AI_REVIEW_NOTICE}\n\n${answer}`)}
          >
            Save as draft (.md)
          </button>
        </div>
      )}
    </div>
  );
}
