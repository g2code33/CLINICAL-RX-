import { useData } from '../stores/data';
import type { QuizQuestion } from './aiTools';

export interface BankQuestion extends QuizQuestion {
  id: string;
  category: string;
  tags: string[];
  addedAt: number;
}

const BANK_KEY = 'clinical-rx:question-bank';

/** Load the saved question bank from localStorage. */
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
  try {
    localStorage.setItem(BANK_KEY, JSON.stringify(bank));
  } catch {
    /* ignore */
  }
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

/** Parse a JSON string (either a single quiz object or an array of questions) into bank items. */
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
