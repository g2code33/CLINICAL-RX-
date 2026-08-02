import { useData } from '../stores/data';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard, EmptyState } from '../components/ui';

function pct(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

export function Progress() {
  const navigate = useNavigate();
  const diseases = useData((s) => s.diseases);
  const medicines = useData((s) => s.medicines);
  const investigations = useData((s) => s.investigations);
  const questions = useData((s) => s.questions);
  const lessons = useData((s) => s.lessons);
  const bundles = useData((s) => s.bundles);
  const days = useData((s) => s.days);

  const patho = diseases.length ? pct(diseases.filter((d) => d.what && d.why && d.how).length, diseases.length) : 0;
  const pharmaco = medicines.length ? pct(medicines.filter((m) => m.mechanism && m.dosage).length, medicines.length) : 0;
  const therapeutic = medicines.length ? pct(medicines.filter((m) => m.indications?.length).length, medicines.length) : 0;
  const microbio = diseases.length ? pct(diseases.filter((d) => d.who && d.dt).length, diseases.length) : 0;
  const labSkill = investigations.length ? pct(investigations.filter((i) => i.interpretation).length, investigations.length) : 0;

  const overall = pct(
    patho + pharmaco + therapeutic + microbio + labSkill,
    500
  );

  const bars = [
    { label: 'PATHOLOGY', value: patho },
    { label: 'PHARMACOLOGY', value: pharmaco },
    { label: 'THERAPEUTICS', value: therapeutic },
    { label: 'MICROBIOLOGY', value: microbio },
    { label: 'CLINICAL SKILLS', value: labSkill },
  ];

  const empty = diseases.length + medicines.length + investigations.length + questions.length === 0;

  if (empty) {
    return (
      <div>
        <PageHeader title="Progress" subtitle="Track your clinical learning across categories." />
        <EmptyState icon="📊" title="Nothing to track yet" hint="Add diseases, medicines, investigations and questions to see your progress." />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Progress" subtitle="How your clinical learning is building up." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <StatCard icon="🦠" label="Conditions" value={diseases.length} />
        <StatCard icon="💊" label="Medicines" value={medicines.length} />
        <StatCard icon="🧪" label="Investigations" value={investigations.length} />
        <StatCard icon="📋" label="Clinical days" value={days.length} />
        <StatCard icon="📦" label="Bundles" value={bundles.length} />
        <StatCard icon="💡" label="Lessons" value={lessons.length} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Clinical learning</h2>
            <span className="text-2xl font-extrabold text-brand-600">{overall}%</span>
          </div>
          <div className="space-y-4">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1 flex justify-between text-xs font-medium text-slate-500">
                  <span>{b.label}</span>
                  <span>{b.value}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${b.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 font-semibold">Questions</h2>
          <div className="flex items-end gap-2">
            <span className="text-3xl font-extrabold text-brand-600">{pct(questions.filter((q) => q.status === 'answered').length, questions.length)}%</span>
            <span className="mb-1 text-sm text-slate-400">answered</span>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between"><span>Total questions</span><span>{questions.length}</span></div>
            <div className="flex justify-between"><span>Answered</span><span className="text-green-600">{questions.filter((q) => q.status === 'answered').length}</span></div>
            <div className="flex justify-between"><span>Pending</span><span className="text-red-500">{questions.filter((q) => q.status === 'open').length}</span></div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 font-semibold">Most encountered conditions</h2>
          <TopList items={diseases.map((d) => ({ name: d.name, count: d.encounters }))} onClick={() => navigate('/diseases')} />
        </div>
        <div className="card">
          <h2 className="mb-3 font-semibold">Most encountered medicines</h2>
          <TopList items={medicines.map((m) => ({ name: m.name, count: m.encounters }))} onClick={() => navigate('/medicines')} />
        </div>
      </div>
    </div>
  );
}

function TopList({ items, onClick }: { items: Array<{ name: string; count: number }>; onClick: () => void }) {
  const top = items.filter((i) => i.name).sort((a, b) => b.count - a.count).slice(0, 8);
  if (!top.length) return <p className="text-sm text-slate-400">Nothing recorded yet.</p>;
  const max = Math.max(...top.map((i) => i.count), 1);
  return (
    <div className="space-y-2">
      {top.map((i) => (
        <div key={i.name} className="flex items-center gap-3 text-sm">
          <span className="w-1/3 truncate text-slate-600 dark:text-slate-300">{i.name}</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${(i.count / max) * 100}%` }} />
          </div>
          <span className="w-8 text-right text-xs text-slate-400">×{i.count}</span>
        </div>
      ))}
      {items.length > 8 && (
        <button className="btn-ghost !p-0 text-xs" onClick={onClick}>View all →</button>
      )}
    </div>
  );
}
