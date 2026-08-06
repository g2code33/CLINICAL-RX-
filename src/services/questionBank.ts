import type { QuizQuestion } from './aiTools';

export interface BankQuestion extends QuizQuestion {
  id: string;
  category: string;
  tags: string[];
  addedAt: number;
}

/** A labeled, dated group of imported questions (e.g. "Week 3 Pharmacology"). */
export interface BankGroup {
  id: string;
  label: string;
  createdAt: number; // auto-added import date
  questions: BankQuestion[];
}

const BANK_KEY = 'clinical-rx:question-bank';
const GROUPS_KEY = 'clinical-rx:question-bank-groups';

export function loadBank(): BankQuestion[] {
  try {
    const raw = localStorage.getItem(BANK_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function saveBank(bank: BankQuestion[]) {
  try { localStorage.setItem(BANK_KEY, JSON.stringify(bank)); } catch { /* ignore */ }
}

export function loadGroups(): BankGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
export function saveGroups(groups: BankGroup[]) {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(groups)); } catch { /* ignore */ }
}

/** Total questions across groups + legacy flat bank. */
export function totalQuestions(): number {
  return loadGroups().reduce((n, g) => n + g.questions.length, 0) + loadBank().length;
}

function uid(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'q' + Date.now() + Math.random().toString(36).slice(2, 8);
}

/** Validate a raw item and convert to a BankQuestion, or return null. */
export function normalizeItem(raw: any, category = 'Imported'): BankQuestion | null {
  if (!raw || typeof raw.question !== 'string' || !Array.isArray(raw.options) || raw.options.length < 2) return null;
  const answerRaw = typeof raw.answer === 'number' ? raw.answer : Number(raw.answer);
  if (isNaN(answerRaw) || answerRaw < 0 || answerRaw >= raw.options.length) return null;
  return {
    id: raw.id || uid(),
    question: raw.question,
    options: raw.options.map((o: any) => String(o)),
    answer: answerRaw,
    explanation: typeof raw.explanation === 'string' ? raw.explanation : '',
    category: typeof raw.category === 'string' && raw.category ? raw.category : category,
    tags: Array.isArray(raw.tags) ? raw.tags.map((t: any) => String(t)) : [],
    addedAt: typeof raw.addedAt === 'number' ? raw.addedAt : Date.now(),
  };
}

/** Parse a JSON string into bank items (flat). */
export function parseBankJson(text: string, category = 'Imported'): { ok: boolean; items: BankQuestion[]; error?: string } {
  try {
    const parsed = JSON.parse(text);
    let arr: any[] = [];
    if (Array.isArray(parsed)) {
      arr = parsed;
    } else if (parsed && Array.isArray(parsed.questions)) {
      arr = parsed.questions;
    } else {
      return { ok: false, items: [], error: 'JSON must be an array of questions, or an object with a "questions" array.' };
    }
    const items: BankQuestion[] = [];
    for (const it of arr) {
      const n = normalizeItem(it, category);
      if (n) items.push(n);
    }
    if (!items.length) {
      return { ok: false, items: [], error: 'No valid questions found. Each needs: question (string), options (array of ≥2), answer (0-based index).' };
    }
    return { ok: true, items };
  } catch (e: any) {
    return { ok: false, items: [], error: 'Invalid JSON: ' + (e?.message || 'parse error') };
  }
}

/**
 * Import questions as a labeled, dated GROUP. Returns the created group.
 * Groups are the organized unit — label + auto date shown, click to open.
 */
export function createGroup(label: string, questions: BankQuestion[]): BankGroup {
  const group: BankGroup = {
    id: uid(),
    label: label.trim() || `Imported ${new Date().toLocaleDateString()}`,
    createdAt: Date.now(),
    questions,
  };
  const groups = loadGroups();
  groups.push(group);
  saveGroups(groups);
  return group;
}

/** Append questions into an existing group (keeps label + date). */
export function addToGroup(groupId: string, questions: BankQuestion[]): BankGroup | null {
  const groups = loadGroups();
  const g = groups.find((x) => x.id === groupId);
  if (!g) return null;
  g.questions.push(...questions);
  saveGroups(groups);
  return g;
}

export function deleteGroup(groupId: string): void {
  saveGroups(loadGroups().filter((g) => g.id !== groupId));
}

export function renameGroup(groupId: string, label: string): void {
  const groups = loadGroups();
  const g = groups.find((x) => x.id === groupId);
  if (g) {
    g.label = label.trim() || g.label;
    saveGroups(groups);
  }
}
