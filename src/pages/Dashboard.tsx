import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { StatCard, EmptyState } from '../components/ui';
import { QuickAdd } from '../components/QuickAdd';
import { CloudSyncPrompt } from '../components/CloudSyncPrompt';
import { AiHomePanel } from '../components/AiHomePanel';
import { newDay, todayIso } from '../services/defaults';
import { computeStreak } from '../services/streaks';
import { countDue } from '../services/srs';
import { currentPeriod, currentStage, journeyProgress } from '../services/academic';

export function Dashboard() {
  const navigate = useNavigate();
  const profile = useData((s) => s.profile)!;
  const days = useData((s) => s.days);
  const diseases = useData((s) => s.diseases);
  const medicines = useData((s) => s.medicines);
  const investigations = useData((s) => s.investigations);
  const questions = useData((s) => s.questions);
  const lessons = useData((s) => s.lessons);
  const revisions = useData((s) => s.revisions);
  const wardRounds = useData((s) => s.wardRounds);
  const academicStages = useData((s) => s.academicStages);
  const activities = useData((s) => s.activities);
  const goals = useData((s) => s.goals);
  const wardEntries = useData((s) => s.wardEntries);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const save = useData((s) => s.save);
  const [quick, setQuick] = useState(false);

  const today = days.find((d) => d.date === todayIso());
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const streak = computeStreak(days);
  const dueCount = countDue(revisions);

  async function startToday() {
    if (!today) {
      const next = newDay((profile.clinicalDay || 1) + (days.length ? 0 : 1), profile.site);
      await save('day', next);
      const p = { ...profile, clinicalDay: next.dayNumber };
      await useData.getState().saveProfile(p);
    }
    navigate('/clinical');
  }

  // ---- Today's Activity (§8): what the student has actually done today,
  // across the four things they do daily. Counts only, not a statistics wall.
  const iso = todayIso();
  const startOfDay = new Date(iso).setHours(0, 0, 0, 0);
  const todayActivity = {
    learning: lessons.filter((l) => (l.createdAt ?? 0) >= startOfDay).length,
    wardRounds: wardEntries.filter((e) => (e.createdAt ?? 0) >= startOfDay).length,
    revision: revisions.filter((r) => (r.reviewedAt ?? 0) >= startOfDay).length,
    questions: questions.filter((q) => (q.createdAt ?? 0) >= startOfDay).length,
  };

  // ---- Recent Activity (§8): the last few things touched, newest first.
  const recent = [...activities].sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, 6);

  // ---- Upcoming Goals (§8): active goals with the nearest target date.
  const upcomingGoals = goals
    .filter((g) => g.status === 'active' || g.status === 'not-started')
    .sort((a, b) => (a.targetDate ?? '9999').localeCompare(b.targetDate ?? '9999'))
    .slice(0, 4);

  const liveRound = wardRounds.find((r) => r.status === 'active' && !r.archived) ?? null;
  const stage = currentStage();
  const period = currentPeriod();
  const progress = journeyProgress();
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{greet}, {profile.username} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {stage ? `${stage.name} · ${stage.academicYear}` : `Clinical Day ${profile.clinicalDay}`}
            {period ? ` · ${period.name}` : ''}
            {profile.site ? ` · ${profile.site}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-slate-400">{todayLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              online
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
            }`}
            title={online ? 'Online — cloud features available' : 'Offline is a normal mode: everything still works and saves locally'}
          >
            <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {online ? 'Online' : 'Offline'}
          </span>
          <CloudSyncPrompt />
          <button className="btn-primary" onClick={() => setQuick(true)}>＋ Quick Capture</button>
        </div>
      </div>

      {/* ---- Quick actions (§8): the five things a student starts most often,
           reachable in one click from the home screen. ---- */}
      <section aria-labelledby="quick-actions-heading">
        <h2 id="quick-actions-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {[
            { icon: '📝', label: 'Learning Note', hint: 'Capture what you learnt', run: () => navigate('/notes?new=1') },
            { icon: '🏥', label: 'Ward Round', hint: liveRound ? 'Continue round' : 'Start a round', run: () => navigate('/ward-rounds') },
            { icon: '❓', label: 'Question', hint: 'Something to research', run: () => navigate('/questions?new=1') },
            { icon: '📦', label: 'Bundle', hint: 'Package your work', run: () => navigate('/bundles') },
            { icon: '🧠', label: 'Ask AI', hint: 'Ask CLINICAL Rx AI', run: () => navigate('/ai') },
          ].map((a) => (
            <button
              key={a.label}
              className="focus-ring flex flex-col items-start gap-0.5 rounded-xl border border-slate-200 bg-white p-3 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-brand-950"
              onClick={a.run}
            >
              <span className="text-xl" aria-hidden="true">{a.icon}</span>
              <span className="text-sm font-semibold">{a.label}</span>
              <span className="text-[11px] text-slate-400">{a.hint}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---- Today's Activity (§8): four numbers that answer "what have I done
           today?" — deliberately not a wall of lifetime statistics. ---- */}
      <section aria-labelledby="today-activity-heading">
        <h2 id="today-activity-heading" className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
          Today&rsquo;s activity
        </h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          <StatCard icon="📝" label="Learning" value={todayActivity.learning} to="/notes" />
          <StatCard icon="🏥" label="Ward rounds" value={todayActivity.wardRounds} accent="bg-sky-100 dark:bg-sky-900" to="/ward-rounds" />
          <StatCard icon="🧠" label="Revision" value={todayActivity.revision} to="/revision" />
          <StatCard icon="❓" label="Questions" value={todayActivity.questions} to="/questions" />
          <StatCard icon="🔥" label="Day streak" value={streak.current} accent="bg-orange-100 dark:bg-orange-900" to="/clinical" />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Today's Clinical Log</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('/clinical')}>View all →</button>
          </div>
          {today ? (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {today.conditions.map((c) => <span key={c} className="rounded bg-brand-50 px-2 py-0.5 text-xs dark:bg-brand-900">{c}</span>)}
                {today.conditions.length === 0 && <span className="text-slate-400">No conditions recorded yet.</span>}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {today.medicines.map((m) => <span key={m} className="rounded bg-sky-50 px-2 py-0.5 text-xs dark:bg-sky-900">{m}</span>)}
                {today.medicines.length === 0 && <span className="text-slate-400">No medicines recorded yet.</span>}
              </div>
            </div>
          ) : (
            <EmptyState icon="📋" title="No log for today yet" hint="Start today's clinical log to begin capturing what you see and learn." />
          )}
          <button className="btn-primary mt-4 w-full" onClick={startToday}>
            {today ? "✏️ Continue today's log" : "＋ Start Today's Log"}
          </button>
          <button className="btn-secondary mt-2 w-full" onClick={() => navigate('/ward-rounds')}>
            🏥 {liveRound ? `Continue ward round — ${liveRound.ward}` : 'Start Ward Round'}
          </button>
        </div>

        <div className="space-y-3">
          <button className="card flex w-full items-center justify-between text-left hover:border-brand-400" onClick={() => navigate('/questions')}>
            <div><div className="font-semibold">❓ Questions to research</div><div className="text-xs text-slate-400">Open questions awaiting answers</div></div>
            <div className="text-2xl font-bold text-brand-600">{questions.filter((q) => q.status === 'open').length}</div>
          </button>
          <button className="card flex w-full items-center justify-between text-left hover:border-brand-400" onClick={() => navigate('/revision')}>
            <div><div className="font-semibold">⭐ Important lessons</div><div className="text-xs text-slate-400">Key learning points captured</div></div>
            <div className="text-2xl font-bold text-brand-600">{lessons.filter((l) => l.important).length}</div>
          </button>
          <button className="card flex w-full items-center justify-between text-left hover:border-brand-400" onClick={() => navigate('/revision')}>
            <div><div className="font-semibold">📚 Revision due</div><div className="text-xs text-slate-400">Spaced-repetition queue</div></div>
            <div className="text-2xl font-bold text-brand-600">{dueCount}</div>
          </button>
        </div>
      </div>

      {stage && (
        <button
          className="card w-full text-left transition-colors hover:border-brand-400"
          onClick={() => navigate('/journey')}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">🎓 PharmD Journey</h2>
              <p className="text-xs text-slate-400">
                {stage.name} · {stage.academicYear}
                {period ? ` · ${period.name}` : ''}
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {progress.completed} of {progress.total} stages completed →
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${progress.percent}%` }} />
          </div>
        </button>
      )}

      <AiHomePanel />

      <div className="grid gap-4 lg:grid-cols-2">
        <button className="card flex flex-wrap items-center gap-3 text-left transition-colors hover:border-brand-400" onClick={() => navigate('/ai-capture')}>
          <div className="flex-1 min-w-52">
            <h2 className="font-semibold">🗣 Capture by typing</h2>
            <p className="text-xs text-slate-400">Describe your day naturally — AI extracts diseases, medicines, investigations &amp; lessons for you.</p>
          </div>
          <span className="btn-primary">Open AI →</span>
        </button>
        <button className="card flex flex-wrap items-center gap-3 text-left transition-colors hover:border-brand-400" onClick={() => navigate('/bundles')}>
          <div className="flex-1 min-w-52">
            <h2 className="font-semibold">📦 Generate today's bundle</h2>
            <p className="text-xs text-slate-400">AI gathers everything you recorded today into a shareable clinical summary.</p>
          </div>
          <span className="btn-primary">Go to Bundles →</span>
        </button>
      </div>

      {/* ---- Recent Activity + Upcoming Goals (§8) ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card" aria-labelledby="recent-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-heading" className="font-semibold">🕒 Recent activity</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('/progress')}>View progress →</button>
          </div>
          {recent.length === 0 ? (
            <EmptyState icon="🕒" title="Nothing yet today" hint="Anything you create or update will appear here so you can pick up where you left off." />
          ) : (
            <ul className="space-y-1.5 text-sm">
              {recent.map((a) => (
                <li key={a.id} className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-1.5 last:border-0 dark:border-slate-700">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-slate-400">{a.action}</span> {a.label}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {new Date(a.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="goals-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="goals-heading" className="font-semibold">🎯 Upcoming goals</h2>
            <button className="btn-ghost text-xs" onClick={() => navigate('/journey/goals')}>All goals →</button>
          </div>
          {upcomingGoals.length === 0 ? (
            <EmptyState
              icon="🎯"
              title="No active goals"
              hint="Set a goal for this semester — a skill to build, a rotation to complete, or a project to finish."
              actions={<button className="btn-primary" onClick={() => navigate('/journey/goals')}>Create a goal</button>}
            />
          ) : (
            <ul className="space-y-2 text-sm">
              {upcomingGoals.map((g) => {
                const done = g.milestones?.filter((m) => m.done).length ?? 0;
                const total = g.milestones?.length ?? 0;
                return (
                  <li key={g.id}>
                    <button
                      className="focus-ring w-full rounded-lg px-2 py-1.5 text-left hover:bg-slate-50 dark:hover:bg-slate-700"
                      onClick={() => navigate('/journey/goals')}
                    >
                      <span className="block truncate font-medium">{g.title}</span>
                      <span className="block text-[11px] text-slate-400">
                        {g.targetDate ? `Target ${g.targetDate}` : 'No target date'}
                        {total > 0 ? ` · ${done}/${total} milestones` : ''}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}
