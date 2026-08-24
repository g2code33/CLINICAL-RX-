/**
 * CLINICAL Rx — PHASE 4 acceptance tests (Bundler Engine).
 *
 *   TEST 1  manual bundle persists       TEST 7  merge creates a new bundle
 *   TEST 2  automatic daily generated    TEST 8  merge de-duplicates
 *   TEST 3  auto + manual coexist        TEST 9  deleting an original keeps merge
 *   TEST 4  SNAPSHOT IMMUTABILITY        TEST 10 works offline
 *   TEST 5  week bundle scopes correctly TEST 11 catch-up, no duplicates
 *   TEST 6  custom bundle filters        TEST 12 promotion preserves level
 *
 * Runs entirely offline.
 */
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
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    value: { randomUUID: () => 'id-' + Math.random().toString(36).slice(2) },
    configurable: true,
    writable: true,
  });
}
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
};

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const engine = await server.ssrLoadModule('/src/services/bundleEngine.ts');
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const st = () => useData.getState();

  await st().init();

  // --- Setup: Level 200, activity on two past days ---
  const p = defaults.newProfile('Ama');
  p.programme = 'Pharmacy';
  p.level = '200';
  const boot = await academic.bootstrapJourney({ level: '200', academicYear: '2026/2027', semesterName: 'Semester 1' });
  p.currentStageId = boot.stage.id;
  p.currentPeriodId = boot.period?.id;
  await st().saveProfile(p);
  const level200 = boot.stage;

  const D1 = '2026-11-02'; // Monday
  const D2 = '2026-11-03';

  const note = { ...defaults.newLesson('Statins inhibit HMG-CoA reductase.', D1), tags: ['cardiology'] };
  await st().save('lesson', note);
  const med = defaults.newMedicine('Atorvastatin');
  med.lastSeen = D1;
  await st().save('medicine', med);
  const round = await ward.startRound('Medical Ward', D1, 'Pharmacotherapy');
  await ward.addEntry(round.id, 'condition', 'Hyperlipidaemia', 'Discussed targets.');
  const note2 = defaults.newLesson('ACE inhibitors can cause hyperkalemia.', D2);
  await st().save('lesson', note2);

  console.log('\nTEST 1 — manual day bundle persists');
  const b1 = await engine.createDayBundle(D1, 'My Day One');
  check('bundle created', !!b1.id && b1.status === 'completed');
  check('title honoured', b1.title === 'My Day One');
  check('snapshot captured records', (b1.snapshot?.length ?? 0) > 0, String(b1.snapshot?.length));
  check('creation method is manual', b1.creationMethod === 'manual');
  check('stamped Level 200', b1.academic?.stageId === level200.id);

  console.log('\nTEST 2 — automatic daily bundles for completed days');
  const auto1 = await engine.runAutomaticBundling(new Date('2026-11-10T09:00:00'));
  check('automatic bundles generated', auto1.daily >= 2, JSON.stringify(auto1));
  const autos = st().bundles.filter((b) => b.creationMethod === 'automatic' && b.type === 'auto-daily');
  const autoDates = autos.map((b) => b.periodStart).sort();
  // Three active dates: D1, D2, and the ward round's own record date.
  check('one auto-daily per active day', new Set(autoDates).size === autos.length, autoDates.join(','));
  check('covers both seeded days', autoDates.includes(D1) && autoDates.includes(D2));
  check('auto bundles carry a deterministic key', autos.every((b) => !!b.autoKey));
  check('auto weekly generated too', st().bundles.some((b) => b.type === 'auto-weekly'));

  console.log('\nTEST 11 — re-running never duplicates');
  const before = st().bundles.length;
  const auto2 = await engine.runAutomaticBundling(new Date('2026-11-10T09:00:00'));
  check('second run creates nothing new', st().bundles.length === before, `${before} -> ${st().bundles.length}`);
  check('and reports them as skipped', auto2.daily === 0 && auto2.skipped > 0);
  // Simulate "app closed for days": a later run still finds nothing missing.
  const auto3 = await engine.runAutomaticBundling(new Date('2026-11-20T09:00:00'));
  check('catch-up run after days away adds no duplicates', auto3.daily === 0);

  console.log('\nTEST 3 — automatic and manual bundles coexist independently');
  const autoD1 = st().bundles.find((b) => b.autoKey === engine.dailyKey(D1));
  check('auto bundle for D1 exists', !!autoD1);
  check('manual bundle for D1 still exists', !!st().bundles.find((b) => b.id === b1.id));
  check('they are different records', autoD1.id !== b1.id);
  check('manual one was not overwritten', st().bundles.find((b) => b.id === b1.id).title === 'My Day One');

  console.log('\nTEST 4 — SNAPSHOT IMMUTABILITY (the core rule)');
  const frozenTitle = b1.snapshot.find((i) => i.sourceType === 'lesson')?.title;
  check('snapshot contains the note', !!frozenTitle && frozenTitle.includes('Statins'));
  // Edit the source record AFTER bundling.
  await st().save('lesson', { ...st().lessons.find((l) => l.id === note.id), title: 'COMPLETELY REWRITTEN' });
  const reread = st().bundles.find((b) => b.id === b1.id);
  check('live record changed', st().lessons.find((l) => l.id === note.id).title === 'COMPLETELY REWRITTEN');
  check('bundle snapshot did NOT change', reread.snapshot.find((i) => i.sourceId === note.id).title === frozenTitle);
  check('bundle summary did NOT change', reread.summary === b1.summary);
  // Delete the source record entirely.
  await st().remove('lesson', note.id);
  const afterDelete = st().bundles.find((b) => b.id === b1.id);
  check('bundle survives source deletion', afterDelete.snapshot.some((i) => i.sourceId === note.id));
  check('and knows the original is gone', engine.sourceExists(afterDelete.snapshot.find((i) => i.sourceId === note.id)) === false);
  // Restore for later tests.
  await st().save('lesson', note);

  console.log('\nTEST 5 — week bundle scopes to its period');
  const outside = defaults.newLesson('Unrelated later note.', '2026-12-25');
  await st().save('lesson', outside);
  const wk = await engine.createWeekBundle(D1, 'My Week');
  check('week bundle created', !!wk.id);
  check('includes in-period records', wk.snapshot.some((i) => i.sourceId === note2.id));
  check('EXCLUDES out-of-period records', !wk.snapshot.some((i) => i.sourceId === outside.id));
  check('period is Monday→Sunday', wk.periodStart === '2026-11-02' && wk.periodEnd === '2026-11-08', `${wk.periodStart}..${wk.periodEnd}`);

  console.log('\nTEST 6 — custom bundle honours filters');
  const preview = engine.previewBundle({ from: D1, to: D2, modules: ['lesson'] });
  check('preview counts only the chosen module', preview.records.every((r) => r.module === 'lesson'));
  check('preview does not create anything', !st().bundles.some((b) => b.title === 'Preview only'));
  const custom = await engine.createCustomBundle(
    { from: D1, to: D2, modules: ['lesson'], tag: 'cardiology' },
    'Cardiology Revision',
    'Focus for this week.'
  );
  check('custom bundle created', custom.type === 'manual-custom');
  check('tag filter applied', custom.snapshot.every((i) => (i.tags ?? []).includes('cardiology')));
  check('notes stored on the bundle', custom.notes === 'Focus for this week.');
  check('records which modules were selected', Array.isArray(custom.includedModules) && custom.includedModules.includes('lesson'));

  const scoped = await engine.createCustomBundle({ from: D1, to: D2, stageId: level200.id }, 'Level 200 only');
  check('academic scope applied', scoped.snapshot.length > 0);

  console.log('\nTEST 7 & 8 — merge creates an independent, de-duplicated bundle');
  const dayA = await engine.createDayBundle(D1, 'A');
  const dayB = await engine.createDayBundle(D1, 'B'); // same day => same records
  const mp = engine.previewMerge([dayA.id, dayB.id]);
  check('merge preview reports duplicates', mp.duplicates > 0, JSON.stringify({ t: mp.total, u: mp.uniqueRecords, d: mp.duplicates }));
  check('unique < total when overlapping', mp.uniqueRecords < mp.total);

  const merged = await engine.mergeBundles([dayA.id, dayB.id], 'Merged Review');
  check('merged bundle created', merged.type === 'merged');
  check('merged snapshot is de-duplicated', merged.snapshot.length === mp.uniqueRecords);
  check('records its source bundles', merged.sourceBundleIds.includes(dayA.id) && merged.sourceBundleIds.includes(dayB.id));
  check('reports duplicates removed', merged.stats['Duplicates removed'] > 0);
  check('originals untouched — A', st().bundles.find((b) => b.id === dayA.id).title === 'A');
  check('originals untouched — B', st().bundles.find((b) => b.id === dayB.id).title === 'B');
  check('originals still exist', st().bundles.filter((b) => [dayA.id, dayB.id].includes(b.id)).length === 2);

  console.log('\nTEST 9 — deleting an original leaves the merged bundle intact');
  const mergedSnapshotLen = merged.snapshot.length;
  await engine.deleteBundle(dayA.id);
  check('original bundle deleted', !st().bundles.some((b) => b.id === dayA.id));
  const mergedAfter = st().bundles.find((b) => b.id === merged.id);
  check('merged bundle still exists', !!mergedAfter);
  check('merged snapshot unchanged', mergedAfter.snapshot.length === mergedSnapshotLen);
  check('source records untouched by bundle deletion', !!st().medicines.find((m) => m.id === med.id));

  console.log('\nTEST 10 — offline');
  check('still offline', dom.window.navigator.onLine === false);
  const offlineBundle = await engine.createDayBundle(D2, 'Offline bundle');
  check('bundle creation works offline', !!offlineBundle.id);
  check('search works offline', engine.searchBundles({ query: 'statins' }).length > 0);
  check('export works offline', engine.bundleToMarkdownSnapshot(offlineBundle).includes('Offline bundle'));
  check('json export works offline', JSON.parse(engine.bundleToJsonSnapshot(offlineBundle)).title === 'Offline bundle');

  console.log('\nVAULT — search, filter, favourite, notes');
  check('filter by kind: automatic', engine.searchBundles({ kind: 'automatic' }).every((b) => b.creationMethod === 'automatic'));
  check('filter by kind: merged', engine.searchBundles({ kind: 'merged' }).every((b) => b.type === 'merged'));
  check('search matches snapshot contents', engine.searchBundles({ query: 'atorvastatin' }).length > 0);
  await engine.toggleBundleFavorite(custom.id);
  check('favourite toggles', st().bundles.find((b) => b.id === custom.id).favorite === true);
  check('favourite filter works', engine.searchBundles({ favorite: true }).length === 1);
  await engine.renameBundle(custom.id, 'Renamed Bundle');
  check('rename works', st().bundles.find((b) => b.id === custom.id).title === 'Renamed Bundle');
  await engine.setBundleNotes(custom.id, 'Updated note');
  check('notes update', st().bundles.find((b) => b.id === custom.id).notes === 'Updated note');
  check('source route resolves', engine.sourceRoute({ sourceType: 'medicine', sourceId: med.id }) === '/medicines');

  console.log('\nTEST 12 — promotion preserves bundle academic context');
  await academic.promote();
  check('now Level 300', academic.currentStage().level === '300');
  check('old bundle STILL Level 200', st().bundles.find((b) => b.id === b1.id).academic.stageId === level200.id);
  check('merged bundle STILL Level 200', st().bundles.find((b) => b.id === merged.id).academic.stageId === level200.id);

  console.log('\nRESTART — persistence of snapshots');
  const bundleCount = st().bundles.length;
  useData.setState({ ready: false, bundles: [], lessons: [], medicines: [] });
  await st().init();
  check('all bundles survived restart', st().bundles.length === bundleCount, `${bundleCount} -> ${st().bundles.length}`);
  const revived = st().bundles.find((b) => b.id === b1.id);
  check('snapshot survived restart', revived.snapshot.length > 0);
  check('frozen content survived restart', revived.snapshot.find((i) => i.sourceId === note.id).title === frozenTitle);
  check('auto keys survived (no duplicate risk)', st().bundles.filter((b) => b.autoKey === engine.dailyKey(D1)).length === 1);
  const afterRestart = await engine.runAutomaticBundling(new Date('2026-11-20T09:00:00'));
  check('post-restart run creates no duplicates', afterRestart.daily === 0 && afterRestart.weekly === 0);

  console.log('\nSTATUS + AI READINESS');
  check('bundles report completed status', revived.status === 'completed');
  check('generation timestamp recorded', typeof revived.generatedAt === 'number');
  check('AI enhancement correctly unavailable (Phase 5)', engine.aiEnhancementAvailable() === false);
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 4 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 4 ACCEPTANCE TESTS PASSED ✔');
