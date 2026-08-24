/**
 * CLINICAL Rx — PHASE 5 acceptance tests (Unified AI Intelligence Engine).
 *
 *   TEST 1  offline + local AI configured -> AI works
 *   TEST 2  offline + no local AI -> clear unavailable message
 *   TEST 3  cloud on: "What did I learn about statins?" retrieves real records
 *   TEST 4  "Find all my unanswered questions about hypertension"
 *   TEST 5  "What did I learn during my last ward round?"
 *   TEST 6  "Quiz me on what I learned this week"
 *   TEST 7  "Explain this medicine" passes record + connected context
 *   TEST 8  AI Search results show source records
 *   TEST 9  creating a learning note asks for confirmation first
 *   TEST 10 deleting/writing via AI requires confirmation
 *   TEST 11 changing Clinical AI config affects only Clinical AI
 *   TEST 12 LOCAL ONLY never calls cloud
 *   TEST 13 CLOUD ONLY never uses local
 *   TEST 14 AUTO follows the fallback rules
 *   TEST 15 normal search works with no internet and no AI
 *
 * No network is ever touched: providers are replaced with recording fakes.
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

const setOnline = (v) => Object.defineProperty(dom.window.navigator, 'onLine', { value: v, configurable: true });
setOnline(false);

// Any accidental real network call must fail the test loudly.
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
  const ward = await server.ssrLoadModule('/src/services/wardRounds.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const orch = await server.ssrLoadModule('/src/services/aiOrchestrator.ts');
  const provider = await server.ssrLoadModule('/src/services/aiProvider.ts');
  const tools = await server.ssrLoadModule('/src/services/aiToolRegistry.ts');
  const intel = await server.ssrLoadModule('/src/services/intelligence.ts');
  const svc = await server.ssrLoadModule('/src/services/aiService.ts');
  const convs = await server.ssrLoadModule('/src/services/aiConversations.ts');

  const st = () => useData.getState();
  await st().init();

  // ---- Recording fake providers (no network, no keys) ----
  const calls = { cloud: [], local: [] };
  let localOk = false;

  const fakeCloud = {
    runtime: 'cloud',
    label: 'Cloud AI (fake)',
    isAvailable: (c) => !!c?.enabled && !!c.apiKey?.trim(),
    requiresNetwork: () => true,
    async generate(req, config) {
      calls.cloud.push({ system: req.system, prompt: req.prompt, model: config?.model, temperature: req.temperature });
      if (req.system.includes('VALID JSON') || req.prompt.includes('VALID JSON')) {
        return { ok: true, text: JSON.stringify({ title: 'Test quiz', questions: [], summary: 's', key_points: [], questions: [], weak_areas: [] }) };
      }
      return { ok: true, text: 'CLOUD_REPLY' };
    },
  };
  const fakeLocal = {
    runtime: 'local',
    label: 'Local AI (fake)',
    isAvailable: () => localOk,
    requiresNetwork: () => false,
    async generate(req) {
      calls.local.push({ system: req.system, prompt: req.prompt });
      return { ok: true, text: 'LOCAL_REPLY' };
    },
  };
  provider.registerProvider(fakeCloud);
  provider.registerProvider(fakeLocal);

  // localReady() drives availability; patch the module's detector state by
  // registering our fake and overriding the readiness probe.
  const localAi = await server.ssrLoadModule('/src/services/localAi.ts');
  const realDetect = localAi.detectLocalAi;
  // Re-register after localAi's installLocalProvider() may overwrite it.
  const reinstall = () => provider.registerProvider(fakeLocal);

  // ---- Seed real data ----
  const boot = await academic.bootstrapJourney({ level: '300', academicYear: '2026/2027', semesterName: 'Semester 1' });
  const prof = defaults.newProfile('Ama');
  prof.programme = 'Pharmacy';
  prof.level = '300';
  prof.currentStageId = boot.stage.id;
  prof.currentPeriodId = boot.period?.id;
  await st().saveProfile(prof);

  const today = defaults.todayIso();
  const w = ward.weekBounds(today);
  const inWeek = w.start;

  const statinNote = defaults.newLesson('Statins inhibit HMG-CoA reductase and lower LDL cholesterol.', inWeek);
  statinNote.tags = ['cardiology', 'statins'];
  await st().save('lesson', statinNote);

  const atorva = defaults.newMedicine('Atorvastatin');
  atorva.lastSeen = inWeek;
  atorva.class = 'Statin';
  await st().save('medicine', atorva);

  const htn = defaults.newDisease('Hypertension');
  await st().save('disease', htn);

  const q1 = defaults.newQuestion('What is the target BP in hypertension with diabetes?');
  q1.answer = '';
  q1.tags = ['hypertension'];
  await st().save('question', q1);
  const q2 = defaults.newQuestion('Which hypertension drug class causes a dry cough?');
  q2.answer = 'ACE inhibitors.';
  q2.tags = ['hypertension'];
  await st().save('question', q2);

  const round = await ward.startRound('Medical Ward', inWeek, 'Pharmacotherapy');
  await ward.addEntry(round.id, 'medicine', 'Atorvastatin', 'Started for secondary prevention.');
  await ward.addEntry(round.id, 'condition', 'Hyperlipidaemia', 'Reviewed lipid targets.');

  // Helper: set a module's config.
  // Settings start null until the app writes them once.
  if (!st().settings) await st().saveSettings(defaults.newSettings());

  const setCfg = async (key, patch) => {
    const s = st().settings ?? defaults.newSettings();
    const ai = { ...(s.ai ?? {}) };
    ai[key] = { ...(ai[key] ?? {}), ...patch };
    await st().saveSettings({ ...s, ai });
    await orch.refreshKeyCache();
  };
  const cloudOn = async (mode = 'auto') => {
    for (const m of defaults.AI_MODULES) {
      await setCfg(m.key, { enabled: true, apiKey: 'sk-test', model: 'test-model', provider: 'openai', mode });
    }
  };
  const cloudOff = async () => {
    for (const m of defaults.AI_MODULES) await setCfg(m.key, { enabled: true, apiKey: '', mode: 'auto' });
  };

  // =====================================================================
  console.log('\nTEST 1 — offline + local AI configured -> AI works');
  await cloudOff();
  setOnline(false);
  localOk = true;
  reinstall();
  const t1 = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('AI answered while offline', t1.ok === true, t1.error);
  check('it ran on the local runtime', t1.runtime === 'local');
  check('no cloud call was made', calls.cloud.length === 0);

  // =====================================================================
  console.log('\nTEST 2 — offline + no local AI -> clear unavailable message');
  localOk = false;
  reinstall();
  const t2 = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('request refused', t2.ok === false);
  check(
    'exact required message shown',
    t2.error === 'Internet is unavailable and no local AI model is configured.',
    t2.error
  );
  check('no fabricated answer', !t2.text);

  // =====================================================================
  console.log('\nTEST 3 — cloud on: "What did I learn about statins?"');
  setOnline(true);
  localOk = false;
  reinstall();
  await cloudOn('cloud');
  calls.cloud.length = 0;
  const t3 = await orch.askAi({ persona: 'general', query: 'What did I learn about statins?' });
  check('AI answered', t3.ok === true, t3.error);
  check('real records retrieved', t3.sources.length > 0, String(t3.sources.length));
  const t3titles = t3.sources.map((s) => s.title.toLowerCase()).join(' | ');
  check('statin knowledge is among the sources', /statin|atorvastatin/.test(t3titles), t3titles);
  check('context was injected into the prompt', /HMG-CoA|Atorvastatin/i.test(calls.cloud[0].system));
  check(
    'the whole database was NOT sent',
    !calls.cloud[0].system.includes('Hyperlipidaemia') || calls.cloud[0].system.length < 20000,
    `system prompt ${calls.cloud[0].system.length} chars`
  );

  // =====================================================================
  console.log('\nTEST 4 — "Find all my unanswered questions about hypertension"');
  const unanswered = await tools.runTool({
    tool: 'getQuestions',
    args: { query: 'hypertension', unansweredOnly: true },
  });
  check('read tool ran without confirmation', unanswered.status === 'ok');
  const uq = unanswered.status === 'ok' ? unanswered.result.records : [];
  check('found the unanswered question', uq.some((r) => /target BP/i.test(r.title)), JSON.stringify(uq.map((r) => r.title)));
  check('excluded the answered one', !uq.some((r) => /dry cough/i.test(r.title)));

  // =====================================================================
  console.log('\nTEST 5 — "What did I learn during my last ward round?"');
  const lastRound = await tools.runTool({ tool: 'getWardRounds', args: { latest: true } });
  check('ward round retrieved', lastRound.status === 'ok' && lastRound.result.records.length === 1);
  const entries = lastRound.status === 'ok' ? lastRound.result.entries ?? [] : [];
  check('its captured learning came with it', entries.length >= 2, String(entries.length));

  calls.cloud.length = 0;
  const t5 = await orch.askAi({ persona: 'general', query: 'What did I learn during my last ward round?' });
  check('AI answered the ward-round question', t5.ok === true);
  check('ward context reached the model', /ward|Atorvastatin|Hyperlipidaemia/i.test(calls.cloud[0].system));

  // =====================================================================
  console.log('\nTEST 6 — "Quiz me on what I learned this week"');
  const intent6 = orch.detectIntent('Quiz me on what I learned this week');
  check('intent detected as quiz', intent6.intent === 'quiz', intent6.intent);
  check('this week resolved to a date range', intent6.range?.from === w.start && intent6.range?.to === w.end);
  const weekProbe = intel.retrieveKnowledge({ dateRange: { from: w.start, to: w.end }, limit: 60 });
  check('the week contains records to quiz on', weekProbe.total > 0, String(weekProbe.total));

  // =====================================================================
  console.log('\nTEST 7 — "Explain this medicine" passes record + connected context');
  calls.cloud.length = 0;
  const t7 = await svc.explainRecord('medicine', atorva.id);
  check('explanation produced', t7.ok === true, t7.error);
  check('the focused record is a source', t7.sources.some((s) => s.id === atorva.id));
  check('connected records came too', t7.sources.length > 1, String(t7.sources.length));
  check('FOCUS RECORD framing used', /FOCUS RECORD/.test(calls.cloud[0].system));

  // =====================================================================
  console.log('\nTEST 8 — AI Search results show source records');
  const t8 = await svc.aiSearch('statins');
  check('search returned records', t8.records.length > 0);
  check('sources carry type + id for Open Source', t8.records.every((r) => !!r.type && !!r.id));
  check('AI narrative attached', t8.aiUsed === true);

  // =====================================================================
  console.log('\nTEST 9 — creating a learning note asks for confirmation first');
  const notesBefore = st().lessons.length;
  const t9 = await tools.runTool({ tool: 'createLearningNote', args: { title: 'AI note', content: 'body' } });
  check('write tool blocked pending confirmation', t9.status === 'needs-confirmation', t9.status);
  check('nothing was written', st().lessons.length === notesBefore);
  check('a human-readable confirmation label was produced', /AI note/.test(t9.label ?? ''), t9.label);

  const token = 'tok-1';
  tools.grantConfirmation(token);
  const t9b = await tools.runTool({ tool: 'createLearningNote', args: { title: 'AI note', content: 'body' } }, token);
  check('runs once confirmed', t9b.status === 'ok', JSON.stringify(t9b));
  check('the note now exists', st().lessons.length === notesBefore + 1);

  const t9c = await tools.runTool({ tool: 'createLearningNote', args: { title: 'Again', content: 'x' } }, token);
  check('the confirmation token is single-use', t9c.status === 'needs-confirmation');

  // =====================================================================
  console.log('\nTEST 10 — every write tool requires confirmation');
  let allGated = true;
  for (const name of Object.keys(tools.WRITE_TOOLS)) {
    const r = await tools.runTool({ tool: name, args: {} });
    if (r.status !== 'needs-confirmation') {
      allGated = false;
      console.error(`     ${name} was NOT gated (${r.status})`);
    }
  }
  check('all write tools are gated', allGated);
  check('read and write registries are disjoint', Object.keys(tools.READ_TOOLS).every((k) => !(k in tools.WRITE_TOOLS)));
  check('an unknown tool is rejected', (await tools.runTool({ tool: 'dropDatabase' })).status === 'error');

  // =====================================================================
  console.log('\nTEST 11 — changing Clinical AI config affects only Clinical AI');
  const clinicalKey = orch.personaConfigKey('clinical');
  const revisionKey = orch.personaConfigKey('revision');
  await setCfg(clinicalKey, { model: 'clinical-only-model', temperature: 0.1, mode: 'cloud' });
  const clinicalCfg = orch.personaConfig('clinical');
  const revisionCfg = orch.personaConfig('revision');
  const generalCfg = orch.personaConfig('general');
  check('clinical picked up its new model', clinicalCfg.model === 'clinical-only-model');
  check('revision kept its own model', revisionCfg.model !== 'clinical-only-model', revisionCfg.model);
  check('general kept its own model', generalCfg.model !== 'clinical-only-model', generalCfg.model);
  check('clinical temperature isolated', clinicalCfg.temperature === 0.1 && revisionCfg.temperature !== 0.1);
  check('config keys really are distinct', clinicalKey !== revisionKey);

  calls.cloud.length = 0;
  await orch.askAi({ persona: 'clinical', query: 'Explain atorvastatin.' });
  check('clinical request used the clinical model', calls.cloud.at(-1)?.model === 'clinical-only-model');
  await orch.askAi({ persona: 'revision', query: 'What should I revise?' });
  check('revision request did NOT use it', calls.cloud.at(-1)?.model !== 'clinical-only-model', calls.cloud.at(-1)?.model);

  // =====================================================================
  console.log('\nTEST 12 — LOCAL ONLY never calls cloud');
  await cloudOn('local');
  setOnline(true);
  localOk = true;
  reinstall();
  calls.cloud.length = 0;
  calls.local.length = 0;
  const t12 = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('answered locally', t12.ok === true && t12.runtime === 'local', t12.error);
  check('zero cloud calls', calls.cloud.length === 0);

  localOk = false;
  reinstall();
  const t12b = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('local-only fails rather than falling back to cloud', t12b.ok === false);
  check('no silent switch to cloud', calls.cloud.length === 0);
  check('reason explains local-only', /local/i.test(t12b.error ?? ''), t12b.error);

  // =====================================================================
  console.log('\nTEST 13 — CLOUD ONLY never uses local');
  await cloudOn('cloud');
  localOk = true;
  reinstall();
  setOnline(true);
  calls.cloud.length = 0;
  calls.local.length = 0;
  const t13 = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('answered via cloud', t13.ok === true && t13.runtime === 'cloud', t13.error);
  check('zero local calls', calls.local.length === 0);

  setOnline(false);
  const t13b = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('cloud-only offline fails rather than using local', t13b.ok === false);
  check('still zero local calls', calls.local.length === 0);

  // =====================================================================
  console.log('\nTEST 14 — AUTO follows the fallback rules');
  await cloudOn('auto');
  setOnline(true);
  localOk = true;
  reinstall();
  calls.cloud.length = 0;
  calls.local.length = 0;
  const t14a = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('AUTO prefers local when available', t14a.runtime === 'local', t14a.runtime);

  localOk = false;
  reinstall();
  calls.cloud.length = 0;
  const t14b = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('AUTO falls back to cloud when local is gone', t14b.ok === true && t14b.runtime === 'cloud', t14b.runtime);
  check('cloud was actually called', calls.cloud.length === 1);

  setOnline(false);
  const t14c = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('AUTO offline with nothing available reports clearly', t14c.ok === false);
  check(
    'the offline message is the specified one',
    t14c.error === 'Internet is unavailable and no local AI model is configured.',
    t14c.error
  );

  // Announce the switch when AUTO changes runtime mid-request.
  setOnline(true);
  localOk = true;
  reinstall();
  const failingLocal = {
    runtime: 'local',
    label: 'Local (failing)',
    isAvailable: () => true,
    requiresNetwork: () => false,
    async generate() {
      return { ok: false, error: 'local model crashed' };
    },
  };
  provider.registerProvider(failingLocal);
  const t14d = await orch.askAi({ persona: 'general', query: 'Explain statins.' });
  check('AUTO recovered via cloud', t14d.ok === true && t14d.runtime === 'cloud', t14d.error);
  check('the switch was announced to the user', !!t14d.fallbackNotice, t14d.fallbackNotice);
  reinstall();

  // =====================================================================
  console.log('\nTEST 15 — normal search works with no internet and no AI');
  setOnline(false);
  localOk = false;
  reinstall();
  await cloudOff();
  const avail15 = orch.availability('general');
  check('AI correctly reports unavailable', avail15.effective === 'none');

  const search15 = intel.retrieveKnowledge({ query: 'statins', limit: 10 });
  check('deterministic search still returns results', search15.total > 0, String(search15.total));
  check('and finds the right record', search15.records.some((r) => /statin|atorvastatin/i.test(r.title)));

  const aiSearch15 = await svc.aiSearch('statins');
  check('AI Search degrades gracefully to plain results', aiSearch15.records.length > 0 && aiSearch15.aiUsed === false);
  check('and explains why AI was skipped', !!aiSearch15.aiError, aiSearch15.aiError);

  const wardSearch = intel.retrieveKnowledge({ query: 'hypertension', limit: 10 });
  check('search reaches every module offline', wardSearch.total > 0);

  // =====================================================================
  console.log('\nEXTRA — orchestrator plumbing');
  const log = orch.aiLog();
  check('activity was logged', log.length > 0, String(log.length));
  check('no API key was ever logged', !JSON.stringify(log).includes('sk-test'));
  check('log records duration + module', log.every((e) => typeof e.durationMs === 'number' && !!e.module));
  const usage = orch.aiUsage();
  check('usage summary counts requests', usage.requests === log.length);
  check('usage tracks failures', usage.failures > 0);

  const c = convs.createConversation('clinical', 'New conversation');
  convs.appendMessage(c.id, { role: 'user', content: 'What is amlodipine?' });
  convs.appendMessage(c.id, { role: 'assistant', content: 'A calcium channel blocker.', sources: [] });
  const reloaded = convs.getConversation(c.id);
  check('conversation persisted', reloaded?.messages.length === 2);
  check('auto-titled from the first message', reloaded.title.startsWith('What is amlodipine'));
  check('history is replayable as short-term memory', convs.historyFor(reloaded).length === 2);
  convs.renameConversation(c.id, 'Amlodipine');
  check('rename works', convs.getConversation(c.id).title === 'Amlodipine');
  check('export includes the exchange', convs.exportConversation(convs.getConversation(c.id)).includes('calcium channel blocker'));
  convs.deleteConversation(c.id);
  check('delete works', convs.getConversation(c.id) === null);

  check('seven AI personas registered', Object.keys(orch.PERSONAS).length === 7, Object.keys(orch.PERSONAS).join(','));
  check('every persona has a system prompt', Object.values(orch.PERSONAS).every((p) => p.system.length > 40));
  // The safety contract is composed into the prompt at request time.
  setOnline(true);
  localOk = false;
  reinstall();
  await cloudOn('cloud');
  calls.cloud.length = 0;
  await orch.askAi({ persona: 'clinical', query: 'Is this dose safe?' });
  const clinicalPrompt = calls.cloud.at(-1)?.system ?? '';
  check('clinical prompt says it is not a clinician', /never a licensed clinician/i.test(clinicalPrompt));
  check('clinical prompt demands verification', /verify against approved guidelines/i.test(clinicalPrompt));
  check('clinical prompt forbids fabricating sources', /Never fabricate sources/i.test(clinicalPrompt));
  check('clinical prompt forbids patient identification', /never ask for or infer patient identity/i.test(clinicalPrompt));

  check('JSON extraction handles fenced output', svc.extractJson('```json\n{"a":1}\n```')?.a === 1);
  check('JSON extraction handles prose around it', svc.extractJson('Sure! {"b":[1,2]} done')?.b.length === 2);
  check('JSON extraction returns null on garbage', svc.extractJson('no json here') === null);

  const intentSearch = orch.detectIntent('Find all my unanswered questions about hypertension');
  check('search intent detected', intentSearch.intent === 'search', intentSearch.intent);
  check('stopwords stripped from terms', !intentSearch.terms.includes('all') && intentSearch.terms.includes('hypertension'), intentSearch.terms);
  const intentLevel = orch.detectIntent('What did I learn in Level 300?');
  check('academic level extracted', intentLevel.level === '300');
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 5 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 5 ACCEPTANCE TESTS PASSED ✔');
