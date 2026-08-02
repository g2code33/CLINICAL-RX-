import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from '../components/ui';
import { newDay } from '../services/defaults';

function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthMatrix(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(first).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function CalendarPage() {
  const days = useData((s) => s.days);
  const profile = useData((s) => s.profile)!;
  const save = useData((s) => s.save);
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string>(toIso(now));

  const cells = monthMatrix(view.year, view.month);
  const today = toIso(now);
  const dayByDate = new Map(days.map((d) => [d.date, d]));
  const selected = dayByDate.get(selectedDate);

  function prev() {
    setView((v) => (v.month === 0 ? { year: v.year - 1, month: 11 } : { year: v.year, month: v.month - 1 }));
  }
  function next() {
    setView((v) => (v.month === 11 ? { year: v.year + 1, month: 0 } : { year: v.year, month: v.month + 1 }));
  }

  async function addDayOn(date: string) {
    const maxDay = days.length ? Math.max(...days.map((d) => d.dayNumber)) : 0;
    const d = newDay(maxDay + 1, profile.site);
    d.date = date;
    await save('day', d);
    await useData.getState().saveProfile({ ...profile, clinicalDay: d.dayNumber });
  }

  return (
    <div>
      <PageHeader title="Calendar" subtitle="See your clinical activity across dates." />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">{MONTHS[view.month]} {view.year}</h2>
            <div className="flex gap-2">
              <button className="btn-secondary !px-3" onClick={prev}>‹</button>
              <button className="btn-secondary !px-3" onClick={next}>›</button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-2 text-center text-xs font-semibold text-slate-400">{w}</div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={i} />;
              const iso = `${view.year}-${String(view.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
              const has = dayByDate.has(iso);
              const isToday = iso === today;
              const isSel = iso === selectedDate;
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(iso)}
                  className={`relative flex h-12 items-center justify-center rounded-lg text-sm transition-colors ${
                    isSel
                      ? 'bg-brand-600 font-bold text-white'
                      : has
                      ? 'bg-brand-100 font-semibold text-brand-800 hover:bg-brand-200 dark:bg-brand-900 dark:text-brand-200'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {day}
                  {has && !isSel && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-brand-500" />}
                  {isToday && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" /> clinical day ·{' '}
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" /> today
          </p>
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold">{selectedDate}</h2>
          {selected ? (
            <div className="space-y-3 text-sm">
              <div className="font-semibold">Clinical Day {selected.dayNumber} · {selected.site}</div>
              <Section label="Conditions" items={selected.conditions} />
              <Section label="Medicines" items={selected.medicines} />
              <Section label="Investigations" items={selected.investigations} />
              <Section label="Lessons" items={selected.lessons} />
              {!selected.conditions.length && !selected.medicines.length && (
                <p className="text-xs text-slate-400">This day's log is empty.</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">No clinical log recorded on this date.</p>
              <button className="btn-primary w-full" onClick={() => addDayOn(selectedDate)}>＋ Add clinical day</button>
            </div>
          )}
        </div>
      </div>

      {days.length === 0 && <div className="mt-6"><EmptyState icon="📅" title="No clinical days yet" hint="Start a day from the Dashboard or Clinical Days." /></div>}
    </div>
  );
}

function Section({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="label">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span key={it} className="rounded bg-slate-100 px-2 py-0.5 text-xs dark:bg-slate-700">{it}</span>
        ))}
      </div>
    </div>
  );
}
