import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard } from '../../components/ui';
import { useData } from '../../stores/data';
import {
  allStageSnapshots,
  compareStages,
  goalProgress,
  journeySummary,
  knowledgeGrowth,
  professionalTimeline,
  stageSnapshot,
} from '../../services/career';
import { allStages, planPromotion, promote, periodsFor, setCurrentPeriod } from '../../services/academic';

/**
 * 🎓 PHARMD JOURNEY — home
 *
 * The long-term view of the whole degree: where the student is now, what each
 * level contains, and how to move forward without ever losing the past.
 */

const SECTIONS = [
  { to: '/journey/clinical-experience', icon: '🏥', label: 'Clinical Experience', hint: 'Rotations & placements' },
  { to: '/journey/skills', icon: '🧠', label: 'Skills', hint: 'Evidence-based competencies' },
  { to: '/journey/projects', icon: '💻', label: 'Projects', hint: 'Pharmacy & technology' },
  { to: '/journey/research', icon: '🔬', label: 'Research', hint: 'Interests & outputs' },
  { to: '/journey/leadership', icon: '🏅', label: 'Leadership', hint: 'Roles & activities' },
  { to: '/journey/achievements', icon: '🏆', label: 'Achievements', hint: 'Awards & recognition' },
  { to: '/journey/certifications', icon: '📜', label: 'Certifications', hint: 'Credentials' },
  { to: '/journey/goals', icon: '🎯', label: 'Goals', hint: 'Targets & milestones' },
  { to: '/journey/portfolio', icon: '📁', label: 'Portfolio & CV', hint: 'What you choose to show' },
  { to: '/journey/archive', icon: '📚', label: 'Academic Archive', hint: 'Every previous level' },
];

export default function JourneyHome() {
  const navigate = useNavigate();
  // Subscribe so the page recomputes whenever any underlying record changes.
  const stages = useData((s) => s.academicStages);
  const skills = useData((s) => s.skills);
  const goals = useData((s) => s.goals);
  const projects = useData((s) => s.projects);
  const profile = useData((s) => s.profile);
  const [promoting, setPromoting] = useState(false);
  const [msg, setMsg] = useState('');

  const summary = useMemo(
    () => journeySummary(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, skills, goals, projects, profile]
  );
  const snapshot = useMemo(() => (summary.stage ? stageSnapshot(summary.stage.id) : null), [summary.stage, stages, skills]);
  const plan = useMemo(() => planPromotion(), [stages, profile]);
  const periods = useMemo(() => (summary.stage ? periodsFor(summary.stage.id) : []), [summary.stage, stages]);
  const currentPeriod = periods.find((p) => p.id === profile?.currentPeriodId);

  const doPromote = async () => {
    const target = plan.to?.name ?? `Level ${plan.nextLevel}`;
    const ok = window.confirm(
      `Progress to ${target}?\n\n` +
        `${plan.from?.name ?? 'Your current level'} will be ARCHIVED — every record stays exactly where it is and remains fully accessible.\n\n` +
        `New records will default to ${target}.`
    );
    if (!ok) return;
    setPromoting(true);
    const res = await promote();
    setPromoting(false);
    setMsg(res.ok ? `🎓 Now on ${res.to?.name}. ${res.from?.name} is archived and still accessible.` : `⚠️ ${res.error}`);
  };

  if (!summary.stage) {
    return (
      <div className="space-y-4">
        <PageHeader title="🎓 PharmD Journey" subtitle="Your academic, clinical and professional record." />
        <div className="card text-center">
          <p>No academic stage has been set up yet.</p>
          <button className="btn-primary mt-3" onClick={() => navigate('/journey/setup')}>
            Set up my journey
          </button>
        </div>
      </div>
    );
  }

  const s = summary.stage;

  return (
    <div className="space-y-4">
      <PageHeader
        title="🎓 PharmD Journey"
        subtitle="Your academic, clinical and professional record — preserved across every level."
        action={
          <button className="btn-secondary" onClick={() => navigate('/journey/timeline')}>
            📈 Timeline
          </button>
        }
      />

      {msg && <div className="card text-sm">{msg}</div>}

      {/* CURRENT STAGE */}
      <div className="card">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide opacity-70">Current stage</div>
            <div className="text-3xl font-semibold">{s.name}</div>
            <div className="mt-1 text-sm opacity-80">
              Academic Year <strong>{s.academicYear}</strong>
              {currentPeriod && (
                <>
                  {' · '}Semester <strong>{currentPeriod.index}</strong>
                </>
              )}
              {s.institution ? ` · ${s.institution}` : ''}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {periods.length > 1 && (
              <select
                className="input"
                value={profile?.currentPeriodId ?? ''}
                onChange={(e) => void setCurrentPeriod(e.target.value)}
                title="Switch the active semester"
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
            <button className="btn-primary" disabled={promoting} onClick={() => void doPromote()}>
              {promoting ? 'Progressing…' : `⬆ Progress to ${plan.to?.name ?? `Level ${plan.nextLevel}`}`}
            </button>
          </div>
        </div>
        <p className="mt-2 text-xs opacity-70">
          Progressing archives this level. Nothing is deleted or rewritten — every record keeps the level, year and semester
          it was created in.
        </p>
      </div>

      {/* ACADEMIC SNAPSHOT */}
      {snapshot && (
        <div className="card">
          <h2 className="font-semibold">📊 {snapshot.stageName} snapshot</h2>
          <p className="text-xs opacity-70">Real counts from your stored records.</p>
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {(
              [
                ['Courses', snapshot.counts.courses],
                ['Learning notes', snapshot.counts.lessons],
                ['Diseases', snapshot.counts.diseases],
                ['Medicines', snapshot.counts.medicines],
                ['Investigations', snapshot.counts.investigations],
                ['Ward rounds', snapshot.counts.wardRounds],
                ['Questions', snapshot.counts.questions],
                ['Bundles', snapshot.counts.bundles],
                ['Rotations', snapshot.counts.clinicalExperiences],
                ['Skills', snapshot.counts.skills],
                ['Achievements', snapshot.counts.achievements],
                ['Projects', snapshot.counts.projects],
              ] as Array<[string, number]>
            ).map(([label, value]) => (
              <div key={label} className="rounded border border-slate-200 p-2 text-center dark:border-slate-700">
                <div className="text-lg font-semibold">{value}</div>
                <div className="text-[11px] opacity-70">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* THREE PILLARS */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card">
          <h2 className="font-semibold">📘 Academic</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Courses</span>
              <strong>{summary.academic.courses}</strong>
            </div>
            <div className="flex justify-between">
              <span>Learning this level</span>
              <strong>{summary.academic.lessons}</strong>
            </div>
          </div>
          <button className="btn-secondary mt-3 w-full" onClick={() => navigate('/courses')}>
            Open courses
          </button>
        </div>

        <div className="card">
          <h2 className="font-semibold">🏥 Clinical</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Rotations</span>
              <strong>{summary.clinical.rotations}</strong>
            </div>
            <div className="flex justify-between">
              <span>Ward rounds</span>
              <strong>{summary.clinical.wardRounds}</strong>
            </div>
            <div className="flex justify-between">
              <span>Skills</span>
              <strong>{summary.clinical.skills}</strong>
            </div>
          </div>
          {summary.clinical.activeRotation && (
            <p className="mt-2 rounded bg-emerald-500/10 p-1.5 text-xs">
              🟢 Currently in <strong>{summary.clinical.activeRotation.title}</strong>
            </p>
          )}
          <button className="btn-secondary mt-3 w-full" onClick={() => navigate('/journey/clinical-experience')}>
            Clinical experience
          </button>
        </div>

        <div className="card">
          <h2 className="font-semibold">👔 Professional</h2>
          <div className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Projects</span>
              <strong>{summary.professional.projects}</strong>
            </div>
            <div className="flex justify-between">
              <span>Research</span>
              <strong>{summary.professional.research}</strong>
            </div>
            <div className="flex justify-between">
              <span>Leadership</span>
              <strong>{summary.professional.leadership}</strong>
            </div>
            <div className="flex justify-between">
              <span>Achievements</span>
              <strong>{summary.professional.achievements}</strong>
            </div>
            <div className="flex justify-between">
              <span>Certifications</span>
              <strong>{summary.professional.certifications}</strong>
            </div>
          </div>
          <button className="btn-secondary mt-3 w-full" onClick={() => navigate('/journey/portfolio')}>
            Portfolio & CV
          </button>
        </div>
      </div>

      {/* GOALS */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">🎯 Active goals</h2>
          <button className="btn-secondary" onClick={() => navigate('/journey/goals')}>
            All goals ({summary.goals.total})
          </button>
        </div>
        {summary.goals.active.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">No active goals. Set one to give this term a direction.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {summary.goals.active.map((g) => {
              const p = goalProgress(g);
              return (
                <button
                  key={g.id}
                  className="w-full text-left"
                  onClick={() => navigate('/journey/goals')}
                >
                  <div className="flex justify-between text-sm">
                    <span>{g.title}</span>
                    <span className="opacity-70">
                      {p.total ? `${p.done}/${p.total}` : 'no milestones'}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.percent}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTIONS */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((sec) => (
          <button
            key={sec.to}
            className="card text-left transition-colors hover:border-brand-400"
            onClick={() => navigate(sec.to)}
          >
            <div className="font-semibold">
              {sec.icon} {sec.label}
            </div>
            <div className="text-xs opacity-70">{sec.hint}</div>
          </button>
        ))}
      </div>

      {/* RECENT MILESTONES */}
      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">📈 Recent milestones</h2>
          <button className="btn-secondary" onClick={() => navigate('/journey/timeline')}>
            Full timeline
          </button>
        </div>
        {summary.timeline.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">Your timeline fills in as you record real activity.</p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {summary.timeline.map((e, i) => (
              <li key={`${e.type}-${e.id}-${i}`} className="flex flex-wrap items-center gap-2">
                <span>{e.icon}</span>
                <span className="flex-1 truncate">{e.title}</span>
                <span className="text-xs opacity-60">{e.date}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// =========================================================================
// ACADEMIC TIMELINE + STAGE COMPARISON
// =========================================================================

export function JourneyTimeline() {
  const navigate = useNavigate();
  const stages = useData((s) => s.academicStages);
  const profile = useData((s) => s.profile);
  const snapshots = useMemo(() => allStageSnapshots(), [stages, profile]);
  const events = useMemo(() => professionalTimeline(300), [stages, profile]);
  const growth = useMemo(() => knowledgeGrowth(), [stages, profile]);

  const ordered = useMemo(() => allStages().slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [stages]);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const comparison = useMemo(() => (cmpA && cmpB ? compareStages(cmpA, cmpB) : null), [cmpA, cmpB, stages]);

  const byYear = useMemo(() => {
    const m = new Map<string, typeof events>();
    for (const e of events) {
      const list = m.get(e.year) ?? [];
      list.push(e);
      m.set(e.year, list);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [events]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="📈 Academic & Professional Timeline"
        subtitle="Every level, rotation, project and achievement — from your real dated records."
        action={
          <button className="btn-secondary" onClick={() => navigate('/journey')}>
            ← Journey
          </button>
        }
      />

      {/* ACADEMIC TIMELINE */}
      <div className="card">
        <h2 className="font-semibold">🎓 Academic stages</h2>
        <div className="mt-3 space-y-3">
          {ordered.map((s) => {
            const snap = snapshots.find((x) => x.stageId === s.id);
            const periods = periodsFor(s.id);
            const isCurrent = s.status === 'current';
            return (
              <button
                key={s.id}
                className={`flex w-full flex-wrap items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:border-brand-400 ${
                  isCurrent ? 'border-brand-500 bg-brand-500/5' : 'border-slate-200 dark:border-slate-700'
                }`}
                onClick={() => navigate(`/journey/archive?stage=${s.id}`)}
              >
                <div className="min-w-32">
                  <div className="font-semibold">
                    {isCurrent ? '●' : s.status === 'completed' ? '✓' : '○'} {s.name}
                  </div>
                  <div className="text-xs opacity-70">{s.academicYear}</div>
                </div>
                <div className="flex flex-1 flex-wrap gap-1 text-xs">
                  {periods.map((p) => (
                    <span key={p.id} className="rounded bg-slate-100 px-1.5 py-0.5 dark:bg-slate-700">
                      {p.name}
                    </span>
                  ))}
                </div>
                {snap && (
                  <div className="text-xs opacity-75">
                    {snap.counts.lessons} notes · {snap.counts.wardRounds} rounds · {snap.counts.clinicalExperiences} rotations
                  </div>
                )}
                <span className="text-xs underline">Open archive →</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* COMPARISON */}
      <div className="card">
        <h2 className="font-semibold">⚖️ Compare levels</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <select className="input" value={cmpA} onChange={(e) => setCmpA(e.target.value)}>
            <option value="">Select a level…</option>
            {ordered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <span className="self-center">vs</span>
          <select className="input" value={cmpB} onChange={(e) => setCmpB(e.target.value)}>
            <option value="">Select a level…</option>
            {ordered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        {comparison && (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs opacity-70">
                <th className="py-1">Metric</th>
                <th>{comparison.a?.stageName}</th>
                <th>{comparison.b?.stageName}</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {comparison.rows.map((r) => (
                <tr key={r.label} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1">{r.label}</td>
                  <td>{r.a}</td>
                  <td>{r.b}</td>
                  <td className={r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-amber-600' : 'opacity-50'}>
                    {r.delta > 0 ? `+${r.delta}` : r.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="mt-2 text-xs opacity-70">
          These are record counts, not competence scores. More records does not automatically mean more skill.
        </p>
      </div>

      {/* KNOWLEDGE GROWTH */}
      <div className="card">
        <h2 className="font-semibold">📚 Knowledge growth by level</h2>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs opacity-70">
                <th className="py-1">Level</th>
                <th>Diseases</th>
                <th>Medicines</th>
                <th>Investigations</th>
                <th>Questions</th>
                <th>Rounds</th>
                <th>Rotations</th>
              </tr>
            </thead>
            <tbody>
              {growth.map((g) => (
                <tr key={g.stageId} className="border-t border-slate-200 dark:border-slate-700">
                  <td className="py-1">{g.label}</td>
                  <td>{g.diseases}</td>
                  <td>{g.medicines}</td>
                  <td>{g.investigations}</td>
                  <td>{g.questions}</td>
                  <td>{g.wardRounds}</td>
                  <td>{g.clinicalExperiences}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* PROFESSIONAL TIMELINE */}
      <div className="card">
        <h2 className="font-semibold">📈 Professional timeline</h2>
        {byYear.length === 0 ? (
          <p className="mt-2 text-sm opacity-70">Nothing dated yet.</p>
        ) : (
          <div className="mt-3 space-y-4">
            {byYear.map(([year, list]) => (
              <div key={year}>
                <div className="text-lg font-semibold">{year}</div>
                <ul className="mt-1 space-y-1 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                  {list.map((e, i) => (
                    <li key={`${e.type}-${e.id}-${i}`} className="text-sm">
                      <span className="mr-1">{e.icon}</span>
                      <strong>{e.title}</strong>
                      <span className="opacity-70">
                        {' '}
                        — {e.type}
                        {e.detail ? ` · ${e.detail}` : ''} · {e.date}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
