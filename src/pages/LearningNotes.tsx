import { useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useData, uid } from '../stores/data';
import { EmptyState, PageHeader, Pill } from '../components/ui';
import { Modal, TagInput } from '../components/Modal';
import { LearningFilterBar } from '../components/LearningFilterBar';
import { todayIso } from '../services/defaults';
import { currentStage, periodsFor } from '../services/academic';
import {
  academicLabel,
  applyFilter,
  addToRevision,
  isInRevision,
  logActivity,
  markViewed,
  relatedTo,
  softDelete,
  stampAcademic,
  toggleFavorite,
  type LearningFilter,
} from '../services/learning';
import type { Lesson } from '../types';
import { confirmAction } from '../components/ui/globalConfirm';

/**
 * 💡 Learning Notes — fast capture of "what did I learn?".
 * Only a title is required; everything else is optional so a note can be
 * saved in a couple of seconds during a lecture or on a ward.
 */
export function LearningNotes() {
  const lessons = useData((s) => s.lessons);
  const courses = useData((s) => s.courses);
  const save = useData((s) => s.save);

  const [filter, setFilter] = useState<LearningFilter>({});
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [creating, setCreating] = useState(false);

  // /notes?new=1 opens the capture form straight away (§10, §49).
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (params.get('new') === '1') {
      setCreating(true);
      params.delete('new');
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const visible = useMemo(
    () => applyFilter(lessons, filter).sort((a, b) => b.createdAt - a.createdAt),
    [lessons, filter]
  );

  async function create(draft: Partial<Lesson>) {
    const now = Date.now();
    const note = stampAcademic({
      id: uid(),
      createdAt: now,
      updatedAt: now,
      title: (draft.title ?? '').trim(),
      content: (draft.content ?? '').trim(),
      date: draft.date || todayIso(),
      important: !!draft.important,
      tags: draft.tags ?? [],
      personalNotes: '',
      academic: undefined,
    } as Lesson);
    if (draft.academic?.courseId) note.academic = { ...note.academic, courseId: draft.academic.courseId };
    await save('lesson', note);
    await logActivity('created', 'lesson', note.id, note.title);
    setCreating(false);
  }

  async function update(note: Lesson, patch: Partial<Lesson>) {
    await save('lesson', { ...note, ...patch });
    await logActivity('updated', 'lesson', note.id, note.title);
    setEditing(null);
  }

  return (
    <div>
      <PageHeader
        title="💡 Learning Notes"
        subtitle="Anything you learned — captured fast, filed against your academic year."
        action={
          <button className="btn-primary" onClick={() => setCreating(true)}>
            ＋ New note
          </button>
        }
      />

      <LearningFilterBar value={filter} onChange={setFilter} />

      {!visible.length ? (
        <div className="mt-4">
          <EmptyState
            icon="💡"
            title={lessons.length ? 'No notes match these filters' : 'No learning notes yet'}
            hint={
              lessons.length
                ? 'Try clearing the filters to see everything you have recorded.'
                : 'Capture something you learned — "statins inhibit HMG-CoA reductase and reduce LDL-C".'
            }
            actions={
              !lessons.length ? (
                <button className="btn-primary" onClick={() => setCreating(true)}>
                  ＋ Add your first note
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((n) => (
            <NoteCard key={n.id} note={n} onOpen={() => { markViewed('lesson', n.id, n.title); setEditing(n); }} />
          ))}
        </div>
      )}

      <NoteForm
        open={creating}
        courses={courses}
        onClose={() => setCreating(false)}
        onSave={create}
      />
      {editing && (
        <NoteForm
          open
          note={editing}
          courses={courses}
          onClose={() => setEditing(null)}
          onSave={(d) => update(editing, d)}
          onDelete={async () => {
            if (!(await confirmAction({
              title: `Delete "${editing.title}"?`,
              message: 'This moves the note to your archive.',
              note: 'Nothing else is affected, and you can restore it from the archive.',
              confirmLabel: 'Delete note',
              destructive: true,
            }))) return;
            await softDelete('lesson', editing.id);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function NoteCard({ note, onOpen }: { note: Lesson; onOpen: () => void }) {
  const rel = relatedTo('lesson', note.id);
  const relCount = rel.diseases.length + rel.medicines.length + rel.investigations.length;
  return (
    <div className="card flex flex-col">
      <button className="min-w-0 flex-1 text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <h3 className="min-w-0 flex-1 font-bold text-slate-800 dark:text-slate-100">
            {note.favorite && '⭐ '}
            {note.title || 'Untitled note'}
          </h3>
          {note.important && <Pill color="amber">Important</Pill>}
        </div>
        {note.content && (
          <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600 dark:text-slate-300">{note.content}</p>
        )}
      </button>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {(note.tags ?? []).slice(0, 4).map((t) => (
          <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-700">
            #{t}
          </span>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-slate-700">
        <span>{note.date}</span>
        {academicLabel(note) && <span>{academicLabel(note)}</span>}
        {relCount > 0 && <span title="Related knowledge">🔗 {relCount}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => toggleFavorite('lesson', note.id)}>
          {note.favorite ? '★ Unstar' : '☆ Star'}
        </button>
        <button
          className="btn-ghost !px-2 !py-1 text-xs"
          onClick={() => addToRevision('lesson', note.id)}
          disabled={isInRevision(note.id)}
        >
          {isInRevision(note.id) ? '📚 In revision' : '📚 Revise'}
        </button>
      </div>
    </div>
  );
}

function NoteForm({
  open,
  note,
  courses,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  note?: Lesson;
  courses: Array<{ id: string; title: string; stageId: string }>;
  onClose: () => void;
  onSave: (draft: Partial<Lesson>) => void | Promise<void>;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(note?.title ?? '');
  const [content, setContent] = useState(note?.content ?? '');
  const [tags, setTags] = useState<string[]>(note?.tags ?? []);
  const [important, setImportant] = useState(!!note?.important);
  const [date, setDate] = useState(note?.date ?? todayIso());
  const [courseId, setCourseId] = useState(note?.academic?.courseId ?? '');
  const [error, setError] = useState('');

  const stage = currentStage();
  const stageCourses = stage ? courses.filter((c) => c.stageId === stage.id) : courses;
  const period = stage ? periodsFor(stage.id).find((p) => p.id === useData.getState().profile?.currentPeriodId) : null;

  function submit() {
    if (!title.trim() && !content.trim()) {
      setError('Give the note a title or some content.');
      return;
    }
    onSave({
      title: title.trim() || content.trim().slice(0, 60),
      content: content.trim(),
      tags,
      important,
      date,
      academic: courseId ? ({ courseId } as any) : undefined,
    });
  }

  return (
    <Modal open={open} onClose={onClose} title={note ? '💡 Edit note' : '💡 New learning note'}>
      <div className="space-y-3">
        <div>
          <label className="label">Title</label>
          <input
            autoFocus
            className="input"
            placeholder="e.g. Statins"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
          />
        </div>
        <div>
          <label className="label">What did I learn?</label>
          <textarea
            className="input min-h-[110px] resize-y"
            placeholder="e.g. Statins inhibit HMG-CoA reductase and reduce LDL-C."
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError('');
            }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Course</label>
            <select className="input" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
              <option value="">No course</option>
              {stageCourses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Tags</label>
          <TagInput value={tags} onChange={setTags} placeholder="e.g. cardiology" />
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="accent-brand-600" checked={important} onChange={(e) => setImportant(e.target.checked)} />
          Mark as important
        </label>

        {!note && stage && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Will be filed under <strong>{stage.name} · {stage.academicYear}</strong>
            {period ? ` · ${period.name}` : ''} — and stays there even after you move up a level.
          </p>
        )}

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          {onDelete && (
            <button className="btn-ghost text-xs text-red-600" onClick={onDelete}>
              Delete
            </button>
          )}
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={submit}>
            Save
          </button>
        </div>
      </div>
    </Modal>
  );
}
