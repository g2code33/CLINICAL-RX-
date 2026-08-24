import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../../components/ui';
import { Modal } from '../../components/Modal';
import { useData } from '../../stores/data';
import {
  CareerEmpty,
  ConfidencePicker,
  EvidenceList,
  EvidencePicker,
  SectionCard,
  StampBadge,
  VisibilityPicker,
} from '../../components/career/CareerShared';
import {
  CONFIDENCE_LABEL,
  GOAL_CATEGORIES,
  GOAL_STATUSES,
  PROJECT_STATUSES,
  SKILL_CATEGORIES,
  addMilestone,
  attachEvidence,
  deleteCareerRecord,
  detachEvidence,
  goalProgress,
  linkRoundToExperience,
  newAchievement,
  newCertification,
  newClinicalExperience,
  newGoal,
  newLeadership,
  newProject,
  newResearch,
  newSkill,
  removeMilestone,
  roundsInExperience,
  saveCareerRecord,
  toggleMilestone,
} from '../../services/career';
import type {
  Achievement,
  Certification,
  ClinicalExperience,
  EvidenceRef,
  Goal,
  LeadershipRole,
  ModuleType,
  Project,
  ResearchItem,
  Skill,
} from '../../types';

/**
 * All eight professional sections.
 *
 * They share one interaction model: a list of cards, an "Add" form, inline
 * editing, an evidence panel and a visibility picker. Every record is created
 * PRIVATE and stamped with the current academic stage.
 */

// ---- Shared field helpers ---------------------------------------------

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs">
      <span className="opacity-75">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input w-full ${props.className ?? ''}`} />;
}

function ListEditor({
  value,
  onChange,
  placeholder,
}: {
  value?: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState('');
  const items = value ?? [];
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1 text-xs">
          <span className="flex-1">• {it}</span>
          <button className="underline" onClick={() => onChange(items.filter((_, j) => j !== i))}>
            remove
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <TextInput
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              e.preventDefault();
              onChange([...items, draft.trim()]);
              setDraft('');
            }
          }}
        />
        <button
          className="btn-secondary shrink-0"
          onClick={() => {
            if (draft.trim()) {
              onChange([...items, draft.trim()]);
              setDraft('');
            }
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Evidence panel reused by every section. */
function EvidencePanel({ module, record }: { module: ModuleType; record: any }) {
  const [picking, setPicking] = useState(false);
  return (
    <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium">📎 Evidence</span>
        <button className="text-xs underline" onClick={() => setPicking(true)}>
          + Attach
        </button>
      </div>
      <div className="mt-1">
        <EvidenceList
          refs={record.evidence}
          onRemove={(type, id) => void detachEvidence(module, record, type, id)}
        />
      </div>
      <EvidencePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(ref: EvidenceRef) => void attachEvidence(module, record, ref)}
      />
    </div>
  );
}

function DeleteButton({ module, record, warning }: { module: ModuleType; record: any; warning?: string }) {
  return (
    <button
      className="text-xs text-red-600 underline"
      onClick={() => {
        const ok = window.confirm(
          `Delete "${record.title ?? 'this record'}"?\n\n${warning ?? 'Records that cite it as evidence will keep their link and simply note that the original no longer exists.'}`
        );
        if (ok) void deleteCareerRecord(module, record.id);
      }}
    >
      Delete
    </button>
  );
}

function AddBar({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="card flex flex-wrap gap-2">
      <TextInput
        className="min-w-40 flex-1"
        placeholder={label}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && v.trim()) {
            onAdd(v.trim());
            setV('');
          }
        }}
      />
      <button
        className="btn-primary shrink-0"
        disabled={!v.trim()}
        onClick={() => {
          onAdd(v.trim());
          setV('');
        }}
      >
        ＋ Add
      </button>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  const navigate = useNavigate();
  return (
    <PageHeader
      title={title}
      subtitle={subtitle}
      action={
        <button className="btn-secondary" onClick={() => navigate('/journey')}>
          ← Journey
        </button>
      }
    />
  );
}

// =========================================================================
// 🏥 CLINICAL EXPERIENCE
// =========================================================================

export function ClinicalExperiencePage() {
  const experiences = useData((s) => s.clinicalExperiences);
  const rounds = useData((s) => s.wardRounds);
  const [linking, setLinking] = useState<ClinicalExperience | null>(null);

  const sorted = useMemo(() => [...experiences].sort((a, b) => b.startDate.localeCompare(a.startDate)), [experiences]);

  return (
    <div className="space-y-4">
      <Header
        title="🏥 Clinical Experience"
        subtitle="Rotations and placements — the bigger picture around your individual ward rounds."
      />
      <AddBar
        label="Rotation name, e.g. Medical Ward Rotation"
        onAdd={(t) => void saveCareerRecord('clinicalExperience', newClinicalExperience(t))}
      />

      {sorted.length === 0 ? (
        <CareerEmpty
          icon="🏥"
          title="No clinical experience recorded yet"
          hint="Add a rotation or placement. Ward rounds inside its dates are linked automatically."
        />
      ) : (
        sorted.map((e) => {
          const linked = roundsInExperience(e);
          return (
            <SectionCard
              key={e.id}
              title={e.title}
              subtitle={
                <>
                  {[e.institution, e.clinicalArea].filter(Boolean).join(' · ')}
                  {e.institution || e.clinicalArea ? ' · ' : ''}
                  {e.startDate} → {e.endDate || 'ongoing'}
                </>
              }
              badges={
                <>
                  <StampBadge academic={e.academic} />
                  <span className="text-xs">🏥 {linked.length} ward round{linked.length === 1 ? '' : 's'}</span>
                  <VisibilityPicker module="clinicalExperience" record={e} />
                </>
              }
              actions={<DeleteButton module="clinicalExperience" record={e} />}
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Institution / setting">
                  <TextInput
                    defaultValue={e.institution ?? ''}
                    onBlur={(ev) => void saveCareerRecord('clinicalExperience', { ...e, institution: ev.target.value })}
                  />
                </Field>
                <Field label="Clinical area">
                  <TextInput
                    defaultValue={e.clinicalArea ?? ''}
                    onBlur={(ev) => void saveCareerRecord('clinicalExperience', { ...e, clinicalArea: ev.target.value })}
                  />
                </Field>
                <Field label="Start date">
                  <TextInput
                    type="date"
                    defaultValue={e.startDate}
                    onBlur={(ev) => void saveCareerRecord('clinicalExperience', { ...e, startDate: ev.target.value })}
                  />
                </Field>
                <Field label="End date">
                  <TextInput
                    type="date"
                    defaultValue={e.endDate ?? ''}
                    onBlur={(ev) => void saveCareerRecord('clinicalExperience', { ...e, endDate: ev.target.value })}
                  />
                </Field>
              </div>

              <Field label="Learning objectives">
                <ListEditor
                  value={e.objectives}
                  placeholder="Add an objective…"
                  onChange={(v) => void saveCareerRecord('clinicalExperience', { ...e, objectives: v })}
                />
              </Field>
              <Field label="Skills practiced">
                <ListEditor
                  value={e.skillsPracticed}
                  placeholder="Add a skill…"
                  onChange={(v) => void saveCareerRecord('clinicalExperience', { ...e, skillsPracticed: v })}
                />
              </Field>
              <Field label="Reflections">
                <textarea
                  className="input w-full"
                  rows={2}
                  defaultValue={e.reflections ?? ''}
                  onBlur={(ev) => void saveCareerRecord('clinicalExperience', { ...e, reflections: ev.target.value })}
                />
              </Field>

              <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">🏥 Ward rounds in this rotation</span>
                  <button className="text-xs underline" onClick={() => setLinking(e)}>
                    + Link a round
                  </button>
                </div>
                {linked.length === 0 ? (
                  <p className="mt-1 text-xs opacity-70">
                    None yet. Rounds dated inside this rotation are included automatically.
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-xs">
                    {linked.map((r) => (
                      <li key={r.id}>
                        • {r.ward} — {r.date}
                        {(e.relatedRoundIds ?? []).includes(r.id) ? ' (linked)' : ' (by date)'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <EvidencePanel module="clinicalExperience" record={e} />
            </SectionCard>
          );
        })
      )}

      <Modal open={!!linking} onClose={() => setLinking(null)} title="Link a ward round">
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {rounds.length === 0 && <p className="text-sm opacity-70">No ward rounds recorded yet.</p>}
          {rounds.map((r) => (
            <button
              key={r.id}
              className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
              onClick={async () => {
                if (linking) await linkRoundToExperience(linking, r.id);
                setLinking(null);
              }}
            >
              {r.ward} — {r.date}
            </button>
          ))}
        </div>
      </Modal>
    </div>
  );
}

// =========================================================================
// 🧠 SKILLS
// =========================================================================

export function SkillsPage() {
  const skills = useData((s) => s.skills);
  const [filter, setFilter] = useState<string>('');

  const grouped = useMemo(() => {
    return SKILL_CATEGORIES.map((c) => ({
      ...c,
      skills: skills.filter((s) => s.category === c.key && !s.archived && (!filter || s.category === filter)),
    })).filter((g) => g.skills.length > 0);
  }, [skills, filter]);

  return (
    <div className="space-y-4">
      <Header
        title="🧠 Skills"
        subtitle="Your competencies, rated by you and backed by evidence from your own records."
      />

      <div className="card">
        <p className="text-xs opacity-75">
          Confidence is always yours to set — the app never awards you a competency. Attach evidence so your rating is
          defensible in an interview.
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          <button
            className={`rounded-full px-3 py-1 text-xs ${!filter ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
            onClick={() => setFilter('')}
          >
            All
          </button>
          {SKILL_CATEGORIES.map((c) => (
            <button
              key={c.key}
              className={`rounded-full px-3 py-1 text-xs ${filter === c.key ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
              onClick={() => setFilter(c.key)}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>

      <AddSkillBar />

      {grouped.length === 0 ? (
        <CareerEmpty icon="🧠" title="No skills recorded yet" hint="Add a skill, rate your own confidence, then attach evidence." />
      ) : (
        grouped.map((g) => (
          <div key={g.key} className="space-y-2">
            <h2 className="font-semibold">
              {g.icon} {g.label} ({g.skills.length})
            </h2>
            {g.skills.map((s: Skill) => (
              <SectionCard
                key={s.id}
                title={s.title}
                subtitle={`${CONFIDENCE_LABEL[s.confidence]} · ${(s.evidence ?? []).length} evidence link(s)`}
                badges={
                  <>
                    <StampBadge academic={s.academic} />
                    <VisibilityPicker module="skill" record={s} />
                  </>
                }
                actions={<DeleteButton module="skill" record={s} />}
              >
                <Field label="Your confidence (you control this)">
                  <ConfidencePicker
                    value={s.confidence}
                    onChange={(v) => void saveCareerRecord('skill', { ...s, confidence: v })}
                  />
                </Field>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Field label="Category">
                    <select
                      className="input w-full"
                      value={s.category}
                      onChange={(e) => void saveCareerRecord('skill', { ...s, category: e.target.value as any })}
                    >
                      {SKILL_CATEGORIES.map((c) => (
                        <option key={c.key} value={c.key}>
                          {c.icon} {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Date developed">
                    <TextInput
                      type="date"
                      defaultValue={s.dateDeveloped ?? ''}
                      onBlur={(e) => void saveCareerRecord('skill', { ...s, dateDeveloped: e.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Description">
                  <textarea
                    className="input w-full"
                    rows={2}
                    defaultValue={s.description ?? ''}
                    onBlur={(e) => void saveCareerRecord('skill', { ...s, description: e.target.value })}
                  />
                </Field>
                <EvidencePanel module="skill" record={s} />
              </SectionCard>
            ))}
          </div>
        ))
      )}
    </div>
  );
}

function AddSkillBar() {
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState<string>('clinical');
  return (
    <div className="card flex flex-wrap gap-2">
      <TextInput
        className="min-w-40 flex-1"
        placeholder="Skill name, e.g. Patient counselling"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
        {SKILL_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {c.icon} {c.label}
          </option>
        ))}
      </select>
      <button
        className="btn-primary shrink-0"
        disabled={!title.trim()}
        onClick={() => {
          void saveCareerRecord('skill', newSkill(title.trim(), cat as any));
          setTitle('');
        }}
      >
        ＋ Add
      </button>
    </div>
  );
}

// =========================================================================
// 💻 PROJECTS
// =========================================================================

export function ProjectsPage() {
  const projects = useData((s) => s.projects);
  const skills = useData((s) => s.skills);
  const sorted = useMemo(
    () => [...projects].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? '')),
    [projects]
  );

  return (
    <div className="space-y-4">
      <Header title="💻 Projects" subtitle="Pharmacy, research, software, digital health and community work." />
      <AddBar label="Project name" onAdd={(t) => void saveCareerRecord('project', newProject(t))} />

      {sorted.length === 0 ? (
        <CareerEmpty icon="💻" title="No projects yet" hint="Record what you build — it is the strongest evidence of a skill." />
      ) : (
        sorted.map((p: Project) => (
          <SectionCard
            key={p.id}
            title={p.title}
            subtitle={[p.role, p.status].filter(Boolean).join(' · ')}
            badges={
              <>
                <StampBadge academic={p.academic} />
                <VisibilityPicker module="project" record={p} />
              </>
            }
            actions={<DeleteButton module="project" record={p} warning="Skills that cite this project keep their evidence link and will note that the original no longer exists." />}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Status">
                <select
                  className="input w-full"
                  value={p.status}
                  onChange={(e) => void saveCareerRecord('project', { ...p, status: e.target.value as any })}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.toUpperCase()}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <TextInput defaultValue={p.role ?? ''} onBlur={(e) => void saveCareerRecord('project', { ...p, role: e.target.value })} />
              </Field>
              <Field label="Start date">
                <TextInput
                  type="date"
                  defaultValue={p.startDate ?? ''}
                  onBlur={(e) => void saveCareerRecord('project', { ...p, startDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className="input w-full"
                rows={2}
                defaultValue={p.description ?? ''}
                onBlur={(e) => void saveCareerRecord('project', { ...p, description: e.target.value })}
              />
            </Field>
            <Field label="Outcomes">
              <textarea
                className="input w-full"
                rows={2}
                defaultValue={p.outcomes ?? ''}
                onBlur={(e) => void saveCareerRecord('project', { ...p, outcomes: e.target.value })}
              />
            </Field>
            <Field label="Technologies">
              <ListEditor
                value={p.technologies}
                placeholder="Add a technology…"
                onChange={(v) => void saveCareerRecord('project', { ...p, technologies: v })}
              />
            </Field>
            <Field label="Links">
              <ListEditor value={p.links} placeholder="https://…" onChange={(v) => void saveCareerRecord('project', { ...p, links: v })} />
            </Field>

            <Field label="Skills demonstrated">
              <div className="flex flex-wrap gap-1">
                {skills.length === 0 && <span className="text-xs opacity-70">Add skills first to link them here.</span>}
                {skills.map((s) => {
                  const on = (p.skillIds ?? []).includes(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`rounded-full px-2 py-0.5 text-xs ${on ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-700'}`}
                      onClick={() => {
                        const next = on ? (p.skillIds ?? []).filter((i) => i !== s.id) : [...(p.skillIds ?? []), s.id];
                        void saveCareerRecord('project', { ...p, skillIds: next });
                      }}
                    >
                      {on ? '✓ ' : ''}
                      {s.title}
                    </button>
                  );
                })}
              </div>
            </Field>

            <EvidencePanel module="project" record={p} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

// =========================================================================
// 🔬 RESEARCH
// =========================================================================

const RESEARCH_KINDS = [
  { key: 'interest', label: 'Interest' },
  { key: 'project', label: 'Research project' },
  { key: 'literature', label: 'Literature note' },
  { key: 'publication', label: 'Publication' },
  { key: 'presentation', label: 'Presentation' },
];

export function ResearchPage() {
  const research = useData((s) => s.research);

  return (
    <div className="space-y-4">
      <Header title="🔬 Research" subtitle="Interests, projects, reading and outputs. A foundation, not a reference manager." />
      <AddBar label="Research topic or title" onAdd={(t) => void saveCareerRecord('research', newResearch(t))} />

      {research.length === 0 ? (
        <CareerEmpty icon="🔬" title="No research recorded yet" hint="Start with an interest — it becomes the seed for a project later." />
      ) : (
        research.map((r: ResearchItem) => (
          <SectionCard
            key={r.id}
            title={r.title}
            subtitle={[r.kind, r.topic].filter(Boolean).join(' · ')}
            badges={
              <>
                <StampBadge academic={r.academic} />
                <VisibilityPicker module="research" record={r} />
              </>
            }
            actions={<DeleteButton module="research" record={r} />}
          >
            <div className="grid gap-2 sm:grid-cols-3">
              <Field label="Type">
                <select
                  className="input w-full"
                  value={r.kind}
                  onChange={(e) => void saveCareerRecord('research', { ...r, kind: e.target.value as any })}
                >
                  {RESEARCH_KINDS.map((k) => (
                    <option key={k.key} value={k.key}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Topic">
                <TextInput defaultValue={r.topic ?? ''} onBlur={(e) => void saveCareerRecord('research', { ...r, topic: e.target.value })} />
              </Field>
              <Field label="Start date">
                <TextInput
                  type="date"
                  defaultValue={r.startDate ?? ''}
                  onBlur={(e) => void saveCareerRecord('research', { ...r, startDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Description / notes">
              <textarea
                className="input w-full"
                rows={2}
                defaultValue={r.description ?? ''}
                onBlur={(e) => void saveCareerRecord('research', { ...r, description: e.target.value })}
              />
            </Field>
            {(r.kind === 'publication' || r.kind === 'presentation') && (
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Authors">
                  <TextInput defaultValue={r.authors ?? ''} onBlur={(e) => void saveCareerRecord('research', { ...r, authors: e.target.value })} />
                </Field>
                <Field label="Venue / journal">
                  <TextInput defaultValue={r.venue ?? ''} onBlur={(e) => void saveCareerRecord('research', { ...r, venue: e.target.value })} />
                </Field>
              </div>
            )}
            <EvidencePanel module="research" record={r} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

// =========================================================================
// 🏅 LEADERSHIP
// =========================================================================

export function LeadershipPage() {
  const leadership = useData((s) => s.leadership);
  const [org, setOrg] = useState('');
  const [pos, setPos] = useState('');

  const sorted = useMemo(() => [...leadership].sort((a, b) => b.startDate.localeCompare(a.startDate)), [leadership]);

  return (
    <div className="space-y-4">
      <Header title="🏅 Leadership & Activities" subtitle="Positions you hold and have held. Past roles are preserved." />

      <div className="card flex flex-wrap gap-2">
        <TextInput className="min-w-32 flex-1" placeholder="Organization" value={org} onChange={(e) => setOrg(e.target.value)} />
        <TextInput className="min-w-32 flex-1" placeholder="Position" value={pos} onChange={(e) => setPos(e.target.value)} />
        <button
          className="btn-primary shrink-0"
          disabled={!org.trim() || !pos.trim()}
          onClick={() => {
            void saveCareerRecord('leadership', newLeadership(org.trim(), pos.trim()));
            setOrg('');
            setPos('');
          }}
        >
          ＋ Add
        </button>
      </div>

      {sorted.length === 0 ? (
        <CareerEmpty icon="🏅" title="No leadership roles recorded" hint="Class rep, society exec, project lead — they all count." />
      ) : (
        sorted.map((l: LeadershipRole) => (
          <SectionCard
            key={l.id}
            title={`${l.position} — ${l.organization}`}
            subtitle={`${l.startDate} → ${l.endDate || 'present'}`}
            badges={
              <>
                <StampBadge academic={l.academic} />
                <VisibilityPicker module="leadership" record={l} />
              </>
            }
            actions={<DeleteButton module="leadership" record={l} />}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Start date">
                <TextInput
                  type="date"
                  defaultValue={l.startDate}
                  onBlur={(e) => void saveCareerRecord('leadership', { ...l, startDate: e.target.value })}
                />
              </Field>
              <Field label="End date (leave blank if current)">
                <TextInput
                  type="date"
                  defaultValue={l.endDate ?? ''}
                  onBlur={(e) => void saveCareerRecord('leadership', { ...l, endDate: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Responsibilities">
              <ListEditor
                value={l.responsibilities}
                placeholder="Add a responsibility…"
                onChange={(v) => void saveCareerRecord('leadership', { ...l, responsibilities: v })}
              />
            </Field>
            <Field label="Achievements in this role">
              <ListEditor
                value={l.achievements}
                placeholder="Add an achievement…"
                onChange={(v) => void saveCareerRecord('leadership', { ...l, achievements: v })}
              />
            </Field>
            <EvidencePanel module="leadership" record={l} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

// =========================================================================
// 🏆 ACHIEVEMENTS
// =========================================================================

const ACH_CATEGORIES = ['academic', 'competition', 'leadership', 'clinical', 'project', 'research', 'other'];

export function AchievementsPage() {
  const achievements = useData((s) => s.achievements);
  const sorted = useMemo(() => [...achievements].sort((a, b) => b.date.localeCompare(a.date)), [achievements]);

  return (
    <div className="space-y-4">
      <Header title="🏆 Achievements" subtitle="Real, dated accomplishments. Nothing here is ever auto-generated." />
      <AddBar label="Achievement title" onAdd={(t) => void saveCareerRecord('achievement', newAchievement(t))} />

      {sorted.length === 0 ? (
        <CareerEmpty icon="🏆" title="No achievements recorded" hint="Awards, competitions, recognitions — add them as they happen." />
      ) : (
        sorted.map((a: Achievement) => (
          <SectionCard
            key={a.id}
            title={a.title}
            subtitle={`${a.category} · ${a.date}`}
            badges={
              <>
                <StampBadge academic={a.academic} />
                <VisibilityPicker module="achievement" record={a} />
              </>
            }
            actions={<DeleteButton module="achievement" record={a} />}
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Field label="Category">
                <select
                  className="input w-full"
                  value={a.category}
                  onChange={(e) => void saveCareerRecord('achievement', { ...a, category: e.target.value as any })}
                >
                  {ACH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date">
                <TextInput type="date" defaultValue={a.date} onBlur={(e) => void saveCareerRecord('achievement', { ...a, date: e.target.value })} />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className="input w-full"
                rows={2}
                defaultValue={a.description ?? ''}
                onBlur={(e) => void saveCareerRecord('achievement', { ...a, description: e.target.value })}
              />
            </Field>
            <EvidencePanel module="achievement" record={a} />
          </SectionCard>
        ))
      )}
    </div>
  );
}

// =========================================================================
// 📜 CERTIFICATIONS
// =========================================================================

export function CertificationsPage() {
  const certifications = useData((s) => s.certifications);
  const sorted = useMemo(() => [...certifications].sort((a, b) => b.dateObtained.localeCompare(a.dateObtained)), [certifications]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <Header title="📜 Certifications" subtitle="Credentials you hold. Reference numbers stay on this device and are never exported." />
      <AddBar label="Certification name" onAdd={(t) => void saveCareerRecord('certification', newCertification(t))} />

      {sorted.length === 0 ? (
        <CareerEmpty icon="📜" title="No certifications recorded" hint="BLS, short courses, professional registrations — add them here." />
      ) : (
        sorted.map((c: Certification) => {
          const expired = c.expiryDate && c.expiryDate < today;
          return (
            <SectionCard
              key={c.id}
              title={c.title}
              subtitle={[c.issuer, c.dateObtained].filter(Boolean).join(' · ')}
              badges={
                <>
                  {expired && <span className="text-xs text-amber-600">⚠️ Expired {c.expiryDate}</span>}
                  <VisibilityPicker module="certification" record={c} />
                </>
              }
              actions={<DeleteButton module="certification" record={c} />}
            >
              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Issuing organization">
                  <TextInput defaultValue={c.issuer ?? ''} onBlur={(e) => void saveCareerRecord('certification', { ...c, issuer: e.target.value })} />
                </Field>
                <Field label="Date obtained">
                  <TextInput
                    type="date"
                    defaultValue={c.dateObtained}
                    onBlur={(e) => void saveCareerRecord('certification', { ...c, dateObtained: e.target.value })}
                  />
                </Field>
                <Field label="Expiry date">
                  <TextInput
                    type="date"
                    defaultValue={c.expiryDate ?? ''}
                    onBlur={(e) => void saveCareerRecord('certification', { ...c, expiryDate: e.target.value })}
                  />
                </Field>
              </div>
              <Field label="Credential / reference number">
                <TextInput
                  type="password"
                  placeholder="Kept private — never exported or sent to AI"
                  defaultValue={c.credentialId ?? ''}
                  onBlur={(e) => void saveCareerRecord('certification', { ...c, credentialId: e.target.value })}
                />
              </Field>
              <p className="text-[11px] opacity-70">
                🔒 Reference numbers are excluded from search, AI context, your portfolio and every export.
              </p>
              <Field label="Description">
                <textarea
                  className="input w-full"
                  rows={2}
                  defaultValue={c.description ?? ''}
                  onBlur={(e) => void saveCareerRecord('certification', { ...c, description: e.target.value })}
                />
              </Field>
              <EvidencePanel module="certification" record={c} />
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

// =========================================================================
// 🎯 GOALS
// =========================================================================

export function GoalsPage() {
  const goals = useData((s) => s.goals);
  const [msDraft, setMsDraft] = useState<Record<string, string>>({});

  return (
    <div className="space-y-4">
      <Header title="🎯 Goals" subtitle="Targets with real milestones. Progress only moves when you tick something off." />
      <AddBar label="Goal, e.g. Become stronger in clinical pharmacotherapy" onAdd={(t) => void saveCareerRecord('goal', newGoal(t))} />

      {goals.length === 0 ? (
        <CareerEmpty icon="🎯" title="No goals set" hint="Break a big ambition into milestones you can actually tick off." />
      ) : (
        goals.map((g: Goal) => {
          const p = goalProgress(g);
          return (
            <SectionCard
              key={g.id}
              title={g.title}
              subtitle={`${g.category} · ${g.status.replace('-', ' ')}`}
              badges={
                <>
                  <StampBadge academic={g.academic} />
                  <VisibilityPicker module="goal" record={g} />
                </>
              }
              actions={<DeleteButton module="goal" record={g} />}
            >
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${p.percent}%` }} />
                </div>
                <span className="text-xs opacity-75">
                  {p.total ? `${p.done}/${p.total} · ${p.percent}%` : 'no milestones yet'}
                </span>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <Field label="Category">
                  <select
                    className="input w-full"
                    value={g.category}
                    onChange={(e) => void saveCareerRecord('goal', { ...g, category: e.target.value as any })}
                  >
                    {GOAL_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Status">
                  <select
                    className="input w-full"
                    value={g.status}
                    onChange={(e) => void saveCareerRecord('goal', { ...g, status: e.target.value as any })}
                  >
                    {GOAL_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s.replace('-', ' ').toUpperCase()}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Target date">
                  <TextInput
                    type="date"
                    defaultValue={g.targetDate ?? ''}
                    onBlur={(e) => void saveCareerRecord('goal', { ...g, targetDate: e.target.value })}
                  />
                </Field>
              </div>

              <div className="rounded border border-slate-200 p-2 dark:border-slate-700">
                <span className="text-xs font-medium">Milestones</span>
                <div className="mt-1 space-y-1">
                  {(g.milestones ?? []).map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={m.done} onChange={() => void toggleMilestone(g, m.id)} />
                      <span className={`flex-1 ${m.done ? 'line-through opacity-60' : ''}`}>{m.title}</span>
                      <button className="text-xs underline" onClick={() => void removeMilestone(g, m.id)}>
                        remove
                      </button>
                    </div>
                  ))}
                  {(g.milestones ?? []).length === 0 && <p className="text-xs opacity-70">No milestones yet.</p>}
                </div>
                <div className="mt-2 flex gap-1">
                  <TextInput
                    placeholder="Add a milestone…"
                    value={msDraft[g.id] ?? ''}
                    onChange={(e) => setMsDraft({ ...msDraft, [g.id]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (msDraft[g.id] ?? '').trim()) {
                        void addMilestone(g, msDraft[g.id].trim());
                        setMsDraft({ ...msDraft, [g.id]: '' });
                      }
                    }}
                  />
                  <button
                    className="btn-secondary shrink-0"
                    onClick={() => {
                      if ((msDraft[g.id] ?? '').trim()) {
                        void addMilestone(g, msDraft[g.id].trim());
                        setMsDraft({ ...msDraft, [g.id]: '' });
                      }
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>

              <EvidencePanel module="goal" record={g} />
            </SectionCard>
          );
        })
      )}
    </div>
  );
}
