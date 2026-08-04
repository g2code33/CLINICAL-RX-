import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../stores/data';
import { StatCard, EmptyState } from '../components/ui';
import { QuickAdd } from '../components/QuickAdd';
import { CloudSyncPrompt } from '../components/CloudSyncPrompt';
import { newDay, todayIso } from '../services/defaults';
import { computeStreak } from '../services/streaks';
import { countDue } from '../services/srs';

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greet}, {profile.username} 👋</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Clinical Day {profile.clinicalDay} · {profile.site}</p>
        </div>
        <div className="flex items-center gap-2">
          <CloudSyncPrompt />
          <button className="btn-primary" onClick={() => setQuick(true)}>＋ Quick Capture</button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard icon="🔥" label="Day streak" value={streak.current} accent="bg-orange-100 dark:bg-orange-900" to="/clinical" />
        <StatCard icon="📋" label="Clinical days" value={days.length} accent="bg-sky-100 dark:bg-sky-900" to="/clinical" />
        <StatCard icon="🦠" label="Conditions" value={diseases.length} to="/diseases" />
        <StatCard icon="💊" label="Medicines" value={medicines.length} to="/medicines" />
        <StatCard icon="🧪" label="Investigations" value={investigations.length} to="/investigations" />
      </div>

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

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52">
            <h2 className="font-semibold">🗣 Capture by typing</h2>
            <p className="text-xs text-slate-400">Describe your day naturally — AI extracts diseases, medicines, investigations &amp; lessons for you.</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/ai')}>Open AI →</button>
        </div>
        <div className="card flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-52">
            <h2 className="font-semibold">📦 Generate today's bundle</h2>
            <p className="text-xs text-slate-400">AI gathers everything you recorded today into a shareable clinical summary.</p>
          </div>
          <button className="btn-primary" onClick={() => navigate('/bundles')}>Go to Bundles →</button>
        </div>
      </div>

      <QuickAdd open={quick} onClose={() => setQuick(false)} />
    </div>
  );
}
