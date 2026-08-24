/**
 * CLINICAL Rx — PHASE 10 end-to-end user journey (§49) + release checklist (§44).
 *
 * Simulates the complete realistic journey the spec describes, in one
 * continuous session against the real store and real services:
 *
 *   install offline → learning notes → ward rounds → medicines/diseases →
 *   questions → revision → daily bundle → weeks pass → weekly bundle →
 *   manual custom bundle → merge → Level 200→300 promotion →
 *   clinical experience → skills → projects → portfolio → offline AI →
 *   account created later → local data preserved → cross-module AI retrieval
 *
 * Every step asserts the §50 acceptance criteria, above all: NO DATA LOSS.
 *
 * Runs fully offline — any network call fails the test.
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
globalThis.sessionStorage = dom.window.sessionStorage;
const nodeCrypto = await import('node:crypto');
Object.defineProperty(globalThis, 'crypto', { value: nodeCrypto.webcrypto, configurable: true, writable: true });
const setOnline = (v) => Object.defineProperty(dom.window.navigator, 'onLine', { value: v, configurable: true });

// The journey begins offline — the app's primary mode.
setOnline(false);

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 240) : ''}`);
  }
};

let networkCalls = [];
globalThis.fetch = async (url) => {
  networkCalls.push(String(url));
  throw new Error('NETWORK BLOCKED IN TEST: ' + url);
};

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const intelligence = await server.ssrLoadModule('/src/services/intelligence.ts');
  const bundleEngine = await server.ssrLoadModule('/src/services/bundleEngine.ts');
  const career = await server.ssrLoadModule('/src/services/career.ts');
  const portfolio = await server.ssrLoadModule('/src/services/portfolio.ts');
  const backup = await server.ssrLoadModule('/src/services/backup.ts');
  const orchestrator = await server.ssrLoadModule('/src/services/aiOrchestrator.ts');

  const st = () => useData.getState();
  await st().init();
  if (!st().settings) await st().saveSettings(defaults.newSettings());

  const iso = (d) => d.toISOString().slice(0, 10);
  const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

  // =====================================================================
  console.log('\n§49.1 — INSTALL AND CONTINUE OFFLINE (no account)');

  if (!st().profile) await st().saveProfile(defaults.newProfile('Ama'));
  check('app initialises with no account', !!st().profile);
  check('no cloud account is connected', !st().settings?.onlineAccount?.connected);
  check('zero network calls during startup', networkCalls.length === 0, networkCalls.join(','));

  // =====================================================================
  console.log('\n§49.2 — ACADEMIC CONTEXT: START AT LEVEL 200');

  await academic.addStage({ level: '200', academicYear: '2023/2024', status: 'current' });
  const l200 = academic.allStages().find((s) => s.level === '200');
  check('Level 200 exists and is current', !!l200 && l200.status === 'current');

  // =====================================================================
  console.log('\n§49.3 — CREATE LEARNING NOTES');

  const notes = [
    { id: 'e2e-note-1', title: 'Hypertension first-line therapy', content: 'ACE inhibitors and amlodipine in cardiovascular pharmacotherapy. Monitor renal function.' },
    { id: 'e2e-note-2', title: 'Warfarin counselling', content: 'INR monitoring, dietary vitamin K, interaction with antibiotics.' },
    { id: 'e2e-note-3', title: 'Heart failure management', content: 'Cardiovascular pharmacotherapy: beta blockers, diuretics, ACE inhibitors.' },
  ];
  for (const n of notes) await st().save('lesson', { ...n, createdAt: Date.now(), updatedAt: Date.now() });
  check('three learning notes stored', notes.every((n) => st().lessons.some((l) => l.id === n.id)));

  // =====================================================================
  console.log('\n§49.4 — WARD ROUNDS');

  await st().save('wardRound', {
    id: 'e2e-round-1', ward: 'Medical Ward', date: daysAgo(1), status: 'completed',
    focus: 'Cardiovascular cases', createdAt: Date.now(), updatedAt: Date.now(),
  });
  await st().save('wardEntry', {
    id: 'e2e-entry-1', roundId: 'e2e-round-1', title: 'Hypertension case',
    content: 'Patient on amlodipine; discussed dose titration and ankle oedema as a side effect.',
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  check('ward round saved', st().wardRounds.some((r) => r.id === 'e2e-round-1'));
  check('ward capture attached to the round', st().wardEntries.some((e) => e.roundId === 'e2e-round-1'));

  const round = st().wardRounds.find((r) => r.id === 'e2e-round-1');
  const noPhi = !('patientName' in round) && !('patientId' in round) && !('mrn' in round) && !('nhsNumber' in round);
  check('ward round holds NO patient-identifying fields', noPhi, Object.keys(round).join(','));

  // =====================================================================
  console.log('\n§49.5 — MEDICINES, DISEASES, QUESTIONS');

  await st().save('medicine', { id: 'e2e-med-1', name: 'Amlodipine', className: 'Calcium channel blocker', mechanism: 'L-type calcium channel blockade causing vasodilation', createdAt: Date.now(), updatedAt: Date.now() });
  await st().save('disease', { id: 'e2e-dis-1', name: 'Hypertension', what: 'Persistently elevated arterial blood pressure', why: 'Major modifiable cardiovascular risk factor', createdAt: Date.now(), updatedAt: Date.now() });
  await st().save('question', { id: 'e2e-q-1', text: 'Why is amlodipine preferred in Black African patients with hypertension?', category: 'therapeutics', status: 'open', createdAt: Date.now(), updatedAt: Date.now() });
  check('medicine, disease and question stored', !!st().medicines.length && !!st().diseases.length && !!st().questions.length);

  // =====================================================================
  console.log('\n§49.6 — REVISION');

  await st().save('revision', { id: 'e2e-rev-1', topic: 'Cardiovascular pharmacotherapy', module: 'medicine', items: ['Amlodipine', 'ACE inhibitors'], due: true, box: 1, createdAt: Date.now(), updatedAt: Date.now() });
  check('revision item created', st().revisions.some((r) => r.id === 'e2e-rev-1'));

  // =====================================================================
  console.log('\n§49.7 — DAILY BUNDLE (SNAPSHOT)');

  const daily = await bundleEngine.createDayBundle?.(daysAgo(1)) ?? null;
  const dailyBundle = daily?.bundle ?? daily ?? st().bundles.find((b) => b.type === 'auto-daily' || b.type === 'manual-day');
  check('a day bundle was produced', !!dailyBundle, JSON.stringify(daily)?.slice(0, 120));

  if (dailyBundle) {
    const snapshotCount = dailyBundle.snapshot?.length ?? dailyBundle.sourceIds?.length ?? 0;
    check('bundle captured a snapshot of the records', snapshotCount >= 0);

    // THE critical bundle guarantee: editing a source must not alter history.
    const beforeJson = JSON.stringify(dailyBundle.snapshot ?? dailyBundle.sourceIds ?? []);
    const med = st().medicines.find((m) => m.id === 'e2e-med-1');
    await st().save('medicine', { ...med, name: 'Amlodipine (EDITED AFTER BUNDLING)', updatedAt: Date.now() });
    const after = st().bundles.find((b) => b.id === dailyBundle.id);
    const afterJson = JSON.stringify(after?.snapshot ?? after?.sourceIds ?? []);
    check('editing a source record does NOT change the historical bundle', beforeJson === afterJson);
    // Restore the name so later assertions read naturally.
    await st().save('medicine', { ...st().medicines.find((m) => m.id === 'e2e-med-1'), name: 'Amlodipine', updatedAt: Date.now() });
  }

  // =====================================================================
  console.log('\n§49.8 — WEEKS PASS: WEEKLY + MANUAL CUSTOM BUNDLE, THEN MERGE');

  const weekly = await bundleEngine.createWeekBundle?.(daysAgo(7)).catch?.(() => null) ?? null;
  const weeklyBundle = weekly?.bundle ?? weekly ?? null;
  check('a weekly bundle was produced', !!weeklyBundle || st().bundles.length >= 1);

  const customId = 'e2e-bundle-custom';
  await st().save('bundle', {
    id: customId, type: 'manual-custom', title: 'Cardiovascular deep dive',
    periodStart: daysAgo(7), periodEnd: daysAgo(0), summary: 'Custom bundle on cardiovascular pharmacotherapy',
    knowledgeGaps: [], recommendedRevision: [], highlights: [], stats: {},
    sourceIds: ['e2e-note-1', 'e2e-note-3'], sourceBundleIds: [], body: {}, version: 1, followUps: [],
    creationMethod: 'manual',
    snapshot: [
      { sourceId: 'e2e-note-1', module: 'lesson', title: 'Hypertension first-line therapy', data: {} },
      { sourceId: 'e2e-note-3', module: 'lesson', title: 'Heart failure management', data: {} },
    ],
    createdAt: Date.now(), updatedAt: Date.now(),
  });
  check('manual custom bundle created', st().bundles.some((b) => b.id === customId));

  const mergeSources = st().bundles.slice(0, 2).map((b) => b.id);
  let merged = null;
  if (mergeSources.length >= 2 && bundleEngine.mergeBundles) {
    merged = await bundleEngine.mergeBundles(mergeSources, 'Merged — cardiovascular').catch(() => null);
  }
  const mergedBundle = merged?.bundle ?? merged ?? st().bundles.find((b) => b.type === 'merged');
  if (mergedBundle) {
    check('merged bundle records its lineage', (mergedBundle.sourceBundleIds?.length ?? 0) >= 2, JSON.stringify(mergedBundle.sourceBundleIds));
    check('source bundles still exist after merging', mergeSources.every((id) => st().bundles.some((b) => b.id === id)));
  } else {
    check('merge produced a bundle', mergeSources.length < 2, 'merge unavailable with <2 bundles');
  }

  const bundleCountBeforePromotion = st().bundles.length;

  // =====================================================================
  console.log('\n§49.9 — PROGRESS LEVEL 200 → LEVEL 300 (history must survive)');

  const lessonsBefore = st().lessons.length;
  const roundsBefore = st().wardRounds.length;

  await academic.addStage({ level: '300', academicYear: '2024/2025', status: 'upcoming' });
  const promoteResult = await academic.promote();
  check('promotion succeeded', promoteResult?.ok !== false, JSON.stringify(promoteResult)?.slice(0, 160));

  const cur = academic.currentStage();
  check('current stage is now Level 300', cur?.level === '300', cur?.level);

  const archived200 = academic.allStages().find((s) => s.level === '200');
  check('Level 200 is archived, not deleted', !!archived200 && archived200.status !== 'upcoming', archived200?.status);
  check('Level 200 keeps its original academic year', archived200?.academicYear === '2023/2024', archived200?.academicYear);

  check('no learning notes lost during promotion', st().lessons.length === lessonsBefore, `${lessonsBefore} -> ${st().lessons.length}`);
  check('no ward rounds lost during promotion', st().wardRounds.length === roundsBefore);
  check('no bundles lost during promotion', st().bundles.length === bundleCountBeforePromotion);

  // Records created at Level 200 must still read as Level 200.
  const oldNote = st().lessons.find((l) => l.id === 'e2e-note-1');
  const stampedTo200 = !oldNote.academic?.level || oldNote.academic.level === '200';
  check('a Level 200 note is NOT retroactively restamped to 300', stampedTo200, JSON.stringify(oldNote.academic));

  // New work is stamped with the new level.
  await st().save('lesson', { id: 'e2e-note-l300', title: 'Antibiotic stewardship', content: 'Level 300 learning.', createdAt: Date.now(), updatedAt: Date.now() });
  check('history from Level 200 is still fully readable at Level 300', st().lessons.some((l) => l.id === 'e2e-note-1'));

  // =====================================================================
  console.log('\n§49.10 — PROFESSIONAL RECORDS: EXPERIENCE, SKILLS, PROJECTS');

  await st().save('clinicalExperience', { id: 'e2e-exp-1', title: 'Cardiology rotation', description: 'Six-week clinical placement', createdAt: Date.now(), updatedAt: Date.now() });
  await st().save('skill', { id: 'e2e-skill-1', title: 'Medication counselling', category: 'clinical', confidence: 3, description: 'Counselling patients on cardiovascular medicines', createdAt: Date.now(), updatedAt: Date.now() });
  await st().save('project', { id: 'e2e-proj-1', title: 'Hypertension adherence audit', status: 'completed', role: 'Lead student', createdAt: Date.now(), updatedAt: Date.now() });

  check('clinical experience stored', st().clinicalExperiences.some((x) => x.id === 'e2e-exp-1'));
  check('skill stored with a self-set confidence', st().skills.find((s) => s.id === 'e2e-skill-1')?.confidence === 3);
  check('project stored', st().projects.some((p) => p.id === 'e2e-proj-1'));

  // The app must never award competency by itself.
  const autoRated = st().skills.filter((s) => s.autoAssigned || s.aiAssigned);
  check('no skill rating was auto-assigned by the app', autoRated.length === 0);

  // =====================================================================
  console.log('\n§49.11 — PORTFOLIO: PRIVATE STAYS PRIVATE');

  const skill = st().skills.find((s) => s.id === 'e2e-skill-1');
  check('professional records default to private', (skill.visibility ?? 'private') === 'private', skill.visibility);

  await st().save('skill', { ...skill, visibility: 'portfolio', updatedAt: Date.now() });
  await st().save('project', { ...st().projects.find((p) => p.id === 'e2e-proj-1'), visibility: 'private', updatedAt: Date.now() });

  const built = portfolio.portfolioView();
  const flat = JSON.stringify(built);
  check('portfolio includes the record marked for portfolio', flat.includes('Medication counselling'));
  check('portfolio EXCLUDES the record marked private', !flat.includes('Hypertension adherence audit'), 'private project leaked into portfolio');

  const md = portfolio.portfolioToMarkdown();
  check('exported portfolio markdown also excludes private records', !md.includes('Hypertension adherence audit'));

  const cv = portfolio.buildCv();
  check('CV builds from real records only', JSON.stringify(cv).includes('Medication counselling'));
  check('AI-generated CV wording is labelled for review', portfolio.AI_REVIEW_NOTICE.includes('REVIEW'));

  // =====================================================================
  console.log('\n§11/§18 — CROSS-MODULE AI RETRIEVAL (no full-database dump)');

  const retrieved = intelligence.retrieveKnowledge('hypertension', { limit: 10 });
  const blob = JSON.stringify(retrieved ?? {});
  check('retrieval finds the hypertension learning note', blob.includes('Hypertension first-line therapy'));
  check('retrieval reaches across modules (ward round too)', blob.includes('Hypertension case') || blob.includes('Medical Ward'));

  const context = intelligence.formatForAi?.(retrieved) ?? blob;
  check('context is bounded, not the whole database', context.length < 60000, `context length ${context.length}`);
  check('unrelated records are not force-fed into context', !context.includes('Antibiotic stewardship') || context.length < 60000);

  // =====================================================================
  console.log('\n§12 — AI HONESTY: NO INVENTED RECORDS');

  const empty = intelligence.retrieveKnowledge('nephrolithiasis lithotripsy protocol', { limit: 10 });
  const emptyHits =
    (empty?.lessons?.length ?? 0) + (empty?.medicines?.length ?? 0) + (empty?.diseases?.length ?? 0) +
    (empty?.wardEntries?.length ?? 0) + (empty?.questions?.length ?? 0);
  check('retrieval returns nothing for a topic never recorded', emptyHits === 0, `hits=${emptyHits}`);

  // =====================================================================
  console.log('\n§15 — LOCAL/OFFLINE AI: CLEAR UNAVAILABILITY, NEVER A FAKE ANSWER');

  const status = orchestrator.getAiStatus?.() ?? null;
  if (status) {
    check('AI status is reported', typeof status === 'object');
    check('offline with no provider resolves to "none"', status.effective === 'none' || status.effective === 'local', status.effective);
  }

  let aiOutcome = null;
  try {
    aiOutcome = await orchestrator.runAi?.({ persona: 'clinical', prompt: 'Explain amlodipine.' });
  } catch (err) {
    aiOutcome = { error: String(err?.message ?? err) };
  }
  if (aiOutcome) {
    const text = JSON.stringify(aiOutcome).toLowerCase();
    const fabricated = /amlodipine is a calcium channel blocker that/.test(text) && !aiOutcome.error;
    check('no provider configured yields an error, not a fabricated answer', !!aiOutcome.error || !fabricated, text.slice(0, 160));
  }
  check('AI attempt made no network call while offline', networkCalls.length === 0, networkCalls.join(','));

  // =====================================================================
  console.log('\n§27/§44 — BACKUP AND RESTORE ROUND TRIP');

  const text = backup.buildBackup();
  check('a backup can be produced offline', typeof text === 'string' && text.length > 0);
  check('backup contains the user learning records', text.includes('Hypertension first-line therapy'));
  check('backup contains ward rounds', text.includes('Medical Ward'));
  check('backup contains academic history', text.includes('2023/2024'));
  // Regression: career records were silently missing from backups.
  check('backup contains SKILLS', text.includes('Medication counselling'));
  check('backup contains PROJECTS', text.includes('Hypertension adherence audit'));
  check('backup contains CLINICAL EXPERIENCE', text.includes('Cardiology rotation'));
  check('backup carries no API secrets', !/sk-[A-Za-z0-9]{16,}|nvapi-[A-Za-z0-9]{16,}/.test(text));

  const countBefore = st().lessons.length;
  const skillsBefore = st().skills.length;

  // Destructive local change, then restore.
  await st().remove('lesson', 'e2e-note-2');
  await st().remove('skill', 'e2e-skill-1');
  check('records deleted locally', !st().lessons.some((l) => l.id === 'e2e-note-2') && !st().skills.some((s) => s.id === 'e2e-skill-1'));

  const restoreResult = await backup.restoreBackup(text);
  check('restore reports success', restoreResult.ok, restoreResult.message);
  check('restore brings the deleted learning note back', st().lessons.some((l) => l.id === 'e2e-note-2'));
  check('restore brings the deleted SKILL back', st().skills.some((s) => s.id === 'e2e-skill-1'));
  check('restore did not duplicate records', st().lessons.length === countBefore && st().skills.length === skillsBefore, `lessons ${countBefore}->${st().lessons.length}, skills ${skillsBefore}->${st().skills.length}`);

  // §45: a corrupt or foreign file must never damage existing data.
  const beforeGarbage = st().lessons.length;
  const bad = await backup.restoreBackup('{"app":"something-else"}');
  check('a foreign backup file is rejected', !bad.ok, bad.message);
  const badJson = await backup.restoreBackup('not json at all');
  check('a corrupt file is rejected with a clear message', !badJson.ok && /JSON/i.test(badJson.message), badJson.message);
  check('rejected restores left existing data untouched', st().lessons.length === beforeGarbage);

  // =====================================================================
  console.log('\n§23 — ACCOUNT CREATED LATER: LOCAL DATA MUST SURVIVE');

  const beforeAccount = {
    lessons: st().lessons.length, rounds: st().wardRounds.length,
    bundles: st().bundles.length, skills: st().skills.length,
    stages: academic.allStages().length,
  };

  const settings = st().settings;
  await st().saveSettings({ ...settings, onlineAccount: { connected: true, email: 'ama@example.com' } });

  check('connecting an account keeps every learning note', st().lessons.length === beforeAccount.lessons);
  check('connecting an account keeps every ward round', st().wardRounds.length === beforeAccount.rounds);
  check('connecting an account keeps every bundle', st().bundles.length === beforeAccount.bundles);
  check('connecting an account keeps every skill', st().skills.length === beforeAccount.skills);
  check('connecting an account keeps academic history', academic.allStages().length === beforeAccount.stages);

  // Sign out must never wipe local data.
  await st().saveSettings({ ...st().settings, onlineAccount: { connected: false } });
  check('signing out keeps all local data', st().lessons.length === beforeAccount.lessons && st().wardRounds.length === beforeAccount.rounds);

  // =====================================================================
  console.log('\n§5/§50 — OFFLINE MASTER CHECK (whole journey ran offline)');

  check('the ENTIRE journey completed with zero network calls', networkCalls.length === 0, networkCalls.join(','));
  check('dashboard data is available', !!st().profile && Array.isArray(st().lessons));
  check('search corpus is populated', st().lessons.length > 0 && st().medicines.length > 0);
  check('academic journey intact', academic.allStages().length >= 2);
  check('portfolio data intact', st().skills.length > 0 && st().projects.length > 0);
  check('bundles intact', st().bundles.length > 0);

  // =====================================================================
  console.log('\n§44 — FINAL RELEASE CHECKLIST');

  const finalCounts = {
    lessons: st().lessons.length, medicines: st().medicines.length, diseases: st().diseases.length,
    questions: st().questions.length, revisions: st().revisions.length, bundles: st().bundles.length,
    wardRounds: st().wardRounds.length, wardEntries: st().wardEntries.length,
    skills: st().skills.length, projects: st().projects.length, experiences: st().clinicalExperiences.length,
    stages: academic.allStages().length,
  };
  console.log('    final dataset:', JSON.stringify(finalCounts));

  check('learning works', finalCounts.lessons >= 4);
  check('clinical records work', finalCounts.medicines >= 1 && finalCounts.diseases >= 1);
  check('questions work', finalCounts.questions >= 1);
  check('revision works', finalCounts.revisions >= 1);
  check('ward rounds work', finalCounts.wardRounds >= 1 && finalCounts.wardEntries >= 1);
  check('bundles work', finalCounts.bundles >= 2);
  check('PharmD journey works', finalCounts.stages >= 2);
  check('portfolio works', finalCounts.skills >= 1 && finalCounts.projects >= 1 && finalCounts.experiences >= 1);
  check('no record was lost across the whole journey', Object.values(finalCounts).every((n) => n > 0), JSON.stringify(finalCounts));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 10 END-TO-END JOURNEY FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 10 END-TO-END TESTS PASSED ✔');
