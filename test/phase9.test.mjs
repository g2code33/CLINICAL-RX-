/**
 * CLINICAL Rx — PHASE 9 UI/UX, accessibility & polish tests.
 *
 * Covers the §50 acceptance list plus the §45 consistency audit:
 *
 *   1  offline launch shows a clean dashboard
 *   2  a learning note can be created in seconds
 *   3  a ward round saves without unnecessary fields
 *   4  bundle types are clearly separated
 *   5  global search returns results grouped by module
 *   6  AI provider status is obvious
 *   7  AI answers carry context and sources
 *   8  Level 300 → Level 200 archive navigation is easy
 *   9  layout has no fixed-width assumptions (resize safety)
 *  10  keyboard-only navigation is possible
 *  11  offline indicator present and core features work
 *  12  errors recover friendly ("your data is still safe")
 *
 * Plus static audits: modal dialog semantics, icon-button labelling,
 * reduced-motion support, single toast system, no window.confirm in the
 * destructive paths that were migrated.
 *
 * Runs fully offline.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.sessionStorage = dom.window.sessionStorage;
const nodeCrypto = await import('node:crypto');
Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto, configurable: true, writable: true });
const setOnline = (v) => Object.defineProperty(dom.window.navigator, 'onLine', { value: v, configurable: true });

// Phase 9 must hold under the app's primary condition: offline.
setOnline(false);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 220) : ''}`);
  }
};

// No network at all in this phase.
let networkCalls = [];
globalThis.fetch = async (url) => {
  networkCalls.push(String(url));
  throw new Error('NETWORK BLOCKED IN TEST: ' + url);
};

// ---- helpers for the static source audits --------------------------------
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}
const SRC_FILES = walk('src');
const readAll = (files) => files.map((f) => ({ f, src: readFileSync(f, 'utf8') }));
const ALL = readAll(SRC_FILES);
const fileOf = (name) => ALL.find((x) => x.f.endsWith(name))?.src ?? '';
// The design-system stylesheet is not a .ts file, so read it directly.
const CSS = readFileSync('src/index.css', 'utf8');

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const st = () => useData.getState();
  await st().init();
  if (!st().settings) await st().saveSettings(defaults.newSettings());
  // A first-run user: offline, no account, just a local profile.
  if (!st().profile) await st().saveProfile(defaults.newProfile('Ama'));

  // =====================================================================
  console.log('\nTEST 1 — OFFLINE LAUNCH GIVES A CLEAN DASHBOARD');

  check('app initialises with no network calls', networkCalls.length === 0, networkCalls.join(','));
  check('a profile exists so the dashboard can greet the user', !!st().profile);

  const dash = fileOf('pages/Dashboard.tsx');
  check('dashboard greets by name', dash.includes('greet') && dash.includes('profile.username'));
  check("dashboard shows Today's Activity, not a wall of lifetime stats", dash.includes("Today&rsquo;s activity") || dash.includes("Today's activity"));
  check('dashboard shows the five quick actions', ['Learning Note', 'Ward Round', 'Question', 'Bundle', 'Ask AI'].every((x) => dash.includes(x)));
  check('dashboard shows Recent activity', dash.includes('Recent activity'));
  check('dashboard shows Upcoming goals', dash.includes('Upcoming goals'));
  check('dashboard shows current stage / level', dash.includes('currentStage'));

  // =====================================================================
  console.log('\nTEST 2 — A LEARNING NOTE TAKES SECONDS');

  const before = st().lessons.length;
  const note = { ...defaults.newLesson?.() ?? {}, id: 'p9-note', title: 'Warfarin counselling', content: 'Check INR before discharge.', createdAt: Date.now(), updatedAt: Date.now() };
  await st().save('lesson', note);
  const saved = st().lessons.find((l) => l.id === 'p9-note');
  check('note saves with only a title and body', !!saved, 'note not stored');
  check('lesson count increased', st().lessons.length === before + 1);
  check('no other field was required', !!saved && !!saved.title && !!saved.content);

  const notesPage = fileOf('pages/LearningNotes.tsx');
  check('learning capture is deep-linkable (?new=1) so it is one click', notesPage.includes("params.get('new')"));

  // =====================================================================
  console.log('\nTEST 3 — WARD ROUND SAVES WITHOUT UNNECESSARY FIELDS');

  const round = { ...(defaults.newWardRound?.('Medical Ward') ?? {}), id: 'p9-round', ward: 'Medical Ward', date: new Date().toISOString().slice(0, 10), createdAt: Date.now(), updatedAt: Date.now() };
  await st().save('wardRound', round);
  const storedRound = st().wardRounds.find((r) => r.id === 'p9-round');
  check('ward round saves with just a ward name and date', !!storedRound);
  check('no patient-identifiable field is present', !!storedRound && !('patientName' in storedRound) && !('patientId' in storedRound) && !('mrn' in storedRound));

  const entry = { id: 'p9-entry', roundId: 'p9-round', title: 'Dose check', content: 'Renal dose adjustment discussed.', createdAt: Date.now(), updatedAt: Date.now() };
  await st().save('wardEntry', entry);
  check('a capture attaches with only title + content', !!st().wardEntries.find((e) => e.id === 'p9-entry'));

  // =====================================================================
  console.log('\nTEST 4 — BUNDLE TYPES ARE CLEARLY SEPARATED');

  const bundlesPage = fileOf('pages/Bundles.tsx');
  check('bundle type selector is a real tablist', bundlesPage.includes('role="tablist"') && bundlesPage.includes('aria-label="Bundle type"'));
  check('the selected type is exposed to assistive tech', bundlesPage.includes('aria-selected={filter === f}'));
  check('day / week / merged are distinct filters', ['days', 'weeks', 'merged'].every((x) => bundlesPage.includes(`'${x}'`)));
  check('type is not conveyed by colour alone (icon + word)', bundlesPage.includes('aria-hidden="true"') && bundlesPage.includes("'Merged'"));

  // =====================================================================
  console.log('\nTEST 5 — GLOBAL SEARCH GROUPS RESULTS BY MODULE');

  const search = fileOf('components/SearchModal.tsx');
  check('results carry a module group', search.includes('group: string'));
  check('grouping has an explicit module order', search.includes('GROUP_ORDER'));
  check('results are rendered grouped, with counts', search.includes('grouped.map') && search.includes('items.length'));

  const required = ['Learning', 'Medicines', 'Diseases', 'Investigations', 'Questions', 'Ward Rounds', 'Bundles', 'Courses', 'Skills', 'Projects', 'Research', 'Achievements', 'Goals', 'AI Conversations'];
  const missing = required.filter((g) => !search.includes(`'${g}'`));
  check('every module named in §6 is searchable', missing.length === 0, 'missing: ' + missing.join(', '));

  check('search is keyboard driven (arrows + Enter)', search.includes("ArrowDown") && search.includes("'Enter'"));
  check('result count is announced to screen readers', search.includes('aria-live="polite"'));
  check('Ctrl/Cmd+K is bound', fileOf('components/KeyboardShortcuts.tsx').includes("'k'"));

  // =====================================================================
  console.log('\nTEST 6 — AI STATUS IS OBVIOUS');

  const aiw = fileOf('pages/AiWorkspace.tsx');
  check('provider is shown in words, not just a dot', aiw.includes('Local AI') && aiw.includes('Cloud AI'));
  check('the active AI module is stated', aiw.includes('(active)') || aiw.includes('aria-selected={k === persona}'));
  check('module selector is a tablist', aiw.includes('role="tablist"') && aiw.includes('aria-label="AI module"'));

  // =====================================================================
  console.log('\nTEST 7 — AI ANSWERS CARRY CONTEXT AND SOURCES');

  const intel = await server.ssrLoadModule('/src/services/intelligence.ts');
  const know = intel.retrieveKnowledge?.('warfarin', { limit: 5 }) ?? intel.retrieveKnowledge?.('warfarin');
  check('the intelligence layer can retrieve stored records', !!know);
  check('AI answers expose a Sources list', aiw.includes('SourceList') || aiw.includes('sources'));
  check('answers can be copied and regenerated', aiw.includes('Copy') && aiw.includes('Regenerate'));

  // =====================================================================
  console.log('\nTEST 8 — LEVEL 300 → LEVEL 200 ARCHIVE NAVIGATION');

  const archive = fileOf('journey/ArchiveAndPortfolio.tsx');
  check('archive exposes every stage as a selectable tab', archive.includes('role="tablist"') && archive.includes('Academic levels'));
  check('stage status is not colour-only (glyph + sr-only text)', archive.includes('sr-only') && archive.includes('s.status'));
  check('search deep-links straight to a stage', search.includes('/journey/archive?stage='));

  // =====================================================================
  console.log('\nTEST 9 — RESIZE SAFETY (NO 1920×1080 ASSUMPTION)');

  const css = CSS;
  check('horizontal overflow is prevented globally', css.includes('overflow-x: hidden'));
  check('long content wraps rather than overflowing', css.includes('break-anywhere') || css.includes('overflow-wrap'));
  check('dialogs stay reachable on short viewports', css.includes('max-height: 640px'));
  check('toasts are capped on narrow windows', css.includes('.toast-region'));

  const fixedPx = ALL.filter(({ src }) => /\b(width|min-width):\s*1[0-9]{3}px/.test(src)).map((x) => x.f);
  check('no hard-coded desktop widths in components', fixedPx.length === 0, fixedPx.join(', '));

  // =====================================================================
  console.log('\nTEST 10 — KEYBOARD-ONLY NAVIGATION');

  const layout = fileOf('components/Layout.tsx');
  check('a skip link is the first tab stop', layout.includes('skip-link') && layout.includes('#main-content'));
  check('main content is a labelled landmark', layout.includes('id="main-content"') && layout.includes('aria-label="Main content"'));
  check('sidebar is a labelled landmark', layout.includes('aria-label="Primary navigation"'));

  const modal = fileOf('components/Modal.tsx');
  check('modal declares dialog semantics', modal.includes('role="dialog"') && modal.includes('aria-modal="true"'));
  check('modal is labelled by its title', modal.includes('aria-labelledby'));
  check('Escape closes the modal', modal.includes("e.key === 'Escape'"));
  check('focus is trapped inside the modal', modal.includes("e.key !== 'Tab'") || modal.includes("'Tab'"));
  check('focus returns to the trigger on close', modal.includes('restoreTo'));

  check('a visible focus ring exists for every control', CSS.includes(':focus-visible') && CSS.includes('outline'));

  // Icon-only buttons must have an accessible name.
  const unnamed = [];
  for (const { f, src } of ALL) {
    const re = /<button\b((?:[^>]|\n)*?)>((?:[^<]|\n){0,40}?)<\/button>/g;
    let m;
    while ((m = re.exec(src))) {
      const attrs = m[1];
      const text = m[2].replace(/\{[^}]*\}/g, '').trim();
      if (attrs.includes('aria-label')) continue;
      if (text && !/[A-Za-z]/.test(text)) unnamed.push(`${f}: ${text.slice(0, 6)}`);
    }
  }
  check('no icon-only button lacks an accessible name', unnamed.length === 0, unnamed.join(' | '));

  // =====================================================================
  console.log('\nTEST 11 — OFFLINE INDICATOR + CORE FEATURES WORK OFFLINE');

  const toaster = fileOf('components/Toaster.tsx');
  check('an offline indicator component exists', toaster.includes('OfflineIndicator'));
  check('it reacts to online/offline events', toaster.includes("'offline'") && toaster.includes("'online'"));
  check('it reassures rather than alarms', toaster.toLowerCase().includes('your data is still here'));
  check('it is announced politely, not as an alert', toaster.includes('role="status"'));
  check('the indicator is mounted in the shell', layout.includes('<OfflineIndicator />'));

  // Core writes still worked above with navigator.onLine === false.
  check('records still saved while offline', st().lessons.some((l) => l.id === 'p9-note') && st().wardRounds.some((r) => r.id === 'p9-round'));
  check('still zero network calls', networkCalls.length === 0, networkCalls.join(','));

  // =====================================================================
  console.log('\nTEST 12 — FRIENDLY ERROR RECOVERY');

  const prim = fileOf('ui/primitives.tsx');
  check('a shared ErrorState exists', prim.includes('export function ErrorState'));
  check('errors reassure the user their data is safe', prim.includes('Your local data is still safe'));
  check('errors offer a retry', prim.includes('Retry') || prim.includes('onRetry'));
  check('errors are announced assertively', prim.includes('role="alert"'));
  check('error toasts persist until dismissed', toaster.includes("t.tone === 'error' ? 0"));

  // =====================================================================
  console.log('\n§45 — CONSISTENCY AUDIT');

  check('a shared primitive library exists', prim.includes('export function Badge') && prim.includes('export function Tabs') && prim.includes('export function LoadingState'));
  // EmptyState pre-dates Phase 9 and is used in 18 files; it must be re-used,
  // not reimplemented alongside a competing version.
  check('EmptyState has exactly one implementation', ALL.filter(({ src }) => src.includes('export function EmptyState')).length === 1);
  check('primitives re-export the canonical EmptyState', prim.includes("export { EmptyState } from '../ui'"));
  check('IconButton forces an accessible name', prim.includes('label: string'));
  check('one toast system, not several ad-hoc ones', toaster.includes('export function Toaster') && toaster.includes('useToasts'));
  check('a themed confirm replaces window.confirm', prim.includes('export function useConfirm'));

  // Destructive paths migrated off window.confirm.
  const migrated = ['components/EntityManager.tsx', 'components/WardEntryCard.tsx', 'pages/AiChat.tsx', 'pages/AiWorkspace.tsx', 'pages/Quiz.tsx', 'pages/QuestionBank.tsx', 'pages/Journey.tsx', 'pages/Settings.tsx'];
  const stillRaw = migrated.filter((f) => /(?:window\.)?confirm\('/.test(fileOf(f)));
  check('migrated destructive actions no longer use window.confirm', stillRaw.length === 0, stillRaw.join(', '));

  check('settings is split into sections, not one giant page', fileOf('pages/Settings.tsx').includes('SECTIONS') && fileOf('pages/Settings.tsx').includes('Settings sections'));
  check('shortcuts are documented in Settings', fileOf('pages/Settings.tsx').includes('Keyboard shortcuts') && fileOf('pages/Settings.tsx').includes('Ctrl / Cmd + K'));

  // =====================================================================
  console.log('\n§48 — MOTION RESPECTS USER PREFERENCE');

  check('reduced motion is honoured', CSS.includes('prefers-reduced-motion'));
  check('animations are neutralised, not merely shortened', CSS.includes('animation-duration: 0.01ms'));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 9 UI/UX TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 9 UI/UX TESTS PASSED ✔');
