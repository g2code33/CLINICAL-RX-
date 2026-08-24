/**
 * CLINICAL Rx — PHASE 3 acceptance tests.
 * Ward Rounds (link-on-capture) + the Intelligence Layer foundation.
 *
 *   TEST 1  ward round persists          TEST 6  cross-module search
 *   TEST 2  links existing disease       TEST 7  filter by Level 200
 *   TEST 3  links existing medicine      TEST 8  promotion preserves level
 *   TEST 4  learning point shared        TEST 9  works offline
 *   TEST 5  question reaches global vault TEST 10 Intelligence Layer retrieval
 *
 * Entire suite runs with the network OFF.
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
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const intel = await server.ssrLoadModule('/src/services/intelligence.ts');
  const learning = await server.ssrLoadModule('/src/services/learning.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const st = () => useData.getState();

  await st().init();

  // Setup: Level 200 journey.
  const p = defaults.newProfile('Ama');
  p.programme = 'Pharmacy';
  p.level = '200';
  p.academicYear = '2026/2027';
  const boot = await academic.bootstrapJourney({ level: '200', academicYear: '2026/2027', semesterName: 'Semester 1' });
  p.currentStageId = boot.stage.id;
  p.currentPeriodId = boot.period?.id;
  await st().saveProfile(p);
  const level200 = boot.stage;

  // Pre-existing knowledge the ward round should LINK to, not duplicate.
  const htn = defaults.newDisease('Hypertension');
  await st().save('disease', htn);
  const amlo = defaults.newMedicine('Amlodipine');
  await st().save('medicine', amlo);
  const ue = defaults.newInvestigation('U&E');
  await st().save('investigation', ue);

  console.log('\nTEST 1 — create a ward round, it persists');
  const round = await ward.startRound('Medical Ward', '2026-11-04', 'Pharmacotherapy', {
    rotation: 'Internal Medicine',
    objective: 'Understand antihypertensive choices',
  });
  check('round created', !!round.id);
  check('rotation stored', round.rotation === 'Internal Medicine');
  check('objective stored', round.objective === 'Understand antihypertensive choices');
  check('stamped Level 200', round.academic?.stageId === level200.id);

  console.log('\nTEST 2 — adding an existing disease LINKS instead of duplicating');
  const beforeDiseases = st().diseases.length;
  const e1 = await ward.addEntry(round.id, 'condition', 'Hypertension', 'Stage 2, started on a CCB.');
  check('no duplicate disease created', st().diseases.length === beforeDiseases, `${beforeDiseases} -> ${st().diseases.length}`);
  check('entry links to the EXISTING disease', e1.linkedRecordId === htn.id, e1.linkedRecordId);
  check('entry records which module it links to', e1.linkedModule === 'disease');

  console.log('\nTEST 3 — adding an existing medicine LINKS instead of duplicating');
  const beforeMeds = st().medicines.length;
  const e2 = await ward.addEntry(round.id, 'medicine', 'Amlodipine', 'Ankle edema is dose related.');
  check('no duplicate medicine created', st().medicines.length === beforeMeds);
  check('entry links to the EXISTING medicine', e2.linkedRecordId === amlo.id);
  const e2b = await ward.addEntry(round.id, 'investigation', 'U&E', 'Checked before starting.');
  check('investigation linked too', e2b.linkedRecordId === ue.id);

  // A genuinely new name SHOULD create the canonical record, once.
  const e3 = await ward.addEntry(round.id, 'medicine', 'Losartan', 'ARB alternative.');
  check('new medicine created once', st().medicines.length === beforeMeds + 1);
  check('and the entry links to it', !!e3.linkedRecordId);
  const e3b = await ward.addEntry(round.id, 'medicine', 'Losartan', 'Mentioned again later.');
  check('mentioning it again does NOT duplicate', st().medicines.length === beforeMeds + 1);
  check('second mention links to the same record', e3b.linkedRecordId === e3.linkedRecordId);

  console.log('\nTEST 4 — learning point reaches Clinical Learning without duplication');
  const beforeLessons = st().lessons.length;
  const e4 = await ward.addEntry(round.id, 'learning', '', 'ACE inhibitors can cause hyperkalemia; monitor renal function.');
  check('lesson record created', st().lessons.length === beforeLessons + 1);
  check('ward entry links to the lesson', !!e4.linkedRecordId && e4.linkedModule === 'lesson');
  check('it is in the global learning list', st().lessons.some((l) => l.id === e4.linkedRecordId));
  check('lesson carries academic context', st().lessons.find((l) => l.id === e4.linkedRecordId).academic?.stageId === level200.id);

  console.log('\nTEST 5 — question reaches the global Questions vault');
  const beforeQ = st().questions.length;
  const e5 = await ward.addEntry(round.id, 'question', '', 'Why was losartan preferred over an ACE inhibitor?');
  check('question record created', st().questions.length === beforeQ + 1);
  check('ward entry links to it', e5.linkedModule === 'question' && !!e5.linkedRecordId);
  check('visible in the global vault', st().questions.some((q) => q.id === e5.linkedRecordId));

  console.log('\nCLINICAL REASONING + REFLECTION');
  const e6 = await ward.addEntry(round.id, 'reasoning', 'Antihypertensive choice', '', 'medium', {
    reasoning: {
      considered: 'CCB vs ACE inhibitor',
      relevantInfo: 'Renal function, ethnicity, side-effect profile',
      understood: 'CCBs are first line in this group',
      confused: 'When to prefer an ARB',
      investigateFurther: 'Guideline thresholds',
    },
  });
  check('reasoning entry saved', e6.type === 'reasoning' && !!e6.reasoning);
  check('structured fields preserved', e6.reasoning.confused === 'When to prefer an ARB');
  check('reasoning is NOT pushed into knowledge modules', !e6.linkedRecordId);
  const e7 = await ward.addEntry(round.id, 'reflection', '', 'Struggled with renal dosing; will revise next week.');
  check('reflection entry saved', e7.type === 'reflection');

  console.log('\nDAY / WEEK RETRIEVAL (bundler foundation — bundler NOT built)');
  const day = ward.activityForDay('2026-11-04');
  check('day retrieval finds the round', day.rounds.length === 1);
  check('day retrieval finds its captures', day.entries.length === 9, String(day.entries.length));
  const week = ward.activityForWeek('2026-11-04');
  check('week retrieval includes the round', week.rounds.length === 1);
  const bounds = ward.weekBounds('2026-11-04');
  check('week bounds are Monday→Sunday', bounds.start === '2026-11-02' && bounds.end === '2026-11-08', `${bounds.start}..${bounds.end}`);
  const empty = ward.activityForDay('2020-01-01');
  check('empty day returns nothing', empty.rounds.length === 0 && empty.entries.length === 0);

  console.log('\nTEST 6 — cross-module search');
  const hits = intel.retrieveKnowledge({ query: 'hypertension' });
  const kinds = new Set(hits.records.map((r) => r.module));
  check('search returns results', hits.total > 0);
  check('includes the disease', kinds.has('disease'));
  check('includes the ward round or its capture', kinds.has('wardRound') || kinds.has('wardEntry'));
  check('results are grouped by source', hits.groups.length >= 2, String(hits.groups.length));
  const amloHits = intel.retrieveKnowledge({ query: 'amlodipine' });
  check('finds a medicine across modules', amloHits.records.some((r) => r.module === 'medicine'));

  console.log('\nTEST 7 — filter by Level 200');
  const scoped = intel.retrieveKnowledge({ stageId: level200.id, limit: 200 });
  check('scoped retrieval returns records', scoped.total > 0);
  check('every record is Level 200', scoped.records.every((r) => r.academic?.stageId === level200.id));
  const otherStage = academic.allStages().find((s) => s.level === '300');
  check('Level 300 scope is empty', intel.retrieveKnowledge({ stageId: otherStage.id, limit: 200 }).total === 0);

  console.log('\nTEST 8 — promotion preserves ward round academic context');
  await academic.promote();
  check('now Level 300', academic.currentStage().level === '300');
  check('ward round STILL Level 200', ward.getRound(round.id).academic.stageId === level200.id);
  check('its lesson STILL Level 200', st().lessons.find((l) => l.id === e4.linkedRecordId).academic.stageId === level200.id);
  check('Level 200 retrieval still works', intel.retrieveKnowledge({ stageId: level200.id, limit: 200 }).total > 0);

  console.log('\nTEST 9 — offline');
  check('still offline', dom.window.navigator.onLine === false);
  const r2 = await ward.startRound('Outpatient', '2027-10-05', 'General');
  check('can create a round offline', !!r2.id);
  check('search works offline', intel.retrieveKnowledge({ query: 'losartan' }).total > 0);

  console.log('\nTEST 10 — Intelligence Layer');
  const sources = intel.listSources();
  check('sources registered', sources.length >= 12, String(sources.length));
  const keys = sources.map((s) => s.key);
  for (const k of ['disease', 'medicine', 'investigation', 'lesson', 'question', 'revision', 'day', 'wardRound', 'wardEntry', 'academicStage', 'course', 'quiz', 'bundle']) {
    check(`source registered: ${k}`, keys.includes(k));
  }
  check('domains are declared', sources.every((s) => ['clinical', 'academic', 'professional'].includes(s.domain)));

  // Registration architecture: a future module can join at runtime.
  intel.registerSource({
    key: 'researchTest',
    label: 'Research',
    icon: '🔬',
    domain: 'professional',
    list: () => [{ id: 'r1', type: 'research', module: 'research', title: 'Statin adherence project', summary: 'Pilot', date: '2026-11-01' }],
  });
  check('future modules can register', intel.retrieveKnowledge({ query: 'statin adherence' }).total === 1);
  intel.unregisterSource('researchTest');
  check('and unregister', !intel.listSources().some((s) => s.key === 'researchTest'));

  // Cross-module context for one record (the "Ask AI about this" foundation).
  const ctx = intel.contextForRecord('disease', htn.id);
  check('record context resolves the focus', ctx.focus?.title === 'Hypertension');
  check('context gathers connected records', ctx.related.length > 0, String(ctx.related.length));
  check('context includes the ward round it came up in', ctx.related.some((r) => r.module === 'wardRound'));
  check('context carries academic scope', !!ctx.academic.stage);

  // Retrieval must be AI-ready text, not raw rows.
  const text = intel.formatForAi(intel.retrieveKnowledge({ query: 'amlodipine', includeRelationships: true }));
  check('formats for an AI provider', text.includes('Amlodipine') && text.includes('MEDICINES'));
  check('never leaks raw table rows', !text.includes('createdAt'));

  const stats = intel.intelligenceStats();
  check('diagnostics report per-source counts', stats.some((s) => s.key === 'wardRound' && s.count === 2));

  console.log('\nRESTART — persistence');
  useData.setState({ ready: false, wardRounds: [], wardEntries: [], diseases: [], medicines: [], lessons: [], questions: [] });
  await st().init();
  check('round survived restart', !!ward.getRound(round.id));
  check('rotation survived', ward.getRound(round.id).rotation === 'Internal Medicine');
  check('captures survived', ward.entriesFor(round.id).length === 9);
  check('links survived', ward.entriesFor(round.id).some((e) => e.linkedRecordId === htn.id));
  check('reasoning survived', ward.entriesFor(round.id).some((e) => e.reasoning?.confused === 'When to prefer an ARB'));
  check('intelligence still retrieves after restart', intel.retrieveKnowledge({ query: 'hypertension' }).total > 0);

  console.log('\nPRIVACY');
  const roundKeys = Object.keys(ward.getRound(round.id)).join(' ').toLowerCase();
  const entryKeys = Object.keys(ward.entriesFor(round.id)[0]).join(' ').toLowerCase();
  const banned = ['patient', 'hospitalnumber', 'mrn', 'phone', 'address', 'dob', 'birth'];
  check('no patient-identifying fields anywhere', !banned.some((b) => roundKeys.includes(b) || entryKeys.includes(b)));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 3 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 3 ACCEPTANCE TESTS PASSED ✔');
