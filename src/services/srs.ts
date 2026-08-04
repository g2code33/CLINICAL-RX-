import type { RevisionItem } from '../types';

// ---- Spaced repetition (Leitner box system) ----
// box 0 = new (due immediately)
// box 1 = 2 days, box 2 = 4 days, box 3 = 8 days, box 4 = 16 days, box 5 = 30 days (mastered)
const INTERVALS_MS = [0, 2, 4, 8, 16, 30].map((d) => d * 24 * 60 * 60 * 1000);
const MAX_BOX = 5;

export function isDue(item: RevisionItem, now = Date.now()): boolean {
  if (!item.nextReview) return item.due !== false; // legacy items are due
  return item.nextReview <= now;
}

export function nextInterval(box: number): number {
  const b = Math.min(Math.max(box, 0), MAX_BOX);
  return INTERVALS_MS[b] ?? 2 * 24 * 60 * 60 * 1000;
}

/** Mark as reviewed: advance one box and schedule the next review. */
export function reviewPass(item: RevisionItem, now = Date.now()): RevisionItem {
  const box = Math.min((item.box ?? 0) + 1, MAX_BOX);
  return {
    ...item,
    box,
    due: false,
    reviewedAt: now,
    nextReview: now + nextInterval(box),
    passCount: (item.passCount ?? 0) + 1,
    failCount: item.failCount ?? 0,
  };
}

/** Mark as failed: reset to box 1 with a short interval (10 minutes), so it
 *  comes back quickly but not instantly. */
export function reviewFail(item: RevisionItem, now = Date.now()): RevisionItem {
  return {
    ...item,
    box: 1,
    due: false,
    reviewedAt: now,
    nextReview: now + 10 * 60 * 1000,
    failCount: (item.failCount ?? 0) + 1,
    passCount: item.passCount ?? 0,
  };
}

export function boxLabel(box: number): string {
  if (box >= 5) return 'Mastered';
  if (box <= 0) return 'New';
  return `Box ${box}`;
}

/** Human-friendly "due in" string for an item. */
export function dueInText(item: RevisionItem, now = Date.now()): string {
  if (!item.nextReview) return 'Due now';
  const diff = item.nextReview - now;
  if (diff <= 0) return 'Due now';
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(diff / 3600000);
  if (hours < 24) return `in ${hours}h`;
  const days = Math.round(diff / 86400000);
  return `in ${days}d`;
}

/** Count of items due now. */
export function countDue(items: RevisionItem[], now = Date.now()): number {
  return items.filter((i) => isDue(i, now)).length;
}

export const REVISION_BOX_HELP = 'Box 1 (2 days) → Box 2 (4d) → Box 3 (8d) → Box 4 (16d) → Box 5 (30d = mastered). Fail resets to Box 1, due again in 10 minutes.';
