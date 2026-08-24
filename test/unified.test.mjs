/**
 * ONE APP, ONE MEMORY.
 *
 * Proves the Clinical workspace and the PharmD Journey workspace are two views
 * of a single dataset — not separate entities:
 *   - every learning record is stamped with academic context automatically,
 *     from ANY entry point (store-level, not just the UI)
 *   - the unified context handed to AI contains data from BOTH workspaces
 *   - cross-workspace queries ("statins in Level 200") are answerable
 *   - search reaches journey + course records too
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
  const learning = await server.ssrLoadModule('/src/services/learning.ts');
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const st = () => useData.getState();

  await st().init();

  // --- PharmD workspace: set up the journey ---
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
  await academic.saveCourse(academic.buildCourse(level200.id, 'Clinical Pharmacy', boot.period.id));

  console.log('\nAUTOMATIC LINKING — the store stamps every writer, not just the UI');

  // Save records the "raw" way, bypassing UI helpers entirely.
  const day = defaults.newDay(1, 'KATH');
  day.conditions = ['Hypertension'];
  day.medicines = ['Atorvastatin'];
  await st().save('day', day);
  check('clinical day stamped automatically', st().days[0].academic?.stageId === level200.id);

  const med = defaults.newMedicine('Atorvastatin');
  med.className = 'Statin';
  await st().save('medicine', med);
  check('medicine stamped automatically', st().medicines.find((m) => m.id === med.id).academic?.stageId === level200.id);

  const note = defaults.newLesson('Statins inhibit HMG-CoA reductase.', defaults.todayIso());
  await st().save('lesson', note);
  check('learning note stamped automatically', st().lessons.find((l) => l.id === note.id).academic?.stageId === level200.id);

  const quiz = defaults.newSavedQuiz({ title: 'Lipids quiz', questions: [], answers: [], score: 8, durationSeconds: 300 });
  await st().save('quiz', quiz);
  check('quiz stamped automatically', st().quizzes.find((q) => q.id === quiz.id).academic?.stageId === level200.id);

  const round = await ward.startRound('Medical Ward', defaults.todayIso(), 'Pharmacotherapy');
  await ward.addEntry(round.id, 'medicine', 'Atorvastatin', 'Check LFTs before starting.');
  check('ward round stamped automatically', ward.getRound(round.id).academic?.stageId === level200.id);

  console.log('\nONE MEMORY — the AI context spans BOTH workspaces');
  const ctx = learning.buildUnifiedContext();

  // PharmD-side content
  check('context includes the academic journey', ctx.includes('ACADEMIC JOURNEY'));
  check('context names the current stage', ctx.includes('Level 200') && ctx.includes('2026/2027'));
  check('context lists every stage (archive)', ctx.includes('Level 100') && ctx.includes('Level 300'));
  check('context includes courses', ctx.includes('Clinical Pharmacy'));

  // Clinical-side content
  check('context includes the knowledge base', ctx.includes('KNOWLEDGE BASE'));
  check('context includes medicines', ctx.includes('Atorvastatin'));
  check('context includes learning notes', ctx.includes('HMG-CoA'));
  check('context includes clinical days', ctx.includes('CLINICAL DAYS'));
  check('context includes ward rounds', ctx.includes('WARD ROUNDS') && ctx.includes('Medical Ward'));
  check('context includes ward captures', ctx.includes('Check LFTs'));
  check('context includes quiz history', ctx.includes('QUIZ HISTORY') && ctx.includes('Lipids quiz'));

  // Cross-linking
  check('records carry their academic label inside the context', ctx.includes('[Level 200'));
  check('summary line covers both workspaces', (() => {
    const line = learning.unifiedSummaryLine();
    return line.includes('academic stage') && line.includes('ward round') && line.includes('clinical day');
  })());

  console.log('\nCROSS-WORKSPACE QUERIES');
  // "What did I learn about statins in Level 200?"
  const statinL200 = learning.searchLearning('statin', { stageId: level200.id });
  check('can query knowledge scoped to an academic year', (statinL200.medicine?.length ?? 0) + (statinL200.lesson?.length ?? 0) >= 2);
  // knowledgeByStage counts the five KNOWLEDGE modules (lesson/disease/
  // medicine/investigation/question) — clinical days and quizzes are tracked
  // separately, so a medicine + a note is the expected total here.
  const byStage = learning.knowledgeByStage().find((r) => r.stageId === level200.id);
  check('knowledge is attributable per stage', byStage.total === 2, String(byStage.total));
  check('per-module breakdown is correct', byStage.counts.medicine === 1 && byStage.counts.lesson === 1);

  console.log('\nHISTORY SURVIVES PROMOTION (still one dataset)');
  await academic.promote(); // 200 -> 300
  const l300 = academic.currentStage();
  check('now at Level 300', l300.level === '300');
  check('old medicine still reads Level 200', st().medicines.find((m) => m.id === med.id).academic.stageId === level200.id);
  check('old ward round still reads Level 200', ward.getRound(round.id).academic.stageId === level200.id);
  check('old clinical day still reads Level 200', st().days[0].academic.stageId === level200.id);

  // New record picks up the NEW stage automatically.
  const med2 = defaults.newMedicine('Amlodipine');
  await st().save('medicine', med2);
  check('new record stamped with Level 300', st().medicines.find((m) => m.id === med2.id).academic.stageId === l300.id);

  const ctx2 = learning.buildUnifiedContext();
  check('context now shows both years of knowledge', ctx2.includes('[Level 200') && ctx2.includes('[Level 300'));
  check('AI can still see Level 200 work after promotion', ctx2.includes('Atorvastatin'));

  console.log('\nNO SILOS');
  check('single zustand store holds both workspaces', !!st().academicStages && !!st().medicines && !!st().wardRounds);
  const modules = ['day', 'disease', 'medicine', 'investigation', 'question', 'lesson', 'revision', 'bundle', 'chat', 'quiz', 'reminder', 'wardRound', 'wardEntry', 'wardAnalysis', 'academicStage', 'academicPeriod', 'course', 'activity'];
  check('every module resolves through one adapter', modules.every((m) => Array.isArray(st().all(m))));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`UNIFIED MEMORY TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL UNIFIED MEMORY TESTS PASSED ✔');
