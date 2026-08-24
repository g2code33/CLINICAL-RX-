/**
 * CLINICAL Rx — PHASE 1 acceptance tests.
 *
 * Maps 1:1 onto the ten acceptance tests in the Phase 1 specification, run
 * against the REAL services in a jsdom environment with the network forced
 * OFF for the entire run.
 *
 *   TEST 1  launch with no internet          TEST 6  previous years accessible
 *   TEST 2  create local profile, persists   TEST 7  close/reopen retains all
 *   TEST 3  level/year/semester on Home      TEST 8  offline keeps working
 *   TEST 4  journey shows CURRENT            TEST 9  export produces valid data
 *   TEST 5  promotion archives, never deletes TEST 10 future modules declared
 *
 * Usage: node test/phase1.test.mjs
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

// TEST 1 / TEST 8 — the whole suite runs with the network unavailable.
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const backup = await server.ssrLoadModule('/src/services/backup.ts');
  const aiProvider = await server.ssrLoadModule('/src/services/aiProvider.ts');
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const st = () => useData.getState();

  console.log('\nTEST 1 — launch with no internet');
  await st().init();
  check('store initialises offline', st().ready === true);
  check('navigator reports offline', dom.window.navigator.onLine === false);

  console.log('\nTEST 2 — create a local profile');
  const p = defaults.newProfile('Ama');
  p.programme = 'Pharmacy';
  p.level = '200';
  p.institution = 'KNUST';
  p.academicYear = '2026/2027';
  const boot = await academic.bootstrapJourney({
    level: '200',
    academicYear: '2026/2027',
    programme: 'Pharmacy',
    institution: 'KNUST',
    semesterName: 'Semester 1',
  });
  p.currentStageId = boot.stage.id;
  p.currentPeriodId = boot.period?.id;
  await st().saveProfile(p);
  check('profile created without any account/email/key', !!st().profile && st().profile.username === 'Ama');
  check('no credentials stored on the profile', !('password' in st().profile) && !('email' in st().profile));

  console.log('\nTEST 3 — level / year / semester available to Home');
  const stage0 = academic.currentStage();
  const period0 = academic.currentPeriod();
  check('current stage is Level 200', stage0?.name === 'Level 200', stage0?.name);
  check('academic year is 2026/2027', stage0?.academicYear === '2026/2027');
  check('current semester is Semester 1', period0?.name === 'Semester 1', period0?.name);
  check('journey progress computes', academic.journeyProgress().total === 4);

  console.log('\nTEST 4 — PharmD Journey shows CURRENT');
  const stages = academic.allStages();
  check('four stages created (100–400)', stages.length === 4, String(stages.length));
  check('Level 200 is current', stages.find((s) => s.level === '200').status === 'current');
  check('Level 100 is completed', stages.find((s) => s.level === '100').status === 'completed');
  check('Level 300 is upcoming', stages.find((s) => s.level === '300').status === 'upcoming');
  check('stages are ordered', stages.map((s) => s.level).join(',') === '100,200,300,400');
  check('each stage has semesters', stages.every((s) => academic.periodsFor(s.id).length === 2));

  // Attach data to Level 200 so we can prove promotion preserves it.
  const round = await ward.startRound('Medical Ward', '2026-11-04', 'Pharmacotherapy');
  await ward.addEntry(round.id, 'medicine', 'Amlodipine', 'CCB — ankle edema.');
  check('ward round stamped with academic stage', round.academic?.stageId === stage0.id, JSON.stringify(round.academic));
  const course = academic.buildCourse(stage0.id, 'Pharmacology', period0.id);
  await academic.saveCourse(course);
  check('course belongs to stage + semester', academic.coursesFor(stage0.id, period0.id).length === 1);

  console.log('\nTEST 5 — promote to Level 300');
  const plan = academic.planPromotion();
  check('promotion plan targets Level 300', plan.nextLevel === '300', plan.nextLevel);
  const res = await academic.promote();
  check('promotion succeeded', res.ok === true, res.error);
  const after = academic.allStages();
  check('Level 200 is now COMPLETED', after.find((s) => s.level === '200').status === 'completed');
  check('Level 300 is now CURRENT', after.find((s) => s.level === '300').status === 'current');
  check('Level 200 has a completedAt stamp', !!after.find((s) => s.level === '200').completedAt);
  check('profile now points at Level 300', st().profile.level === '300');
  check('profile year advanced', st().profile.academicYear === '2027/2028', st().profile.academicYear);

  console.log('\nTEST 6 — previous years remain accessible (NOTHING DELETED)');
  check('all four stages still exist', academic.allStages().length === 4);
  const lvl200 = after.find((s) => s.level === '200');
  check('Level 200 still retrievable by id', !!academic.getStage(lvl200.id));
  check('Level 200 semesters survived', academic.periodsFor(lvl200.id).length === 2);
  check('Level 200 course survived', academic.coursesFor(lvl200.id).length === 1);
  check('ward round from Level 200 survived', !!ward.getRound(round.id));
  check('ward round still linked to Level 200', ward.getRound(round.id).academic.stageId === lvl200.id);
  check('its captures survived', ward.countsFor(round.id).total === 1);
  check('archive lists it under completed', academic.stagesByStatus('completed').some((s) => s.id === lvl200.id));

  console.log('\nTEST 9 — export local data');
  const json = backup.buildBackup();
  const parsed = JSON.parse(json);
  check('export is valid JSON', typeof parsed === 'object');
  check('export identifies the app', parsed.app === 'clinical-rx');
  check('export contains academic stages', parsed.records.academicStages.length === 4);
  check('export contains periods + courses', parsed.records.academicPeriods.length === 8 && parsed.records.courses.length === 1);
  check('export contains ward rounds', parsed.records.wardRounds.length === 1);
  check('export leaks no secrets', !/apiKey"\s*:\s*"[^"]+"/.test(json) && !/password/i.test(json));

  console.log('\nTEST 7 — close and reopen the application');
  const stageIds = academic.allStages().map((s) => s.id).sort();
  useData.setState({ ready: false, academicStages: [], academicPeriods: [], courses: [], wardRounds: [], wardEntries: [] });
  await st().init(); // fresh boot from the same local storage
  check('profile survived restart', st().profile?.username === 'Ama');
  check('all stages survived restart', academic.allStages().length === 4);
  check('stage ids unchanged', academic.allStages().map((s) => s.id).sort().join() === stageIds.join());
  check('Level 300 still current after restart', academic.currentStage()?.level === '300');
  check('Level 200 still completed after restart', academic.getStage(lvl200.id).status === 'completed');
  check('semesters survived restart', academic.periodsFor(lvl200.id).length === 2);
  check('courses survived restart', academic.coursesFor(lvl200.id).length === 1);
  check('ward round survived restart', !!ward.getRound(round.id));

  console.log('\nTEST 8 — still fully functional offline');
  const r2 = await ward.startRound('Surgical Ward', '2027-10-01', 'General');
  check('can start a round offline', !!r2.id);
  check('new round stamped with Level 300', r2.academic.stageId === academic.currentStage().id);
  await academic.setCurrentPeriod(academic.periodsFor(academic.currentStage().id)[1].id);
  check('can change semester offline', academic.currentPeriod()?.name === 'Semester 2');
  const extra = await academic.addStage({ level: '500', academicYear: '2029/2030', status: 'upcoming' });
  check('can add a future stage offline', academic.allStages().length === 5 && extra.level === '500');

  console.log('\nTEST 10 — future modules declared, not faked');
  check('AI provider interface exists', typeof aiProvider.resolveProvider === 'function');
  check('cloud provider registered', aiProvider.getProvider('cloud')?.runtime === 'cloud');
  check('local AI NOT pretended to work', aiProvider.localAiAvailable() === false);
  check('cloud provider declares it needs network', aiProvider.getProvider('cloud').requiresNetwork() === true);
  check('no provider resolves while offline with no key', aiProvider.resolveProvider('auto', null) === null);

  console.log('\nDATA PRINCIPLE — progression is additive');
  const before = academic.allStages().length;
  await academic.promote(); // 300 -> 400
  check('promotion never reduces stage count', academic.allStages().length >= before);
  check('Level 300 archived, not deleted', academic.allStages().find((s) => s.level === '300').status === 'completed');
  check('Level 200 STILL accessible two promotions later', !!academic.getStage(lvl200.id));
  check('original ward round STILL accessible', !!ward.getRound(round.id));
  check('its academic link is intact', ward.getRound(round.id).academic.stageId === lvl200.id);
} finally {
  // Silence Vite's dep-scanner racing the shutdown (harmless, noisy).
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 1 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 1 ACCEPTANCE TESTS PASSED ✔');
