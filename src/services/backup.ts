import { useData } from '../stores/data';

/**
 * Remove provider credentials from a settings object before it leaves the app.
 *
 * §28/§36: a backup file is shared, emailed and stored in cloud drives. It
 * must never carry API keys. The Phase 10 audit found backups embedding
 * plaintext keys because the whole settings object was serialised verbatim.
 * Model and provider choices are kept — only the secret is dropped, so a
 * restored install keeps its configuration and simply asks for the key again.
 */
function redactSecrets(settings: any): any {
  if (!settings || typeof settings !== 'object') return settings;
  const clone = JSON.parse(JSON.stringify(settings));

  const SECRET_KEYS = ['apiKey', 'api_key', 'secret', 'token', 'accessToken', 'refreshToken', 'password', 'credential'];
  const scrub = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    for (const [k, v] of Object.entries(node)) {
      if (SECRET_KEYS.includes(k) && typeof v === 'string' && v.length > 0) {
        delete node[k];
      } else if (v && typeof v === 'object') {
        scrub(v);
      }
    }
  };
  scrub(clone);
  return clone;
}

/** Build the full backup JSON (same shape as Settings → Download backup). */
export function buildBackup(): string {
  const st = useData.getState();
  const data = {
    app: 'clinical-rx',
    version: 2,
    exportedAt: new Date().toISOString(),
    records: {
      profile: st.profile,
      // Credentials are stripped: a backup is a data file, not a keychain.
      settings: redactSecrets(st.settings),
      days: st.days,
      diseases: st.diseases,
      medicines: st.medicines,
      investigations: st.investigations,
      questions: st.questions,
      lessons: st.lessons,
      revisions: st.revisions,
      bundles: st.bundles,
      chats: st.chats,
      quizzes: st.quizzes,
      reminders: st.reminders,
      wardRounds: st.wardRounds,
      wardEntries: st.wardEntries,
      wardAnalyses: st.wardAnalyses,
      academicStages: st.academicStages,
      academicPeriods: st.academicPeriods,
      courses: st.courses,
      activities: st.activities,

      // ---- Phase 6 professional / career records ----
      // These were missing from the backup entirely: a user could export a
      // backup, reinstall, restore, and silently lose every skill, project,
      // goal and certification they had recorded. Found in the Phase 10 audit.
      clinicalExperiences: st.clinicalExperiences,
      skills: st.skills,
      achievements: st.achievements,
      certifications: st.certifications,
      projects: st.projects,
      research: st.research,
      leadership: st.leadership,
      goals: st.goals,
    },
  };
  return JSON.stringify(data, null, 2);
}

/**
 * Every module a backup carries, paired with the key it uses in the file.
 * Restoring walks this list, so adding a module to buildBackup() and here is
 * all that is needed to keep export and import in step.
 */
const BACKUP_MODULES: Array<[module: string, key: string]> = [
  ['day', 'days'],
  ['disease', 'diseases'],
  ['medicine', 'medicines'],
  ['investigation', 'investigations'],
  ['question', 'questions'],
  ['lesson', 'lessons'],
  ['revision', 'revisions'],
  ['bundle', 'bundles'],
  ['chat', 'chats'],
  ['quiz', 'quizzes'],
  ['reminder', 'reminders'],
  ['wardRound', 'wardRounds'],
  ['wardEntry', 'wardEntries'],
  ['wardAnalysis', 'wardAnalyses'],
  ['academicStage', 'academicStages'],
  ['academicPeriod', 'academicPeriods'],
  ['course', 'courses'],
  ['activity', 'activities'],
  ['clinicalExperience', 'clinicalExperiences'],
  ['skill', 'skills'],
  ['achievement', 'achievements'],
  ['certification', 'certifications'],
  ['project', 'projects'],
  ['research', 'research'],
  ['leadership', 'leadership'],
  ['goal', 'goals'],
];

export interface RestoreOutcome {
  ok: boolean;
  restored: number;
  skipped: string[];
  message: string;
}

/**
 * Restore a backup file.
 *
 * Extracted from the Settings page so it can be tested and reused (the only
 * copy used to live inside a React event handler).
 *
 * §45 — data safety: this MERGES rather than wiping. Records in the backup
 * overwrite same-id records; anything present locally but absent from the
 * backup is left alone. A restore can therefore never be worse than a no-op.
 * Modules unknown to this version are skipped rather than aborting the whole
 * restore, so a backup from a newer build still restores what it can.
 */
export async function restoreBackup(json: string): Promise<RestoreOutcome> {
  let data: any;
  try {
    data = JSON.parse(json);
  } catch {
    return { ok: false, restored: 0, skipped: [], message: 'That file is not valid JSON.' };
  }
  if (!data || data.app !== 'clinical-rx') {
    return { ok: false, restored: 0, skipped: [], message: 'That file is not a CLINICAL Rx backup.' };
  }

  const recs = data.records ?? {};
  const st = useData.getState();
  let restored = 0;
  const skipped: string[] = [];

  const put = async (module: string, list: any) => {
    if (!Array.isArray(list)) return;
    for (const r of list) {
      if (!r || typeof r !== 'object' || !r.id) continue; // never write malformed rows
      try {
        await st.adapter.put(module as any, r.id, r, r.createdAt ?? Date.now(), r.updatedAt ?? Date.now());
        restored++;
      } catch {
        skipped.push(`${module}:${r.id}`);
      }
    }
  };

  if (recs.profile) await put('profile', [recs.profile]);
  if (recs.settings) await put('settings', [recs.settings]);
  for (const [module, key] of BACKUP_MODULES) await put(module, recs[key]);

  await st.init();

  return {
    ok: true,
    restored,
    skipped,
    message: `Restored ${restored} record(s).${skipped.length ? ` ${skipped.length} could not be read and were skipped.` : ''}`,
  };
}

/** Trigger a backup file download. */
export function downloadBackup(): void {
  const blob = new Blob([buildBackup()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `clinical-rx-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const DAY = 24 * 60 * 60 * 1000;

/** Check the auto-backup schedule; download + stamp if one is due. */
export async function runAutoBackupCheck(now = Date.now()): Promise<boolean> {
  const st = useData.getState();
  const settings = st.settings;
  const mode = settings?.autoBackup ?? 'off';
  if (mode === 'off' || !settings) return false;

  const period = mode === 'daily' ? DAY : 7 * DAY;
  const last = settings.lastAutoBackup ?? 0;
  if (now - last < period) return false;

  downloadBackup();
  await st.saveSettings({ ...settings, updatedAt: now, lastAutoBackup: now });
  st.setStatus('✓ Automatic backup downloaded');
  return true;
}
