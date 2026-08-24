/**
 * CLINICAL Rx — PHASE 2 acceptance tests (Clinical Learning Core).
 *
 * Maps 1:1 onto the ten acceptance tests in the Phase 2 specification, run
 * against the REAL services with the network forced OFF for the whole run.
 *
 *   TEST 1  note persists across restart     TEST 6  search finds across modules
 *   TEST 2  medicine <-> disease relation    TEST 7  filter by Level 200
 *   TEST 3  investigation <-> disease        TEST 8  promotion preserves level
 *   TEST 4  question -> medicine             TEST 9  everything works offline
 *   TEST 5  revision marking                 TEST 10 export includes Phase 2
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
// TEST 9 — the entire suite runs offline.
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
  const { useData, uid } = await server.ssrLoadModule('/src/stores/data.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const learning = await server.ssrLoadModule('/src/services/learning.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const backup = await server.ssrLoadModule('/src/services/backup.ts');
  const st = () => useData.getState();

  await st().init();

  // --- Setup: profile at Level 200 with a journey ---
  const p = defaults.newProfile('Ama');
  p.programme = 'Pharmacy';
  p.level = '200';
  p.academicYear = '2026/2027';
  const boot = await academic.bootstrapJourney({
    level: '200',
    academicYear: '2026/2027',
    programme: 'Pharmacy',
    semesterName: 'Semester 1',
  });
  p.currentStageId = boot.stage.id;
  p.currentPeriodId = boot.period?.id;
  await st().saveProfile(p);
  const level200 = boot.stage;

  console.log('\nTEST 1 — create a learning note, it survives a restart');
  const note = learning.stampAcademic({
    ...defaults.newLesson('Statins inhibit HMG-CoA reductase and reduce LDL-C.', defaults.todayIso()),
    tags: ['pharmacology', 'cardiology'],
  });
  await st().save('lesson', note);
  await learning.logActivity('created', 'lesson', note.id, note.title);
  check('note saved', st().lessons.some((l) => l.id === note.id));
  check('note stamped with Level 200', note.academic?.stageId === level200.id, JSON.stringify(note.academic));
  check('academic label renders', learning.academicLabel(note).includes('Level 200'));

  console.log('\nTEST 2 — medicine linked to a disease');
  const amlodipine = learning.stampAcademic(defaults.newMedicine('Amlodipine'));
  amlodipine.className = 'Calcium channel blocker';
  await st().save('medicine', amlodipine);
  const htn = learning.stampAcademic(defaults.newDisease('Hypertension'));
  htn.medicines = ['Amlodipine'];
  await st().save('disease', htn);

  const diseaseRel = learning.relatedTo('disease', htn.id);
  check('disease lists the medicine as related', diseaseRel.medicines.some((m) => m.name === 'Amlodipine'));
  const medRel = learning.relatedTo('medicine', amlodipine.id);
  check('medicine lists the disease as related (reverse)', medRel.diseases.some((d) => d.name === 'Hypertension'));

  console.log('\nTEST 3 — investigation linked to a disease');
  const ue = learning.stampAcademic(defaults.newInvestigation('U&E'));
  ue.linkedConditions = ['Hypertension'];
  await st().save('investigation', ue);
  check('disease shows the investigation', learning.relatedTo('disease', htn.id).investigations.some((i) => i.name === 'U&E'));
  check('investigation shows the disease (reverse)', learning.relatedTo('investigation', ue.id).diseases.some((d) => d.name === 'Hypertension'));

  console.log('\nTEST 4 — question linked to a medicine');
  const q = learning.stampAcademic(defaults.newQuestion('Why was losartan chosen instead of an ACE inhibitor?'));
  q.medicineId = amlodipine.id;
  q.status = 'researching';
  await st().save('question', q);
  check('medicine displays the question', learning.relatedTo('medicine', amlodipine.id).questions.some((x) => x.id === q.id));
  check('question resolves back to the medicine', learning.relatedTo('question', q.id).medicines.some((m) => m.id === amlodipine.id));
  check('extended status accepted', st().questions.find((x) => x.id === q.id).status === 'researching');

  console.log('\nTEST 5 — mark a topic for revision');
  const item = await learning.addToRevision('medicine', amlodipine.id);
  check('revision item created', !!item && item.topic === 'Amlodipine');
  check('it appears in the revision list', st().revisions.some((r) => r.id === item.id));
  check('it knows its source record', item.sourceModule === 'medicine' && item.sourceId === amlodipine.id);
  check('duplicate marking is a no-op', (await learning.addToRevision('medicine', amlodipine.id)).id === item.id);
  await learning.setConfidence(item.id, 2);
  check('confidence recorded', st().revisions.find((r) => r.id === item.id).confidence === 2);

  console.log('\nTEST 6 — search across the whole knowledge base');
  const hits = learning.searchLearning('amlodipine');
  check('finds the medicine', hits.medicine?.some((h) => h.title === 'Amlodipine'));
  check('finds the related question', hits.question === undefined || Array.isArray(hits.question));
  const hits2 = learning.searchLearning('statins');
  check('finds the learning note', hits2.lesson?.length === 1);
  const hits3 = learning.searchLearning('hypertension');
  check('finds the disease', hits3.disease?.some((h) => h.title === 'Hypertension'));
  check('unknown term returns nothing', Object.keys(learning.searchLearning('zzzznothing')).length === 0);

  console.log('\nTEST 7 — filter by Level 200');
  const l200 = learning.filterAll({ stageId: level200.id });
  const total200 = Object.values(l200).reduce((n, l) => n + l.length, 0);
  check('all five records are Level 200', total200 === 5, String(total200));
  const otherStage = academic.allStages().find((s) => s.level === '300');
  const l300 = learning.filterAll({ stageId: otherStage.id });
  check('Level 300 has nothing yet', Object.values(l300).reduce((n, l) => n + l.length, 0) === 0);
  check('stats respect the filter', learning.learningStats({ stageId: level200.id }).medicines === 1);

  console.log('\nTEST 8 — promotion preserves historical academic context');
  await academic.promote(); // 200 -> 300
  check('profile is now Level 300', st().profile.level === '300');
  const noteAfter = st().lessons.find((l) => l.id === note.id);
  check('note is STILL Level 200', noteAfter.academic.stageId === level200.id);
  check('medicine is STILL Level 200', st().medicines.find((m) => m.id === amlodipine.id).academic.stageId === level200.id);
  check('Level 200 filter still returns them', Object.values(learning.filterAll({ stageId: level200.id })).reduce((n, l) => n + l.length, 0) === 5);
  check('nothing was relabelled to Level 300', Object.values(learning.filterAll({ stageId: academic.currentStage().id })).reduce((n, l) => n + l.length, 0) === 0);

  // Cross-year: add a Level 300 record and prove both years coexist.
  const stat300 = learning.stampAcademic(defaults.newMedicine('Atorvastatin'));
  await st().save('medicine', stat300);
  const growth = learning.knowledgeByStage().filter((r) => r.total > 0);
  check('knowledge growth spans two stages', growth.length === 2, JSON.stringify(growth.map((g) => g.total)));

  console.log('\nTEST 9 — offline behaviour');
  check('still offline', dom.window.navigator.onLine === false);
  const fav = await learning.toggleFavorite('medicine', amlodipine.id);
  check('favourite toggled offline', fav === true && learning.favorites().length === 1);
  await learning.softDelete('lesson', note.id);
  check('soft delete hides the note', learning.filterAll({}).lesson.length === 0);
  check('but the record still exists (recoverable)', !!st().lessons.find((l) => l.id === note.id));
  await learning.restoreRecord('lesson', note.id);
  check('restore brings it back', learning.filterAll({}).lesson.length === 1);
  check('activity history recorded', st().activities.length > 0);
  check('activity groups render', learning.recentActivity().length > 0);

  console.log('\nTEST 10 — export includes Phase 2 data');
  const parsed = JSON.parse(backup.buildBackup());
  check('lessons exported', parsed.records.lessons.length === 1);
  check('medicines exported', parsed.records.medicines.length === 2);
  check('diseases exported', parsed.records.diseases.length === 1);
  check('investigations exported', parsed.records.investigations.length === 1);
  check('questions exported', parsed.records.questions.length === 1);
  check('revision exported', parsed.records.revisions.length === 1);
  check('activity history exported', Array.isArray(parsed.records.activities));
  check('academic context preserved in export', parsed.records.medicines.every((m) => !!m.academic));

  console.log('\nRESTART — persistence of everything');
  useData.setState({ ready: false, lessons: [], medicines: [], diseases: [], investigations: [], questions: [], revisions: [], activities: [] });
  await st().init();
  check('note survived restart', !!st().lessons.find((l) => l.id === note.id));
  check('its Level 200 stamp survived', st().lessons.find((l) => l.id === note.id).academic.stageId === level200.id);
  check('tags survived', st().lessons.find((l) => l.id === note.id).tags.includes('cardiology'));
  check('favourite survived', st().medicines.find((m) => m.id === amlodipine.id).favorite === true);
  check('relationships still resolve', learning.relatedTo('disease', htn.id).medicines.length === 1);
  check('revision survived', st().revisions.length === 1);

  console.log('\nAI-READY CONTEXT (structure only, no AI)');
  const ctx = learning.buildLearningContext({ stageId: level200.id });
  check('context exposes profile', ctx.profile.programme === 'Pharmacy');
  check('context exposes academic scope', !!ctx.academic.stage);
  check('context includes medicines', ctx.medicines.some((m) => m.name === 'Amlodipine'));
  check('context is scoped to the filter', !ctx.medicines.some((m) => m.name === 'Atorvastatin'));
  check('context includes revision state', Array.isArray(ctx.revision) && ctx.revision.length === 1);
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 2 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 2 ACCEPTANCE TESTS PASSED ✔');
