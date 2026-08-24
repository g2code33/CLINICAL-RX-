/**
 * CLINICAL Rx — PHASE 6 acceptance tests
 * (PharmD Journey + Professional Career Engine).
 *
 *   TEST 1  Level 200 records survive promotion to Level 300
 *   TEST 2  new records associate with Level 300
 *   TEST 3  Level 200 Archive still returns everything
 *   TEST 4  clinical experience ↔ ward round relationship
 *   TEST 5  skill shows its clinical-experience evidence
 *   TEST 6  project ↔ skills relationship
 *   TEST 7  goal milestones drive real progress
 *   TEST 8  Career AI uses stored records and invents nothing
 *   TEST 9  everything works offline
 *   TEST 10 portfolio export contains only selected records
 *   TEST 11 deleting a project leaves its skills intact
 *   TEST 12 search finds a skill across the whole app
 *
 * Runs entirely offline. Any real network call fails the run.
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
// OFFLINE for the whole run — Phase 6 must never need the network.
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });
globalThis.fetch = async (url) => {
  throw new Error(`UNEXPECTED NETWORK CALL to ${url}`);
};

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
  const career = await server.ssrLoadModule('/src/services/career.ts');
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const intel = await server.ssrLoadModule('/src/services/intelligence.ts');
  const portfolio = await server.ssrLoadModule('/src/services/portfolio.ts');

  const st = () => useData.getState();
  await st().init();

  // ---- Setup: start at Level 200 ----
  const boot = await academic.bootstrapJourney({ level: '200', academicYear: '2026/2027', semesterName: 'Semester 1' });
  const level200 = boot.stage;
  const prof = defaults.newProfile('Ama');
  prof.programme = 'PharmD';
  prof.level = '200';
  prof.currentStageId = level200.id;
  prof.currentPeriodId = boot.period?.id;
  await st().saveProfile(prof);

  // =====================================================================
  console.log('\nTEST 1 — Level 200 records survive promotion');

  const l200Lesson = defaults.newLesson('Statins inhibit HMG-CoA reductase.', '2026-11-02');
  await st().save('lesson', l200Lesson);
  const l200Course = academic.buildCourse(level200.id, 'Pharmacotherapy I', boot.period?.id, 'PHRM201');
  await academic.saveCourse(l200Course);
  const l200Round = await ward.startRound('Medical Ward', '2026-11-02', 'Pharmacotherapy');
  await ward.addEntry(l200Round.id, 'medicine', 'Atorvastatin', 'Secondary prevention.');

  const exp200 = await career.saveCareerRecord(
    'clinicalExperience',
    Object.assign(career.newClinicalExperience('Afrancho Polyclinic Rotation', '2026-11-01'), {
      institution: 'Afrancho Polyclinic',
      clinicalArea: 'Community Pharmacy',
      endDate: '2026-11-30',
    })
  );
  const skill200 = await career.saveCareerRecord('skill', career.newSkill('Patient Counselling', 'clinical'));
  const ach200 = await career.saveCareerRecord('achievement', career.newAchievement('Best Poster — Level 200', 'competition'));

  check('records stamped Level 200', exp200.academic?.stageId === level200.id, JSON.stringify(exp200.academic));
  check('skill stamped Level 200', skill200.academic?.stageId === level200.id);
  const snap200Before = career.stageSnapshot(level200.id);
  check('snapshot counts are real', snap200Before.counts.lessons === 1 && snap200Before.counts.clinicalExperiences === 1,
    JSON.stringify(snap200Before.counts));

  // --- PROMOTE ---
  const promo = await academic.promote();
  check('promotion succeeded', promo.ok === true, promo.error);
  const level300 = promo.to;
  check('now on Level 300', level300?.level === '300', level300?.level);
  check('Level 200 archived, not deleted', academic.getStage(level200.id)?.status === 'completed');

  // Nothing was rewritten:
  check('lesson still Level 200', st().lessons.find((l) => l.id === l200Lesson.id)?.academic?.stageId === level200.id);
  check('ward round still Level 200', st().wardRounds.find((r) => r.id === l200Round.id)?.academic?.stageId === level200.id);
  check('clinical experience still Level 200', st().clinicalExperiences.find((e) => e.id === exp200.id)?.academic?.stageId === level200.id);
  check('skill still Level 200', st().skills.find((s) => s.id === skill200.id)?.academic?.stageId === level200.id);
  check('achievement still Level 200', st().achievements.find((a) => a.id === ach200.id)?.academic?.stageId === level200.id);

  const snap200After = career.stageSnapshot(level200.id);
  check('Level 200 snapshot unchanged by promotion',
    JSON.stringify(snap200After.counts) === JSON.stringify(snap200Before.counts),
    `${JSON.stringify(snap200Before.counts)} vs ${JSON.stringify(snap200After.counts)}`);

  // =====================================================================
  console.log('\nTEST 2 — new records associate with Level 300');
  const l300Lesson = defaults.newLesson('Beta blockers reduce mortality in HFrEF.', '2027-11-02');
  await st().save('lesson', l300Lesson);
  const proj300 = await career.saveCareerRecord('project', career.newProject('CLINICAL Rx Mobile', 'active'));
  const skill300 = await career.saveCareerRecord('skill', career.newSkill('React Native', 'technology'));

  check('new lesson is Level 300', st().lessons.find((l) => l.id === l300Lesson.id)?.academic?.stageId === level300.id);
  check('new project is Level 300', proj300.academic?.stageId === level300.id);
  check('new skill is Level 300', skill300.academic?.stageId === level300.id);
  const snap300 = career.stageSnapshot(level300.id);
  check('Level 300 snapshot counts only Level 300', snap300.counts.lessons === 1 && snap300.counts.projects === 1,
    JSON.stringify(snap300.counts));
  check('Level 200 lesson NOT counted in Level 300', snap300.counts.lessons === 1);

  // =====================================================================
  console.log('\nTEST 3 — Level 200 Archive remains accessible');
  const archive = career.stageArchive(level200.id);
  check('archive resolves the stage', archive.stage?.id === level200.id);
  const groupKeys = archive.groups.map((g) => g.key);
  check('archive contains lessons', groupKeys.includes('lesson'));
  check('archive contains ward rounds', groupKeys.includes('wardRound'));
  check('archive contains clinical experience', groupKeys.includes('clinicalExperience'));
  check('archive contains skills', groupKeys.includes('skill'));
  check('archive contains achievements', groupKeys.includes('achievement'));
  check('archive contains courses', groupKeys.includes('course'));
  const archLessons = archive.groups.find((g) => g.key === 'lesson').records;
  check('archived lesson is the Level 200 one', archLessons.length === 1 && archLessons[0].id === l200Lesson.id);
  check('archive excludes Level 300 project', !archive.groups.some((g) => g.records.some((r) => r.id === proj300.id)));

  const snapshots = career.allStageSnapshots();
  check('snapshots exist for both levels', snapshots.length >= 2, String(snapshots.length));

  // =====================================================================
  console.log('\nTEST 4 — clinical experience ↔ ward rounds');
  const linked = await career.linkRoundToExperience(exp200, l200Round.id);
  check('round linked explicitly', (linked.relatedRoundIds ?? []).includes(l200Round.id));
  const rounds = career.roundsInExperience(linked);
  check('rotation lists its ward round', rounds.some((r) => r.id === l200Round.id), String(rounds.length));
  const backExp = career.experienceForRound(l200Round.id);
  check('ward round resolves back to its rotation', backExp?.id === exp200.id);

  // Date-window inference works without an explicit link.
  const roundInWindow = await ward.startRound('Pharmacy Unit', '2026-11-15', 'Pharmacotherapy');
  check('a round inside the window is included', career.roundsInExperience(linked).some((r) => r.id === roundInWindow.id));

  // =====================================================================
  console.log('\nTEST 5 — skill shows its evidence');
  const ev = career.buildEvidence('clinicalExperience', exp200.id);
  check('evidence label captured from the real record', ev.label === 'Afrancho Polyclinic Rotation', ev.label);
  let skillWithEv = await career.attachEvidence('skill', st().skills.find((s) => s.id === skill200.id), ev);
  skillWithEv = await career.attachEvidence('skill', skillWithEv, career.buildEvidence('wardRound', l200Round.id));
  check('two evidence links attached', (skillWithEv.evidence ?? []).length === 2, String((skillWithEv.evidence ?? []).length));

  const resolved = career.resolveEvidence(skillWithEv.evidence);
  check('evidence resolves to live titles', resolved.every((r) => r.exists));
  check('evidence displays the rotation', resolved.some((r) => r.display === 'Afrancho Polyclinic Rotation'));

  const dupe = await career.attachEvidence('skill', skillWithEv, ev);
  check('duplicate evidence is not added twice', (dupe.evidence ?? []).length === 2);

  const backlinks = career.evidenceBacklinks('clinicalExperience', exp200.id);
  check('rotation knows which skills cite it', backlinks.some((b) => b.record.id === skill200.id));

  check('confidence stays user-controlled at 1', st().skills.find((s) => s.id === skill200.id).confidence === 1);

  // =====================================================================
  console.log('\nTEST 6 — project ↔ skills');
  const projLinked = await career.saveCareerRecord('project', { ...proj300, skillIds: [skill300.id] });
  check('project lists the skill', (projLinked.skillIds ?? []).includes(skill300.id));

  const ctx = intel.contextForRecord('skill', skill300.id);
  check('skill context surfaces the project', ctx.related.some((r) => r.id === proj300.id),
    ctx.related.map((r) => r.title).join(','));

  const ctxProj = intel.contextForRecord('project', proj300.id);
  check('project context resolves', !!ctxProj.focus);

  // =====================================================================
  console.log('\nTEST 7 — goal milestones drive real progress');
  let goal = await career.saveCareerRecord('goal', career.newGoal('Master cardiovascular pharmacotherapy', 'clinical'));
  check('goal starts NOT STARTED', goal.status === 'not-started');
  check('empty goal reports 0%', career.goalProgress(goal).percent === 0);

  goal = await career.addMilestone(goal, 'Review 50 medicines');
  goal = await career.addMilestone(goal, 'Complete clinical rotation');
  goal = await career.addMilestone(goal, 'Complete revision sessions');
  check('three milestones added', (goal.milestones ?? []).length === 3);
  check('progress still 0%', career.goalProgress(goal).percent === 0);

  goal = await career.toggleMilestone(goal, goal.milestones[0].id);
  const prog = career.goalProgress(goal);
  check('one of three complete => 33%', prog.percent === 33, JSON.stringify(prog));
  check('completing a milestone activates the goal', goal.status === 'active');
  check('completion timestamp recorded', typeof goal.milestones[0].doneAt === 'number');

  goal = await career.toggleMilestone(goal, goal.milestones[0].id);
  check('un-checking reverses progress', career.goalProgress(goal).percent === 0);
  check('the app never auto-completes a goal', goal.status !== 'completed');

  // =====================================================================
  console.log('\nTEST 8 — Career AI uses stored records only');
  const brief = portfolio.careerBrief();
  check('brief reports the real skill count', brief.includes('Patient Counselling'), brief.slice(0, 200));
  check('brief reports the real project', brief.includes('CLINICAL Rx Mobile'));
  check('brief includes the rotation', brief.includes('Afrancho Polyclinic'));
  check('brief never fabricates a credential', !/PhD|Fellowship|Award of Excellence/i.test(brief));

  const proRecords = intel.retrieveKnowledge({ domain: 'professional', limit: 50 });
  check('professional domain is retrievable', proRecords.total > 0, String(proRecords.total));
  const proTypes = new Set(proRecords.records.map((r) => r.module));
  check('skills reachable by AI', proTypes.has('skill'));
  check('projects reachable by AI', proTypes.has('project'));
  check('clinical experience reachable by AI', proTypes.has('clinicalExperience'));
  check('goals reachable by AI', proTypes.has('goal'));

  // The Career persona must be able to see professional sources.
  const orch = await server.ssrLoadModule('/src/services/aiOrchestrator.ts');
  const careerPersona = orch.PERSONAS.career;
  check('Career AI persona exists', !!careerPersona);
  check('Career AI prefers professional sources',
    (careerPersona.preferredSources ?? []).some((k) => ['skill', 'project', 'clinicalExperience'].includes(k)),
    JSON.stringify(careerPersona.preferredSources));
  check('Career AI is told not to invent achievements', /do not invent|never invent/i.test(careerPersona.system));

  // =====================================================================
  console.log('\nTEST 9 — everything works offline');
  check('navigator reports offline', dom.window.navigator.onLine === false);
  const offlineExp = await career.saveCareerRecord('clinicalExperience', career.newClinicalExperience('Offline Rotation', '2027-02-01'));
  check('created a record offline', !!offlineExp.id);
  const offlineSearch = intel.retrieveKnowledge({ query: 'rotation', limit: 20 });
  check('search works offline', offlineSearch.total > 0, String(offlineSearch.total));
  check('snapshots compute offline', !!career.stageSnapshot(level300.id));
  check('timeline builds offline', career.professionalTimeline().length > 0);
  check('journey summary builds offline', !!career.journeySummary().stage);
  await career.deleteCareerRecord('clinicalExperience', offlineExp.id);
  check('deleted offline', !st().clinicalExperiences.some((e) => e.id === offlineExp.id));

  // =====================================================================
  console.log('\nTEST 10 — portfolio export includes only selected records');
  // Everything starts PRIVATE.
  check('records default to private', st().skills.every((s) => s.visibility === 'private'));
  check('nothing is portfolio-visible yet', career.portfolioRecords().length === 0);

  const skillLive = st().skills.find((s) => s.id === skill200.id);
  await career.setVisibility('skill', skillLive, 'portfolio');
  const projLive = st().projects.find((p) => p.id === proj300.id);
  await career.setVisibility('project', projLive, 'export');

  const inPortfolio = career.portfolioRecords();
  const portfolioIds = inPortfolio.flatMap((g) => g.records.map((r) => r.id));
  check('portfolio contains the promoted skill', portfolioIds.includes(skill200.id));
  check('portfolio contains the export-marked project', portfolioIds.includes(proj300.id));
  check('portfolio excludes the private achievement', !portfolioIds.includes(ach200.id));
  check('portfolio excludes the private rotation', !portfolioIds.includes(exp200.id));

  const exportOnly = career.exportableRecords();
  const exportIds = exportOnly.flatMap((g) => g.records.map((r) => r.id));
  check('export set contains only EXPORT records', exportIds.includes(proj300.id) && !exportIds.includes(skill200.id),
    exportIds.join(','));

  const md = portfolio.portfolioToMarkdown();
  check('portfolio export includes the promoted skill', md.includes('Patient Counselling'));
  check('portfolio export excludes the private achievement', !md.includes('Best Poster'));
  check('portfolio export excludes the private rotation', !md.includes('Afrancho Polyclinic'));

  const cv = portfolio.buildCv();
  check('CV has the standard sections', cv.sections.length >= 5, String(cv.sections.length));
  const cvText = portfolio.cvToMarkdown(cv);
  check('CV uses only portfolio-visible records', cvText.includes('Patient Counselling') && !cvText.includes('Best Poster'));
  check('CV carries the AI/review disclaimer flag', cv.reviewNotice.includes('REVIEW'));

  // Sensitive credential must never be exported by default.
  const cert = await career.saveCareerRecord('certification',
    Object.assign(career.newCertification('BLS Provider'), { issuer: 'Red Cross', credentialId: 'SECRET-12345', visibility: 'portfolio' }));
  const md2 = portfolio.portfolioToMarkdown();
  check('certification title exported', md2.includes('BLS Provider'));
  check('credential number NOT exported', !md2.includes('SECRET-12345'));

  // =====================================================================
  console.log('\nTEST 11 — deleting a project leaves skills intact');
  const skillCiting = await career.attachEvidence(
    'skill',
    st().skills.find((s) => s.id === skill300.id),
    career.buildEvidence('project', proj300.id)
  );
  check('skill cites the project as evidence', (skillCiting.evidence ?? []).some((e) => e.id === proj300.id));

  const skillsBefore = st().skills.length;
  await career.deleteCareerRecord('project', proj300.id);
  check('project deleted', !st().projects.some((p) => p.id === proj300.id));
  check('skill count unchanged', st().skills.length === skillsBefore);

  const survivor = st().skills.find((s) => s.id === skill300.id);
  check('the skill itself survived', !!survivor);
  check('its evidence link was NOT silently removed', (survivor.evidence ?? []).some((e) => e.id === proj300.id));

  const resolvedAfter = career.resolveEvidence(survivor.evidence);
  const dangling = resolvedAfter.find((r) => r.id === proj300.id);
  check('dangling evidence reports it is missing', dangling && dangling.exists === false);
  check('and degrades to a clear message', /no longer exists/.test(dangling.display), dangling?.display);

  // =====================================================================
  console.log('\nTEST 12 — search finds a skill across the app');
  const skillHit = intel.retrieveKnowledge({ query: 'Patient Counselling', limit: 20 });
  check('skill found by name', skillHit.records.some((r) => r.id === skill200.id), String(skillHit.total));

  const techHit = intel.retrieveKnowledge({ query: 'React Native', limit: 20 });
  check('technology skill found', techHit.records.some((r) => r.id === skill300.id));

  const rotationHit = intel.retrieveKnowledge({ query: 'Afrancho', limit: 20 });
  check('clinical experience found by institution', rotationHit.records.some((r) => r.id === exp200.id));

  const goalHit = intel.retrieveKnowledge({ query: 'cardiovascular pharmacotherapy', limit: 20 });
  check('goal is searchable', goalHit.records.some((r) => r.module === 'goal'), goalHit.records.map((r) => r.module).join(','));

  const certHit = intel.retrieveKnowledge({ query: 'BLS', limit: 20 });
  check('certification is searchable', certHit.records.some((r) => r.id === cert.id));
  check('credential id is NOT indexed', !JSON.stringify(certHit.records).includes('SECRET-12345'));

  const sourceKeys = intel.listSources().map((s) => s.key);
  for (const k of ['clinicalExperience', 'skill', 'achievement', 'certification', 'project', 'research', 'leadership', 'goal']) {
    check(`${k} registered with the Intelligence Layer`, sourceKeys.includes(k));
  }

  // =====================================================================
  console.log('\nEXTRA — multi-stage journey, growth, timeline');
  const internship = await academic.addStage(
    { level: 'INTERN', academicYear: '2029/2030', status: 'upcoming', programme: 'PharmD' },
    ['Block 1', 'Block 2']
  );
  check('a non-numeric stage can be added', internship.level === 'INTERN');
  check('stages are not hard-coded to 200/300/400', academic.allStages().some((s) => s.level === 'INTERN'));

  const growth = career.knowledgeGrowth();
  check('growth has a row per stage', growth.length === academic.allStages().length, String(growth.length));
  const g200 = growth.find((r) => r.stageId === level200.id);
  check('Level 200 growth uses real counts', g200.wardRounds >= 1, JSON.stringify(g200));

  const cmp = career.compareStages(level200.id, level300.id);
  check('comparison returns both snapshots', !!cmp.a && !!cmp.b);
  check('comparison computes a delta', cmp.rows.some((r) => r.delta !== 0));

  const tl = career.professionalTimeline();
  check('timeline includes academic stages', tl.some((e) => e.type === 'Academic stage'));
  check('timeline includes clinical experience', tl.some((e) => e.type === 'Clinical experience'));
  check('timeline is sorted newest first', tl.every((e, i) => i === 0 || tl[i - 1].date >= e.date));
  const byYear = career.timelineByYear();
  check('timeline groups by year', byYear.length > 0 && byYear[0].events.length > 0);

  const gaps = career.skillEvidenceGaps();
  check('evidence gaps are reported, weakest first', gaps.length > 0 && gaps[0].evidenceCount <= gaps[gaps.length - 1].evidenceCount);

  const summary = career.journeySummary();
  check('journey summary reports the current stage', summary.stage?.id === level300.id);

  // --- Bundler integration (must not disturb existing bundling) ---
  const engine = await server.ssrLoadModule('/src/services/bundleEngine.ts');
  check('professional sources registered for bundling',
    engine.PROFESSIONAL_SOURCE_KEYS.includes('clinicalExperience') && engine.PROFESSIONAL_SOURCE_KEYS.includes('skill'));
  check('existing learning bundle sources are unchanged',
    !engine.BUNDLE_SOURCE_KEYS.some((k) => engine.PROFESSIONAL_SOURCE_KEYS.includes(k)),
    engine.BUNDLE_SOURCE_KEYS.join(','));
  check('a combined source list is available', engine.ALL_BUNDLE_SOURCE_KEYS.length ===
    engine.BUNDLE_SOURCE_KEYS.length + engine.PROFESSIONAL_SOURCE_KEYS.length);

  // A normal day bundle must NOT sweep in professional records.
  const learningBundle = await engine.createDayBundle('2026-11-02', 'Learning day');
  const sweptTypes = new Set((learningBundle.snapshot ?? []).map((i) => i.sourceType));
  check('default bundling still excludes professional records',
    !engine.PROFESSIONAL_SOURCE_KEYS.some((k) => sweptTypes.has(k)),
    [...sweptTypes].join(','));
  check('default bundling still captures learning', sweptTypes.size > 0);

  // An opt-in professional bundle CAN include them.
  const proBundle = await engine.generateSnapshot({
    type: 'manual-custom',
    title: 'Professional development',
    selection: { from: '2026-01-01', to: '2030-12-31', modules: engine.PROFESSIONAL_SOURCE_KEYS },
    creationMethod: 'manual',
  });
  const proTypes2 = new Set((proBundle.snapshot ?? []).map((i) => i.sourceType));
  check('opt-in professional bundle captures career records',
    engine.PROFESSIONAL_SOURCE_KEYS.some((k) => proTypes2.has(k)),
    [...proTypes2].join(','));
  check('professional bundle labels are registered', !!engine.MODULE_LABELS.clinicalExperience);
  check('journey summary counts professional records', summary.professional.achievements >= 1);
  check('journey summary lists active goals', Array.isArray(summary.goals.active));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 6 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 6 ACCEPTANCE TESTS PASSED ✔');
