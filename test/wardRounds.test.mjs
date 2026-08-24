/**
 * Ward Rounds — offline behaviour test.
 *
 * Runs the REAL services (store + wardRounds + bundler) against a jsdom
 * environment with localStorage, exactly like the web build. Verifies the
 * offline-first contract from the spec:
 *   - start a round, add every entry type, edit, delete
 *   - data survives an app "restart" (fresh store from the same storage)
 *   - finishing works with no network and no AI configured
 *   - captures flow into the clinical compartments
 *   - bundles reference rounds without mutating them
 *   - search finds medicines/conditions/investigations/questions/learning
 *
 * Usage: node test/wardRounds.test.mjs   (after `npm run build:web` is not
 * required — this imports the TypeScript sources through Vite's SSR pipeline).
 */
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  pretendToBeVisual: true,
});

// Minimal browser globals the app touches at import time.
globalThis.window = dom.window;
globalThis.document = dom.window.document;
// Node 22 defines `navigator` as a getter-only global, so it must be replaced
// via defineProperty rather than plain assignment.
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) },
    configurable: true,
    writable: true,
  });
}
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.CustomEvent = dom.window.CustomEvent;

// Force offline for the whole run: the module must work with zero network.
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'error',
});

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const bundler = await server.ssrLoadModule('/src/services/bundler.ts');
  const wardAi = await server.ssrLoadModule('/src/services/wardAi.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');

  await useData.getState().init();
  await useData.getState().saveProfile(defaults.newProfile('Tester'));
  await useData.getState().saveSettings(defaults.newSettings());

  console.log('\nOFFLINE — capture flow');

  const round = await ward.startRound('Medical Ward', defaults.todayIso(), 'Pharmacotherapy');
  check('start ward round', !!round?.id && round.status === 'active');

  // Every entry type from the spec.
  const made = {};
  made.learning = await ward.addEntry(round.id, 'learning', '', 'Amlodipine can cause ankle edema.');
  made.medicine = await ward.addEntry(round.id, 'medicine', 'Amlodipine', 'Calcium channel blocker; watch for ankle edema.');
  made.condition = await ward.addEntry(round.id, 'condition', 'Hypertension', 'Managed with amlodipine and losartan.');
  made.investigation = await ward.addEntry(round.id, 'investigation', 'FBC', 'Observed FBC being reviewed.');
  made.question = await ward.addEntry(round.id, 'question', '', 'Why was losartan preferred?');
  made.note = await ward.addEntry(round.id, 'note', '', 'Ward pharmacist reviews charts at 9am.');
  check('add all six entry types', Object.values(made).every(Boolean));

  const counts = ward.countsFor(round.id);
  check('counts are correct', counts.total === 6 && counts.medicine === 1 && counts.question === 1, JSON.stringify(counts));

  // Edit
  await ward.updateEntry(made.medicine, { content: 'CCB — dihydropyridine. Ankle edema is dose-related.' });
  const edited = ward.entriesFor(round.id).find((e) => e.id === made.medicine.id);
  check('edit an entry', edited.content.includes('dose-related'));

  // Delete
  await ward.deleteEntry(made.note.id);
  check('delete an entry', ward.countsFor(round.id).total === 5);

  // AI must NOT be required, and must not be reachable while offline.
  check('AI correctly unavailable offline', wardAi.canRunAi() === false);

  console.log('\nOFFLINE — finish + compartment sync');

  const finished = await ward.finishRound(round.id);
  check('finish round without AI/network', finished?.status === 'completed' && !!finished.completedAt);

  const st = () => useData.getState();
  check('medicine reached Medicines', st().medicines.some((m) => m.name === 'Amlodipine'));
  check('condition reached Diseases', st().diseases.some((d) => d.name === 'Hypertension'));
  check('investigation reached Investigations', st().investigations.some((i) => i.name === 'FBC'));
  check('question reached Questions vault', st().questions.some((q) => q.text.includes('losartan')));
  check('learning point reached Lessons', st().lessons.some((l) => l.title.includes('ankle edema')));

  // Queued AI analysis: the round must never be lost because AI is offline.
  const queued = await wardAi.queueAnalysis(round.id);
  check('AI analysis queued as pending', queued.status === 'pending');
  const drained = await wardAi.processPendingWardAnalyses();
  check('queue is a no-op while offline', drained.processed === 0);
  check('analysis still pending after drain', ward.analysisFor(round.id).status === 'pending');

  console.log('\nOFFLINE — search');

  check('search finds a medicine', ward.searchWardRounds('amlodipine').length === 1);
  check('search finds a condition', ward.searchWardRounds('hypertension').length === 1);
  check('search finds an investigation', ward.searchWardRounds('FBC').length === 1);
  check('search finds a question', ward.searchWardRounds('losartan').length === 1);
  check('search finds a learning point', ward.searchWardRounds('edema').length === 1);
  check('search misses unrelated terms', ward.searchWardRounds('zzzznothing').length === 0);
  check('search matches ward name', ward.searchWardRounds('medical ward').length === 1);

  console.log('\nOFFLINE — bundles');

  const entriesBefore = JSON.stringify(ward.entriesFor(round.id));
  const b = await bundler.bundleFromWardRounds([round.id], 'WARD ROUNDS — test');
  check('bundle created from ward round', !!b?.id);
  check('bundle references the round by id', b.sourceIds.includes(round.id));
  check('bundle carries ward stats', b.stats['Ward rounds'] === 1 && b.stats['Ward captures'] === 5);
  check('bundle body holds the round digest', Array.isArray(b.body.wardRoundDetail) && b.body.wardRoundDetail.length === 1);
  check('original round untouched by bundling', JSON.stringify(ward.entriesFor(round.id)) === entriesBefore);
  check('original round still exists', !!ward.getRound(round.id));

  const sel = ward.entriesFor(round.id).slice(0, 2).map((e) => e.id);
  const b2 = await bundler.bundleFromWardEntries(round.id, sel, 'Selected captures');
  check('bundle from selected entries', b2?.stats['Selected captures'] === 2);
  check('selection bundle is independent', b2.id !== b.id && !!ward.getRound(round.id));

  // Auto daily bundle must pick the ward round up even with no clinical day.
  const auto = await server.ssrLoadModule('/src/services/autoBundle.ts');
  // Finishing a round also fires auto-bundling in the background, so poll
  // briefly rather than assuming our explicit call is the one that wins.
  let daily = null;
  for (let i = 0; i < 40 && !daily; i++) {
    await auto.processAiWhenOnline();
    daily = st().bundles.find((x) => x.type === 'auto-daily');
    if (!daily) await new Promise((r) => setTimeout(r, 50));
  }
  check('auto-daily bundle includes the ward round', !!daily && daily.sourceIds.includes(round.id));

  console.log('\nRESTART — persistence');

  // Simulate closing and reopening the app: brand-new store instance reading
  // the same localStorage the previous session wrote to.
  const roundId = round.id;
  useData.setState({ ready: false, wardRounds: [], wardEntries: [], wardAnalyses: [] });
  await useData.getState().init();
  const reloaded = ward.getRound(roundId);
  check('round survived restart', !!reloaded && reloaded.ward === 'Medical Ward');
  check('entries survived restart', ward.countsFor(roundId).total === 5);
  check('completed status survived restart', reloaded.status === 'completed');
  check('pending AI analysis survived restart', ward.analysisFor(roundId)?.status === 'pending');
  check('bundle survived restart', useData.getState().bundles.some((x) => x.id === b.id));

  console.log('\nSAFETY — no patient fields');
  const roundKeys = Object.keys(reloaded).join(' ').toLowerCase();
  const entryKeys = Object.keys(ward.entriesFor(roundId)[0]).join(' ').toLowerCase();
  const banned = ['patient', 'hospitalnumber', 'mrn', 'phone', 'address', 'dob', 'nhs'];
  check('no patient-identifying fields in the data model', !banned.some((k) => roundKeys.includes(k) || entryKeys.includes(k)));
} finally {
  await server.close();
}

console.log('');
if (failures) {
  console.error(`WARD ROUNDS TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL WARD ROUNDS TESTS PASSED ✔');
