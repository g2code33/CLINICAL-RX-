import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from '../components/ui';
import { newDay } from '../services/defaults';
import { newReminder, remindersForDate } from '../services/reminders';

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
  const remove = useData((s) => s.remove);
  const reminders = useData((s) => s.reminders);
  const now = new Date();
  const [view, setView] = useState({ year: now.getFullYear(), month: now.getMonth() });
  const [selectedDate, setSelectedDate] = useState<string>(toIso(now));
  const [remTitle, setRemTitle] = useState('');
  const [remTime, setRemTime] = useState('09:00');
  const [remNote, setRemNote] = useState('');

  // Reminders for the currently-viewed month, upcoming-first.
  const monthReminders = reminders
    .filter((r) => {
      const d = r.date;
      return d >= `${view.year}-${String(view.month + 1).padStart(2, '0')}-01` && d <= `${view.year}-${String(view.month + 1).padStart(2, '0')}-31`;
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));

  async function addReminder() {
    if (!remTitle.trim()) return;
    await save('reminder', newReminder({ title: remTitle.trim(), date: selectedDate, time: remTime, note: remNote.trim() || undefined }));
    setRemTitle('');
    setRemNote('');
  }

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
              const hasRem = reminders.some((r) => r.date === iso);
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
                  {hasRem && !isSel && <span className="absolute bottom-3 h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  {isToday && <span className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-red-500" />}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-brand-500" /> clinical day ·{' '}
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500" /> reminder ·{' '}
            <span className="mr-1 inline-block h-2 w-2 rounded-full bg-red-500" /> today
          </p>

          {/* Reminders right under the days of this month */}
          {monthReminders.length > 0 && (
            <div className="mt-4 rounded-lg border border-amber-200 p-3 dark:border-amber-800">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">⏰ Reminders this month</span>
                <span className="text-[11px] text-slate-400">{monthReminders.length} upcoming</span>
              </div>
              <div className="space-y-1.5">
                {monthReminders.map((r) => (
                  <div key={r.id} className={`flex items-center justify-between gap-2 text-sm ${r.done ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <span className="font-medium">{r.date} · {r.time} — {r.title}</span>
                      {r.note && <div className="truncate text-xs text-slate-400">{r.note}</div>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {!r.done && (
                        <button className="text-xs text-green-600" onClick={async () => { await save('reminder', { ...r, done: true, updatedAt: Date.now() }); }}>Done</button>
                      )}
                      <button className="text-xs text-red-500" onClick={() => remove('reminder', r.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="mb-3 font-bold">{selectedDate}</h2>

          {/* Reminders for the selected date */}
          <div className="mb-4 rounded-lg border border-amber-200 p-3 dark:border-amber-800">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold">⏰ Reminders</span>
              <span className="text-[11px] text-slate-400">desktop notification</span>
            </div>
            {remindersForDate(reminders, selectedDate).length === 0 ? (
              <p className="mb-2 text-xs text-slate-400">No reminders for this day.</p>
            ) : (
              <div className="mb-2 space-y-1.5">
                {remindersForDate(reminders, selectedDate).map((r) => (
                  <div key={r.id} className={`flex items-center justify-between gap-2 text-sm ${r.done ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <span className="font-medium">{r.time} — {r.title}</span>
                      {r.note && <div className="truncate text-xs text-slate-400">{r.note}</div>}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {r.done ? <span className="text-xs text-green-600">✓</span> : (
                        <button className="text-xs text-green-600" onClick={async () => { await save('reminder', { ...r, done: true, updatedAt: Date.now() }); }}>Done</button>
                      )}
                      <button className="text-xs text-red-500" onClick={() => remove('reminder', r.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex gap-1.5">
              <input className="input !py-1 text-xs" placeholder="Reminder title" value={remTitle} onChange={(e) => setRemTitle(e.target.value)} />
              <input type="time" className="input !w-auto !py-1 text-xs" value={remTime} onChange={(e) => setRemTime(e.target.value)} />
            </div>
            <div className="mt-1.5 flex gap-1.5">
              <input className="input !py-1 text-xs" placeholder="Note (optional)" value={remNote} onChange={(e) => setRemNote(e.target.value)} />
              <button className="btn-primary !py-1 text-xs" onClick={() => void addReminder()} disabled={!remTitle.trim()}>＋ Set</button>
            </div>
          </div>

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
