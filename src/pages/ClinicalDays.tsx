import { useState } from 'react';
import { useData } from '../stores/data';
import { PageHeader, EmptyState } from '../components/ui';
import { TagInput } from '../components/Modal';
import { newDay, todayIso } from '../services/defaults';
import { CloudSyncPrompt } from '../components/CloudSyncPrompt';
import { dayToMarkdown, dayToPdf, daysToCsv, downloadText } from '../services/export';
import { ViewToggle } from '../components/ViewToggle';
import { scanForPhi, privacyWarning } from '../services/privacy';
import { notifyAction } from '../components/ui/globalConfirm';

const SECTIONS: Array<{ key: 'conditions' | 'medicines' | 'investigations' | 'observations' | 'lessons' | 'uncertainties' | 'topicsToResearch'; label: string; icon: string }> = [
  { key: 'conditions', label: 'Conditions encountered', icon: '🦠' },
  { key: 'medicines', label: 'Medicines', icon: '💊' },
  { key: 'investigations', label: 'Investigations', icon: '🧪' },
  { key: 'observations', label: 'Symptoms / signs observed', icon: '🩺' },
  { key: 'lessons', label: 'What I learned', icon: '💡' },
  { key: 'uncertainties', label: 'What I don’t understand', icon: '🤔' },
  { key: 'topicsToResearch', label: 'Topics to research', icon: '📚' },
];

export function ClinicalDays() {
  const days = useData((s) => s.days);
  const profile = useData((s) => s.profile)!;
  const save = useData((s) => s.save);
  const [selected, setSelected] = useState<string | null>(() => {
    // Prefer today's log if it exists, else the most recent day.
    const today = days.find((d) => d.date === todayIso());
    return (today?.id ?? days[0]?.id ?? null);
  });
  const [view, setView] = useState<'cards' | 'list'>('cards');
  const day = days.find((d) => d.id === selected) ?? null;

  async function addDay() {
    const next = newDay((days.length ? Math.max(...days.map((d) => d.dayNumber)) : 0) + 1, profile.site);
    await save('day', next);
    await useData.getState().saveProfile({ ...profile, clinicalDay: next.dayNumber });
    setSelected(next.id);
  }

  async function updateSection(key: string, value: string[]) {
    if (!day) return;
    await save('day', { ...day, [key]: value });
  }

  async function exportDay(kind: 'md' | 'pdf') {
    if (!day) return;
    const text = dayToMarkdown(day);
    const finding = scanForPhi(text);
    if (finding.length) {
      await notifyAction({
        title: '⚠️ Possible patient-identifying information',
        message: privacyWarning(finding),
        note: 'Clinical Rx is not a patient record. Please review and remove anything identifying before you share this.',
        confirmLabel: 'I understand',
      });
    }
    const base = `clinical-day-${day.dayNumber}`;
    if (kind === 'md') {
      downloadText(`${base}.md`, text);
    } else {
      const dataUrl = await dayToPdf(day);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `${base}.pdf`;
      a.click();
    }
    useData.getState().setStatus(`✓ Exported ${kind.toUpperCase()}`);
  }

  return (
    <div>
      <PageHeader
        title="Clinical Days"
        subtitle="Record what you see and learn each day — no patient-identifying information."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CloudSyncPrompt />
            <button className="btn-secondary" onClick={() => { downloadText(`clinical-rx-days-${new Date().toISOString().slice(0, 10)}.csv`, daysToCsv(days), 'text/csv'); }} title="Export all days as CSV (Excel/Sheets)">
              ⬇ CSV
            </button>
            <button className="btn-primary" onClick={addDay}>＋ New Clinical Day</button>
          </div>
        }
      />

      {days.length === 0 ? (
        <EmptyState icon="📋" title="No clinical days yet" hint="Start today's log to begin capturing conditions, medicines, investigations and lessons." />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">{days.length} days</span>
              <ViewToggle view={view} onChange={setView} />
            </div>
            {view === 'cards' ? (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className={`rounded-xl border p-3 text-left transition-colors ${
                      d.id === selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900' : 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    <div className="text-lg">📅</div>
                    <div className="mt-1 font-semibold">Day {d.dayNumber}</div>
                    <div className="text-[11px] text-slate-400">{d.date}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.conditions.slice(0, 2).map((c) => <span key={c} className="rounded bg-brand-50 px-1 py-0.5 text-[10px] dark:bg-brand-900">{c}</span>)}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {days.map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setSelected(d.id)}
                    className={`w-full rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                      d.id === selected ? 'border-brand-500 bg-brand-50 dark:bg-brand-900' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'
                    }`}
                  >
                    <div className="font-semibold">📅 Clinical Day {d.dayNumber}</div>
                    <div className="text-xs text-slate-400">{d.date} · {d.site}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {day && (
            <div className="card space-y-5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold">Clinical Day {day.dayNumber} — {day.site}</h2>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button className="btn-ghost !py-0.5 text-xs" onClick={() => exportDay('md')} title="Export as Markdown">⬇ MD</button>
                  <button className="btn-ghost !py-0.5 text-xs" onClick={() => exportDay('pdf')} title="Export as PDF">⬇ PDF</button>
                  <div className="text-xs text-slate-400">{day.date}</div>
                </div>
              </div>
              {SECTIONS.map((s) => (
                <div key={s.key}>
                  <label className="label">{s.icon} {s.label}</label>
                  <TagInput value={day[s.key]} onChange={(v) => updateSection(s.key, v)} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
