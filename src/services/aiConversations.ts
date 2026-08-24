import type { AiPersona } from './aiOrchestrator';
import type { AiSource } from './aiOrchestrator';

/**
 * 💬 CONVERSATION STORE
 *
 * Conversations are the AI's SHORT-TERM memory: the current thread is replayed
 * to the model so follow-up questions ("and what about its side effects?")
 * make sense.
 *
 * LONG-TERM memory is NOT stored here — it is retrieved live from the
 * Intelligence Layer, because the app's own records are the source of truth.
 * We deliberately never persist an AI statement as if it were user knowledge.
 *
 * Everything stays on the device. Nothing is uploaded automatically.
 */

export interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  ts: number;
  /** Records the assistant actually used, for the Sources panel. */
  sources?: AiSource[];
  runtime?: 'cloud' | 'local' | 'none';
  error?: boolean;
  /** A pending write-tool proposal awaiting Confirm/Cancel. */
  pendingTool?: { tool: string; args: any; label: string; destructive: boolean };
}

export interface AiConversation {
  id: string;
  title: string;
  module: AiPersona;
  provider?: string;
  model?: string;
  created: number;
  updated: number;
  messages: AiMessage[];
}

const KEY = 'clinical-rx:ai-conversations';
const MAX_CONVERSATIONS = 100;

function newId(): string {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadConversations(): AiConversation[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function persist(list: AiConversation[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_CONVERSATIONS)));
  } catch {
    /* quota — drop silently rather than break the chat */
  }
}

export function saveConversation(conv: AiConversation): AiConversation {
  const list = loadConversations();
  const i = list.findIndex((c) => c.id === conv.id);
  const updated = { ...conv, updated: Date.now() };
  if (i >= 0) list[i] = updated;
  else list.unshift(updated);
  list.sort((a, b) => b.updated - a.updated);
  persist(list);
  return updated;
}

export function createConversation(module: AiPersona = 'general', title = 'New conversation'): AiConversation {
  const conv: AiConversation = {
    id: newId(),
    title,
    module,
    created: Date.now(),
    updated: Date.now(),
    messages: [],
  };
  return saveConversation(conv);
}

export function getConversation(id: string): AiConversation | null {
  return loadConversations().find((c) => c.id === id) ?? null;
}

export function renameConversation(id: string, title: string): void {
  const conv = getConversation(id);
  if (conv) saveConversation({ ...conv, title: title.trim() || conv.title });
}

export function deleteConversation(id: string): void {
  persist(loadConversations().filter((c) => c.id !== id));
}

export function clearConversation(id: string): void {
  const conv = getConversation(id);
  if (conv) saveConversation({ ...conv, messages: [] });
}

export function clearAllConversations(): void {
  persist([]);
}

export function searchConversations(query: string): AiConversation[] {
  const q = query.trim().toLowerCase();
  const all = loadConversations();
  if (!q) return all;
  return all.filter(
    (c) => c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q))
  );
}

export function appendMessage(id: string, msg: Omit<AiMessage, 'id' | 'ts'>): AiConversation | null {
  const conv = getConversation(id);
  if (!conv) return null;
  const message: AiMessage = { ...msg, id: newId(), ts: Date.now() };
  const messages = [...conv.messages, message];
  // Auto-title from the first user message.
  let title = conv.title;
  if (title === 'New conversation' && msg.role === 'user') {
    title = msg.content.trim().slice(0, 60) || title;
  }
  return saveConversation({ ...conv, title, messages });
}

/** Recent turns replayed as short-term memory (kept small to bound the prompt). */
export function historyFor(conv: AiConversation | null, turns = 6): Array<{ role: 'user' | 'assistant'; content: string }> {
  if (!conv) return [];
  return conv.messages
    .filter((m) => !m.error && m.content.trim())
    .slice(-turns)
    .map((m) => ({ role: m.role, content: m.content }));
}

export function exportConversation(conv: AiConversation): string {
  const lines = [
    `# ${conv.title}`,
    '',
    `Module: ${conv.module}`,
    `Created: ${new Date(conv.created).toLocaleString()}`,
    conv.model ? `Model: ${conv.model}` : '',
    '',
    '---',
    '',
  ].filter(Boolean);

  for (const m of conv.messages) {
    lines.push(`## ${m.role === 'user' ? 'You' : 'AI'} — ${new Date(m.ts).toLocaleString()}`);
    lines.push('');
    lines.push(m.content);
    if (m.sources?.length) {
      lines.push('');
      lines.push('**Sources (your CLINICAL Rx records):**');
      for (const s of m.sources) lines.push(`- [${s.type}] ${s.title}${s.date ? ` (${s.date})` : ''}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
