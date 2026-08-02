import { useData } from '../stores/data';
import { useNavigate } from 'react-router-dom';
import { PageHeader, StatCard, EmptyState } from '../components/ui';

function pct(part: number, total: number) {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

function Insight({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="card flex items-center gap-3">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-xl ${color}`}>{icon}</div>
      <div>
        <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">{value}</div>
      </div>
    </div>
  );
}

export function Progress() {
  const navigate = useNavigate();
  const diseases = useData((s) => s.diseases);
  const medicines = useData((s) => s.medicines);
  const investigations = useData((s) => s.investigations);
  const questions = useData((s) => s.questions);
  const lessons = useData((s) => s.lessons);
  const bundles = useData((s) => s.bundles);
  const revisions = useData((s) => s.revisions);
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

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Insight label="Revision due" value={revisions.filter((r) => r.due).length} icon="📚" color="bg-amber-100 dark:bg-amber-900" />
        <Insight label="Open questions" value={questions.filter((q) => q.status === 'open').length} icon="❓" color="bg-red-100 dark:bg-red-900" />
        <Insight label="Overall learning" value={`${overall}%`} icon="🎯" color="bg-brand-100 dark:bg-brand-900" />
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

      <div className="mt-6 card">
        <h2 className="mb-3 font-semibold">📈 Clinical encounters over time</h2>
        <EncountersChart days={days} medicines={medicines} diseases={diseases} />
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

function EncountersChart({ days, medicines, diseases }: { days: any[]; medicines: any[]; diseases: any[] }) {
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) {
    return <p className="text-sm text-slate-400">Add at least two clinical days to see your progress over time.</p>;
  }
  const points = sorted.map((d, i) => {
    const meds = d.medicines?.length ?? 0;
    const conds = d.conditions?.length ?? 0;
    return { label: `Day ${d.dayNumber}`, date: d.date, value: meds + conds };
  });
  const max = Math.max(...points.map((p) => p.value), 1);
  const W = 560, H = 180, pad = 30;
  const stepX = (W - pad * 2) / Math.max(points.length - 1, 1);
  const coord = (p: { value: number }, i: number) => [pad + i * stepX, H - pad - (p.value / max) * (H - pad * 2)] as const;
  const line = points.map((p, i) => coord(p, i));
  const area = [...line.map(([x, y]) => `${x},${y}`), `${W - pad},${H - pad}`, `${pad},${H - pad}`].join(' ');
  const dots = line.map(([x, y], i) => ({ x, y, label: points[i].label, value: points[i].value, date: points[i].date }));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0.25, 0.5, 0.75, 1].map((f) => (
        <line key={f} x1={pad} x2={W - pad} y1={H - pad - f * (H - pad * 2)} y2={H - pad - f * (H - pad * 2)} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      ))}
      <polygon points={area} fill="#2f8d60" fillOpacity="0.15" />
      <polyline points={line.map((p) => p.join(',')).join(' ')} fill="none" stroke="#2f8d60" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {dots.map((d, i) => (
        <g key={i}>
          <circle cx={d.x} cy={d.y} r="4" fill="#23704c" stroke="#fff" strokeWidth="1.5" />
          <title>{`${d.label} (${d.date}): ${d.value} encounter(s)`}</title>
        </g>
      ))}
      {dots.map((d, i) => (
        <text key={'t' + i} x={d.x} y={H - 6} textAnchor="middle" fontSize="11" fill="currentColor" fillOpacity="0.6">{d.label}</text>
      ))}
    </svg>
  );
}
