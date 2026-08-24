/**
 * CLINICAL Rx — PHASE 11 feature tests.
 *
 *   1  Decline to a previous level: reversible, lossless, records editable
 *   2  App Lock security question for a forgotten PIN
 *   3  Each AI works independently — one generating never blocks another
 *   4  Each AI keeps its own conversation list; sidebar is hideable
 *
 * Runs fully offline.
 */
import { readFileSync } from 'node:fs';
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
Object.defineProperty(dom.window.navigator, 'onLine', { value: false, configurable: true });

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
  const appLock = await server.ssrLoadModule('/src/services/appLock.ts');
  const convs = await server.ssrLoadModule('/src/services/aiConversations.ts');

  const st = () => useData.getState();
  await st().init();
  if (!st().settings) await st().saveSettings(defaults.newSettings());
  if (!st().profile) await st().saveProfile(defaults.newProfile('Ama'));

  // =====================================================================
  console.log('\n1 — DECLINE TO A PREVIOUS LEVEL');

  await academic.addStage({ level: '200', academicYear: '2023/2024', status: 'current' });

  // Work done at Level 200.
  await st().save('lesson', { id: 'p11-l200', title: 'Level 200 note', content: 'Pharmacology basics.', createdAt: Date.now(), updatedAt: Date.now() });
  const l200Stamp = st().lessons.find((l) => l.id === 'p11-l200')?.academic?.level;

  await academic.addStage({ level: '300', academicYear: '2024/2025', status: 'upcoming' });
  await academic.promote();
  check('promoted to Level 300', academic.currentStage()?.level === '300', academic.currentStage()?.level);

  await st().save('lesson', { id: 'p11-l300', title: 'Level 300 note', content: 'Therapeutics.', createdAt: Date.now(), updatedAt: Date.now() });

  // ---- the new capability ----
  const plan = academic.planDemotion();
  check('a decline target is offered', !!plan.to, plan.reason);
  check('the target is the completed Level 200', plan.to?.level === '200', plan.to?.level);

  const lessonsBefore = st().lessons.length;
  const res = await academic.demote(plan.to.id);
  check('decline succeeds', res.ok, res.error);
  check('current level is Level 200 again', academic.currentStage()?.level === '200', academic.currentStage()?.level);
  check('profile points back at Level 200', st().profile?.level === '200', st().profile?.level);

  // Nothing may be lost or rewritten.
  check('no records lost when going back', st().lessons.length === lessonsBefore, `${lessonsBefore} -> ${st().lessons.length}`);
  check('Level 300 work still exists after declining', st().lessons.some((l) => l.id === 'p11-l300'));
  check('Level 200 work still exists', st().lessons.some((l) => l.id === 'p11-l200'));
  check('Level 200 note keeps its original stamp', st().lessons.find((l) => l.id === 'p11-l200')?.academic?.level === l200Stamp);

  const l300stage = academic.allStages().find((s) => s.level === '300');
  check('Level 300 is reopened as upcoming, not deleted', !!l300stage && l300stage.status === 'upcoming', l300stage?.status);
  check('Level 300 keeps its academic year', l300stage?.academicYear === '2024/2025', l300stage?.academicYear);

  // Records from the level you went back to must be editable again.
  const editable = st().lessons.find((l) => l.id === 'p11-l200');
  await st().save('lesson', { ...editable, content: 'Edited after going back.', updatedAt: Date.now() });
  check('records at the restored level can still be edited', st().lessons.find((l) => l.id === 'p11-l200')?.content === 'Edited after going back.');

  // Round trip must be lossless.
  const beforeRoundTrip = st().lessons.length;
  await academic.promote();
  check('can progress forward again after declining', academic.currentStage()?.level === '300', academic.currentStage()?.level);
  check('round trip 300→200→300 loses nothing', st().lessons.length === beforeRoundTrip);
  check('the edit made at Level 200 survived the round trip', st().lessons.find((l) => l.id === 'p11-l200')?.content === 'Edited after going back.');

  // Guard rails.
  await academic.demote();
  const atEarliest = academic.allStages()[0];
  if (academic.currentStage()?.id === atEarliest.id) {
    const noneLeft = academic.planDemotion();
    check('no decline offered at the earliest level', !noneLeft.to && !!noneLeft.reason, JSON.stringify(noneLeft));
    const bad = await academic.demote();
    check('declining past the earliest level fails safely', !bad.ok && !!bad.error, bad.error);
  }

  // =====================================================================
  console.log('\n2 — APP LOCK: SECURITY QUESTION FOR A FORGOTTEN PIN');

  const PIN = '835211';
  const enabled = await appLock.enablePin(PIN);
  check('PIN lock can be enabled', enabled.ok, enabled.error);
  check('no recovery question exists initially', !appLock.hasRecoveryQuestion());

  const Q = 'What ward was my first clinical rotation on?';
  const bad1 = await appLock.setRecoveryQuestion(Q, 'Medical', '000000');
  check('setting a question REQUIRES the correct PIN', !bad1.ok, bad1.error);

  const short = await appLock.setRecoveryQuestion('Ward?', 'Medical Ward', PIN);
  check('a too-short question is rejected', !short.ok, short.error);
  const shortAnswer = await appLock.setRecoveryQuestion(Q, 'ab', PIN);
  check('a too-short answer is rejected', !shortAnswer.ok, shortAnswer.error);

  const saved = await appLock.setRecoveryQuestion(Q, '  The Medical Ward!  ', PIN);
  check('a valid question is saved', saved.ok, saved.error);
  check('hasRecoveryQuestion() now true', appLock.hasRecoveryQuestion());
  check('the question is readable for display', appLock.recoveryQuestion() === Q);

  // The answer must never be stored in readable form.
  const rawConfig = JSON.stringify(localStorage.getItem('clinical-rx:app-lock') ?? '');
  check('the plaintext ANSWER is never stored', !/medical\s*ward/i.test(rawConfig), rawConfig.slice(0, 200));
  check('the plaintext PIN is never stored', !rawConfig.includes(PIN));

  // Wrong answer must not unlock.
  const wrong = await appLock.recoverWithAnswer('Surgical ward', '445566');
  check('a wrong answer is rejected', !wrong.ok, wrong.error);
  check('the wrong answer reports remaining attempts', /attempt/i.test(wrong.error ?? ''), wrong.error);

  // Weak new PIN rejected even with a correct answer.
  const weak = await appLock.recoverWithAnswer('medical ward', '1234');
  check('a weak replacement PIN is rejected', !weak.ok, weak.error);

  // Correct answer, tolerant of case/punctuation/spacing.
  const NEW_PIN = '907413';
  const recovered = await appLock.recoverWithAnswer('medical ward', NEW_PIN);
  check('the correct answer resets the PIN (case/punctuation/article tolerant)', recovered.ok, recovered.error);

  appLock.lockNow();
  const oldFails = await appLock.unlock(PIN);
  check('the OLD pin no longer works', !oldFails.ok, oldFails.error);
  const newWorks = await appLock.unlock(NEW_PIN);
  check('the NEW pin unlocks the app', newWorks.ok, newWorks.error);

  // Recovery must never be a data-destroying escape hatch.
  check('recovery did not delete any records', st().lessons.length >= 2, `${st().lessons.length}`);
  check('the question survives a recovery for next time', appLock.hasRecoveryQuestion());

  const cleared = await appLock.clearRecoveryQuestion(NEW_PIN);
  check('the question can be removed with the PIN', cleared.ok, cleared.error);
  check('recovery is unavailable once removed', !appLock.hasRecoveryQuestion());
  const noQ = await appLock.recoverWithAnswer('medical ward', '221144');
  check('recovery fails cleanly when no question is set', !noQ.ok, noQ.error);

  await appLock.disableLock(NEW_PIN);

  // =====================================================================
  console.log('\n3 — EACH AI IS INDEPENDENT (no cross-blocking)');

  const src = readFileSync('src/pages/AiWorkspace.tsx', 'utf8');

  check('busy state is keyed per conversation', src.includes('busyByConv'));
  check('the old single global busy flag is gone', !/const \[busy, setBusy\] = useState/.test(src));
  check('streaming buffers are per conversation', src.includes('streamByConv'));
  check('abort controllers are per conversation', src.includes('abortsRef') && !/abortRef\.current\?\.abort/.test(src));
  check('send() only blocks on THIS conversation', src.includes('busyByConv[convId]'));
  check('send() captures its target conversation', src.includes('const targetConv = convId'));
  check('send() captures its persona so a module switch cannot misroute', src.includes('const targetPersona = persona'));
  check('the reply is appended to the conversation that asked', src.includes('appendMessage(targetConv'));
  check('stop() only aborts the visible conversation', src.includes('abortsRef.current[convId]?.abort()'));
  check('other working AIs are surfaced to the user', src.includes('otherBusyCount'));

  // =====================================================================
  console.log('\n4 — PER-AI CONVERSATION LISTS + HAMBURGER');

  check('the list is filtered to the active module', src.includes('base.filter((c) => c.module === persona)'));
  check('a hamburger toggle exists', src.includes('toggleList') && src.includes('showList'));
  check('the toggle state is remembered', src.includes('clinical-rx:ai-list-hidden'));
  check('the sidebar is conditionally rendered', src.includes('{showList && ('));
  check('a way back exists when hidden', src.includes('Show conversation list'));
  check('the toggle is labelled for screen readers', src.includes('aria-label="Hide conversation list"'));
  check('the toggle exposes expanded state', src.includes('aria-expanded'));
  check('switching module restores that module\'s latest chat', src.includes('mostRecent'));
  check('a generating conversation is marked in the list', src.includes('busyByConv[c.id]'));

  // Behavioural: conversations really are separable by module.
  const c1 = convs.createConversation('clinical', 'Clinical chat');
  const c2 = convs.createConversation('revision', 'Revision chat');
  const c3 = convs.createConversation('clinical', 'Second clinical chat');
  const all = convs.loadConversations();
  const clinicalOnly = all.filter((c) => c.module === 'clinical');
  const revisionOnly = all.filter((c) => c.module === 'revision');
  check('conversations record their module', !!c1.module && !!c2.module);
  check('clinical list holds only clinical chats', clinicalOnly.length >= 2 && clinicalOnly.every((c) => c.module === 'clinical'));
  check('revision list holds only revision chats', revisionOnly.length >= 1 && revisionOnly.every((c) => c.module === 'revision'));
  check('one module\'s chats never appear in another\'s list', !clinicalOnly.some((c) => c.id === c2.id));
  check('deleting one module\'s chat leaves the other untouched', (convs.deleteConversation(c3.id), !!convs.getConversation(c2.id)));

  // =====================================================================
  console.log('\nOFFLINE GUARANTEE');
  check('every one of these features worked with zero network calls', networkCalls.length === 0, networkCalls.join(','));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 11 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 11 TESTS PASSED ✔');
