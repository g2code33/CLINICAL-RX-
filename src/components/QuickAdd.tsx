import { useState } from 'react';
import { Modal } from './Modal';
import { useData } from '../stores/data';
import { newDisease, newMedicine, newInvestigation, newQuestion, todayIso } from '../services/defaults';

type Kind = 'disease' | 'medicine' | 'investigation' | 'question' | 'lesson' | null;

const OPTIONS: Array<{ kind: Kind; icon: string; label: string }> = [
  { kind: 'disease', icon: '🦠', label: 'Disease' },
  { kind: 'medicine', icon: '💊', label: 'Medicine' },
  { kind: 'investigation', icon: '🧪', label: 'Investigation' },
  { kind: 'question', icon: '❓', label: 'Question' },
  { kind: 'lesson', icon: '💡', label: 'Something I learned' },
];

export function QuickAdd({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>(null);
  const [value, setValue] = useState('');
  const save = useData((s) => s.save);

  async function submit() {
    const text = value.trim();
    if (!text) return;
    const state = useData.getState();
    const existing = state.days.find((d) => d.date === todayIso());
    // Copy the day so we never mutate the store's object in place.
    const day = existing
      ? { ...existing, conditions: [...existing.conditions], medicines: [...existing.medicines], investigations: [...existing.investigations], lessons: [...existing.lessons] }
      : null;

    if (kind === 'disease') {
      const d = newDisease(text);
      await save('disease', d);
      if (day) {
        if (!day.conditions.includes(text)) day.conditions.push(text);
        day.updatedAt = Date.now();
        await save('day', day);
      }
    } else if (kind === 'medicine') {
      const m = newMedicine(text);
      await save('medicine', m);
      if (day) {
        if (!day.medicines.includes(text)) day.medicines.push(text);
        day.updatedAt = Date.now();
        await save('day', day);
      }
    } else if (kind === 'investigation') {
      const i = newInvestigation(text);
      await save('investigation', i);
      if (day) {
        if (!day.investigations.includes(text)) day.investigations.push(text);
        day.updatedAt = Date.now();
        await save('day', day);
      }
    } else if (kind === 'question') {
      await save('question', newQuestion(text));
    } else if (kind === 'lesson') {
      await save('lesson', {
        id: crypto.randomUUID ? crypto.randomUUID() : 'l' + Date.now(),
        createdAt: Date.now(), updatedAt: Date.now(), title: text, content: text, date: todayIso(), important: false,
      });
      if (day) {
        if (!day.lessons.includes(text)) day.lessons.push(text);
        day.updatedAt = Date.now();
        await save('day', day);
      }
    }
    setValue('');
    setKind(null);
    onClose();
  }

  return (
    <Modal open={open} onClose={() => { setKind(null); setValue(''); onClose(); }} title="⚡ Quick Capture">
      {!kind ? (
        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.kind}
              className="card flex items-center gap-2 text-left hover:border-brand-500"
              onClick={() => { setKind(o.kind); setValue(''); }}
            >
              <span className="text-2xl">{o.icon}</span>
              <span className="text-sm font-semibold">{o.label}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-sm font-semibold text-slate-600 dark:text-slate-300">
            {OPTIONS.find((o) => o.kind === kind)?.icon} Add {OPTIONS.find((o) => o.kind === kind)?.label}
          </div>
          <input
            autoFocus
            className="input"
            placeholder="Type it here…"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={() => setKind(null)}>Back</button>
            <button className="btn-primary" onClick={submit} disabled={!value.trim()}>Save ✓</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
