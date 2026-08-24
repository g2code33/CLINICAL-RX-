import { useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData } from '../../stores/data';
import { Modal } from '../Modal';
import { EmptyState } from '../ui';
import { resolveEvidence, buildEvidence, setVisibility, saveCareerRecord, CONFIDENCE_LABEL } from '../../services/career';
import { retrieveKnowledge } from '../../services/intelligence';
import type { EvidenceRef, ModuleType, Visibility } from '../../types';

/**
 * Shared building blocks for every professional section.
 *
 * Keeping visibility, evidence and academic stamping in one place means all
 * eight modules behave identically — private by default, evidence by
 * reference, and history that never rewrites itself.
 */

// ---- Visibility --------------------------------------------------------

const VIS_META: Record<Visibility, { icon: string; label: string; hint: string }> = {
  private: { icon: '🔒', label: 'Private', hint: 'Only you. Never exported, never in your portfolio.' },
  portfolio: { icon: '📁', label: 'Portfolio', hint: 'Shown in your professional portfolio and CV draft.' },
  export: { icon: '📤', label: 'Export', hint: 'In your portfolio AND approved to leave the app in exports.' },
};

export function VisibilityBadge({ value }: { value?: Visibility }) {
  const v = VIS_META[value ?? 'private'];
  return (
    <span className="text-xs" title={v.hint}>
      {v.icon} {v.label}
    </span>
  );
}

export function VisibilityPicker({
  module,
  record,
  onChange,
}: {
  module: ModuleType;
  record: any;
  onChange?: () => void;
}) {
  const current: Visibility = record.visibility ?? 'private';
  return (
    <div className="flex flex-wrap items-center gap-1">
      {(Object.keys(VIS_META) as Visibility[]).map((v) => (
        <button
          key={v}
          title={VIS_META[v].hint}
          className={`rounded-full px-2 py-0.5 text-xs ${
            current === v ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'
          }`}
          onClick={async () => {
            await setVisibility(module, record, v);
            onChange?.();
          }}
        >
          {VIS_META[v].icon} {VIS_META[v].label}
        </button>
      ))}
    </div>
  );
}

// ---- Evidence ----------------------------------------------------------

/** Modules a professional record can cite as evidence. */
const EVIDENCE_SOURCES = [
  { key: 'lesson', label: 'Learning Note', icon: '💡' },
  { key: 'wardRound', label: 'Ward Round', icon: '🏥' },
  { key: 'clinicalExperience', label: 'Clinical Experience', icon: '🏥' },
  { key: 'project', label: 'Project', icon: '💻' },
  { key: 'research', label: 'Research', icon: '🔬' },
  { key: 'certification', label: 'Certification', icon: '📜' },
  { key: 'achievement', label: 'Achievement', icon: '🏆' },
  { key: 'course', label: 'Course', icon: '📘' },
  { key: 'disease', label: 'Disease', icon: '🦠' },
  { key: 'medicine', label: 'Medicine', icon: '💊' },
];

const ROUTES: Record<string, string> = {
  lesson: '/notes',
  wardRound: '/ward-rounds',
  clinicalExperience: '/journey/clinical-experience',
  project: '/journey/projects',
  research: '/journey/research',
  certification: '/journey/certifications',
  achievement: '/journey/achievements',
  course: '/courses',
  disease: '/diseases',
  medicine: '/medicines',
  skill: '/journey/skills',
  leadership: '/journey/leadership',
  goal: '/journey/goals',
};

export function EvidenceList({
  refs,
  onRemove,
}: {
  refs?: EvidenceRef[];
  onRemove?: (type: string, id: string) => void;
}) {
  const navigate = useNavigate();
  const resolved = resolveEvidence(refs);
  if (!resolved.length) return <p className="text-xs opacity-70">No evidence attached yet.</p>;

  return (
    <ul className="space-y-1 text-xs">
      {resolved.map((r) => (
        <li key={`${r.type}:${r.id}`} className="flex items-center justify-between gap-2">
          <span className={r.exists ? '' : 'opacity-70'}>
            {r.exists ? '✓' : '⚠️'} <span className="opacity-70">[{r.type}]</span> {r.display}
          </span>
          <span className="flex shrink-0 gap-2">
            {r.exists && (
              <button className="underline" onClick={() => navigate(ROUTES[r.type] ?? '/')}>
                Open
              </button>
            )}
            {onRemove && (
              <button className="underline" onClick={() => onRemove(r.type, r.id)}>
                Remove
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Picker that searches the whole app through the Intelligence Layer. */
export function EvidencePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ref: EvidenceRef) => void;
}) {
  const [q, setQ] = useState('');
  const [type, setType] = useState('');

  const results = useMemo(() => {
    if (!open) return [];
    try {
      return retrieveKnowledge({
        query: q,
        modules: type ? [type] : EVIDENCE_SOURCES.map((s) => s.key),
        limit: 25,
      }).records;
    } catch {
      return [];
    }
  }, [q, type, open]);

  return (
    <Modal open={open} onClose={onClose} title="Attach evidence">
      <div className="space-y-3">
        <p className="text-xs opacity-75">
          Evidence is stored as a link, not a copy. If the original is ever deleted, this record stays and simply notes that
          the source is gone.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="Search your records…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">All types</option>
            {EVIDENCE_SOURCES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.icon} {s.label}
              </option>
            ))}
          </select>
        </div>
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {results.length === 0 && <p className="text-sm opacity-70">No matching records.</p>}
          {results.map((r) => (
            <button
              key={`${r.module}:${r.id}`}
              className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={() => {
                onPick(buildEvidence(String(r.module), r.id));
                onClose();
              }}
            >
              <span className="truncate">
                <span className="opacity-70">[{String(r.module)}]</span> {r.title}
              </span>
              {r.date && <span className="shrink-0 text-xs opacity-60">{r.date}</span>}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ---- Confidence --------------------------------------------------------

export function ConfidencePicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: 1 | 2 | 3 | 4 | 5) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={`rounded px-2 py-0.5 text-xs ${value === n ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
          onClick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
          title={CONFIDENCE_LABEL[n]}
        >
          {n} · {CONFIDENCE_LABEL[n]}
        </button>
      ))}
    </div>
  );
}

// ---- Academic stamp badge ---------------------------------------------

export function StampBadge({ academic }: { academic?: { level?: string; academicYear?: string } }) {
  const stages = useData((s) => s.academicStages);
  if (!academic?.level && !academic?.academicYear) return null;
  const stage = stages.find((s) => s.level === academic.level);
  return (
    <span
      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] dark:bg-slate-700"
      title="The academic stage this record was created in. Promotion never changes it."
    >
      🎓 {stage?.name ?? `Level ${academic.level}`}
      {academic.academicYear ? ` · ${academic.academicYear}` : ''}
    </span>
  );
}

// ---- Generic section scaffold -----------------------------------------

export function SectionCard({
  title,
  subtitle,
  badges,
  children,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  badges?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <div className="text-xs opacity-75">{subtitle}</div>}
        </div>
        {actions}
      </div>
      {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
      {children}
    </div>
  );
}

/** Empty-state prompt shared by all professional sections. */
/**
 * Career-section empty state.
 *
 * Delegates to the app-wide EmptyState (§45) so career pages look identical to
 * every other module, and only adds the one thing that is specific here: the
 * reminder that professional records are private by default.
 */
export function CareerEmpty({ icon, title, hint }: { icon: string; title: string; hint: string }) {
  return (
    <EmptyState
      icon={icon}
      title={title}
      hint={hint}
      actions={
        <p className="text-xs opacity-60">Everything you add here starts private and stays on this device.</p>
      }
    />
  );
}

/** Small helper so sections can persist a field edit in one line. */
export function useSave(module: ModuleType, onDone?: () => void) {
  return async (record: any, patch: Record<string, any>) => {
    await saveCareerRecord(module, { ...record, ...patch });
    onDone?.();
  };
}
