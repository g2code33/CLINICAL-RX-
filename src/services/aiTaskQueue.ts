import { useData, uid } from '../stores/data';
import { newChatSession } from './defaults';
import { runAiModule, analyzeLearning, generateQuestions, revisionCoach, organizeNote } from './aiTools';
import type { AiModuleKey } from './aiTools';

const KEY = 'clinical-rx:ai-pending-tasks';

export interface PendingAiTask {
  id: string;
  section: string; // AiModuleKey
  mode: string; // chat | explain | analyze | organize | questions | revision
  userText: string;
  sessionTitle?: string;
  sessionId?: string;
  ts: number;
}

function load(): PendingAiTask[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function save(list: PendingAiTask[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* ignore */ }
}

export function getPendingAiTaskCount(): number {
  return load().length;
}

/** Persist a task for later (when offline). */
export function queueAiTask(t: Omit<PendingAiTask, 'id' | 'ts'>): void {
  const list = load();
  list.push({ ...t, id: uid(), ts: Date.now() });
  save(list);
}

/**
 * Run an AI task fully outside the component lifecycle. Even if the user
 * navigated away (component unmounted), this still completes and saves the
 * result into the section's chat — so nothing is lost.
 */
export async function executeAiTask(t: PendingAiTask): Promise<{ ok: boolean; text?: string; error?: string }> {
  const st = useData.getState();
  let session = t.sessionId ? st.chats.find((c) => c.id === t.sessionId) : null;
  if (!session) session = st.chats.find((c) => c.section === t.section && c.messages.length > 0 && !c.hidden) || null;
  if (!session) session = newChatSession(t.section, t.sessionTitle || t.userText.replace(/\s+/g, ' ').slice(0, 48));

  const now = Date.now();
  const userMsg = { id: uid(), role: 'user' as const, text: t.userText, ts: now };
  const afterUser = { ...session, messages: [...(session.messages ?? []), userMsg], updatedAt: now };
  await st.save('chat', afterUser);

  let res;
  try {
    if (t.mode === 'analyze') res = await analyzeLearning();
    else if (t.mode === 'questions') res = await generateQuestions();
    else if (t.mode === 'revision') res = await revisionCoach();
    else if (t.mode === 'organize') res = await organizeNote(t.userText);
    else res = await runAiModule(t.section as AiModuleKey, t.userText);
  } catch (e: any) {
    res = { ok: false as const, error: e?.message || 'AI task failed' };
  }

  const aiText = res.ok ? res.text : '⚠️ ' + res.error;
  const aiMsg = { id: uid(), role: 'ai' as const, text: aiText, ts: Date.now() };
  await st.save('chat', { ...afterUser, messages: [...(afterUser.messages ?? []), aiMsg], updatedAt: Date.now() });
  return res.ok ? { ok: true, text: res.text } : { ok: false, error: res.error };
}

/** Retry queued tasks once the network is back. Keeps failures queued. */
export async function processPendingAiTasks(): Promise<{ processed: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return { processed: 0, failed: 0 };
  const list = load();
  if (!list.length) return { processed: 0, failed: 0 };
  const remaining: PendingAiTask[] = [];
  let processed = 0, failed = 0;
  for (const t of list) {
    const r = await executeAiTask(t);
    if (r.ok) processed++;
    else { remaining.push(t); failed++; }
  }
  save(remaining);
  if (processed) useData.getState().setStatus(`✓ Completed ${processed} queued AI task(s)`);
  return { processed, failed };
}
