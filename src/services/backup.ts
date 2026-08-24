import { useData } from '../stores/data';

/** Build the full backup JSON (same shape as Settings → Download backup). */
export function buildBackup(): string {
  const st = useData.getState();
  const data = {
    app: 'clinical-rx',
    version: 2,
    exportedAt: new Date().toISOString(),
    records: {
      profile: st.profile,
      settings: st.settings,
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
    },
  };
  return JSON.stringify(data, null, 2);
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
