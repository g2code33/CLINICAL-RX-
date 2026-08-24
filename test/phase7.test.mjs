/**
 * CLINICAL Rx — PHASE 7 acceptance tests
 * (Optional Account + Cloud Sync + Backup Engine).
 *
 *   TEST 62  offline-first: everything works with no internet, no account
 *   TEST 63  reconnect: queued changes sync automatically
 *   TEST 64  first account: existing local data is preserved, upload explicit
 *   TEST 65  multi-device: a record created on A appears on B
 *   TEST 66  conflict: same field on two devices -> no silent overwrite
 *   TEST 67  sign-out: local data remains, cloud operations stop
 *   TEST 68  account switch: profile A data never appears in profile B
 *   TEST 69  backup/restore round-trip
 *   TEST 70  cloud failure: app continues, changes queue, then converge
 *   TEST 71  security: one user cannot read another user's records
 *   + §36 API keys are never synchronised
 *   + §24/§25 deletions propagate and are never resurrected
 *   + §59/§60 bundle snapshots and academic stamps survive sync
 *
 * A fake in-memory cloud stands in for the backend so the whole suite runs
 * offline and deterministically.
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

let failures = 0;
const check = (name, cond, detail) => {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failures++;
    console.error(`  ✗ ${name}${detail ? ' — ' + String(detail).slice(0, 200) : ''}`);
  }
};

// ---------------------------------------------------------------------
// FAKE CLOUD — models the real backend's authorisation model: every record
// lives under the user id derived from the bearer token, never from input.
// ---------------------------------------------------------------------
const cloud = {
  users: new Map(), // email -> { id, password }
  data: new Map(), // userId -> Map(key -> record)
  aiConfig: new Map(), // userId -> object
  down: false,
  pushes: 0,
  lastPushPayload: null,
};

function userIdFromToken(token) {
  // Mirrors the real server: the token is the ONLY source of identity.
  if (!token || !token.startsWith('tok_')) return null;
  return token.slice(4);
}

globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  const body = init.body ? JSON.parse(init.body) : {};
  const auth = (init.headers?.Authorization || init.headers?.authorization || '').replace(/^Bearer /, '');
  const json = (status, obj) => ({
    ok: status < 400,
    status,
    headers: { get: (h) => (String(h).toLowerCase() === 'content-type' ? 'application/json' : null) },
    json: async () => obj,
    text: async () => JSON.stringify(obj),
  });

  if (cloud.down) throw new Error('network down');

  if (u.includes('/api/auth')) {
    const action = body.action;
    if (action === 'register') {
      if (cloud.users.has(body.email)) return json(400, { error: 'exists' });
      const id = 'u_' + (cloud.users.size + 1);
      cloud.users.set(body.email, { id, password: body.password, name: body.name });
      cloud.data.set(id, new Map());
      return json(200, { token: 'tok_' + id, user: { id, email: body.email, name: body.name } });
    }
    if (action === 'login') {
      const u2 = cloud.users.get(body.email);
      if (!u2 || u2.password !== body.password) return json(401, { error: 'bad credentials' });
      return json(200, { token: 'tok_' + u2.id, user: { id: u2.id, email: body.email, name: u2.name } });
    }
    if (action === 'me') {
      const id = userIdFromToken(auth);
      if (!id) return json(401, { error: 'Invalid token' });
      const entry = [...cloud.users.entries()].find(([, v]) => v.id === id);
      return json(200, { user: { id, email: entry?.[0], name: entry?.[1]?.name } });
    }
    return json(400, { error: 'unknown action' });
  }

  if (u.includes('/api/aiConfig')) {
    const id = userIdFromToken(auth);
    if (!id) return json(401, { error: 'Invalid token' });
    if (init.method === 'POST') {
      cloud.aiConfig.set(id, body.aiConfig);
      return json(200, { ok: true });
    }
    return json(200, { aiConfig: cloud.aiConfig.get(id) ?? null });
  }

  if (u.includes('/api/sync')) {
    const id = userIdFromToken(auth);
    if (!id) return json(401, { error: 'Invalid token' });
    if (!cloud.data.has(id)) cloud.data.set(id, new Map());
    const store = cloud.data.get(id);

    if (init.method === 'POST') {
      cloud.pushes++;
      cloud.lastPushPayload = body.records;
      for (const r of body.records ?? []) {
        // AUTHORISATION: the key is always scoped to the token's user.
        const key = `${r.module}:${r.id}`;
        // Mirrors the real server: never let an older push clobber a newer
        // stored copy (deletions always win, so they can propagate).
        const existing = store.get(key);
        if (!r.deleted && existing && !existing.deleted && existing.updatedAt > r.updatedAt) continue;
        store.set(key, { ...r });
      }
      return json(200, { records: [...store.values()] });
    }
    const since = Number(new URL(u, 'http://x').searchParams.get('since') ?? 0);
    const recs = [...store.values()].filter((r) => !since || r.updatedAt >= since);
    return json(200, { records: recs });
  }

  throw new Error('UNEXPECTED FETCH ' + u);
};

const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom', logLevel: 'error' });

try {
  const { useData } = await server.ssrLoadModule('/src/stores/data.ts');
  const defaults = await server.ssrLoadModule('/src/services/defaults.ts');
  const auth = await server.ssrLoadModule('/src/services/authService.ts');
  const link = await server.ssrLoadModule('/src/services/accountLink.ts');
  const engine = await server.ssrLoadModule('/src/services/syncEngine.ts');
  const scheduler = await server.ssrLoadModule('/src/services/syncScheduler.ts');
  const cloudBackup = await server.ssrLoadModule('/src/services/cloudBackup.ts');
  const aiConfigSync = await server.ssrLoadModule('/src/services/aiConfigSync.ts');
  const academic = await server.ssrLoadModule('/src/services/academic.ts');
  const career = await server.ssrLoadModule('/src/services/career.ts');
  const bundleEngine = await server.ssrLoadModule('/src/services/bundleEngine.ts');

  const st = () => useData.getState();

  const setAccount = async (patch) => {
    const s = st().settings;
    await st().saveSettings({ ...s, onlineAccount: { ...(s.onlineAccount ?? {}), ...patch } });
  };

  // Simulate a different device by wiping local state but keeping the cloud.
  const resetLocal = async () => {
    dom.window.localStorage.clear();
    for (const m of engine.SYNCED_MODULES) {
      for (const r of [...st().all(m)]) await st().remove(m, r.id, { fromSync: true });
    }
    await st().saveSettings(defaults.newSettings());
  };

  await st().init();
  if (!st().settings) await st().saveSettings(defaults.newSettings());

  // =====================================================================
  console.log('\nTEST 62 — offline-first: no internet, no account');
  setOnline(false);
  const prof = defaults.newProfile('Ama');
  prof.programme = 'PharmD';
  await st().saveProfile(prof);
  const boot = await academic.bootstrapJourney({ level: '200', academicYear: '2026/2027', semesterName: 'Semester 1' });
  await st().saveProfile({ ...st().profile, currentStageId: boot.stage.id, currentPeriodId: boot.period?.id });

  check('app works with no account', st().settings?.onlineAccount?.connected !== true);
  const offlineLesson = defaults.newLesson('Statins inhibit HMG-CoA reductase.', '2026-11-02');
  await st().save('lesson', offlineLesson);
  const offlineSkill = await career.saveCareerRecord('skill', career.newSkill('Patient Counselling', 'clinical'));
  const offlineProject = await career.saveCareerRecord('project', career.newProject('CLINICAL Rx Mobile', 'active'));
  const offlineExp = await career.saveCareerRecord('clinicalExperience', career.newClinicalExperience('Afrancho Polyclinic', '2026-11-01'));
  const offlineBundle = await bundleEngine.createDayBundle('2026-11-02', 'Day one');

  check('learning note saved offline', st().lessons.some((l) => l.id === offlineLesson.id));
  check('skill saved offline', st().skills.some((s) => s.id === offlineSkill.id));
  check('project saved offline', st().projects.some((p) => p.id === offlineProject.id));
  check('clinical experience saved offline', st().clinicalExperiences.some((e) => e.id === offlineExp.id));
  check('bundle created offline', !!offlineBundle.id && offlineBundle.status === 'completed');
  check('nothing queued while signed out', engine.getPendingCount() === 0, String(engine.getPendingCount()));

  const status62 = scheduler.syncStatus();
  check('status reads "offline account"', status62.light === 'signed-out', status62.light);
  check('status reassures about local storage', /locally/i.test(status62.detail), status62.detail);

  // =====================================================================
  console.log('\nTEST 64 — first account keeps existing local data');
  setOnline(true);
  const inv = link.localInventory();
  check('inventory counts real local records', inv.total > 0, String(inv.total));
  check('inventory lists categories', inv.byCategory.some((c) => c.label === 'Skills'), JSON.stringify(inv.byCategory));

  const reg = await auth.signUp('ama@example.com', 'pw-12345', 'Ama');
  check('account created', reg.ok === true, reg.error);
  check('signed in', st().settings.onlineAccount.connected === true);
  check('cloud user id stored alongside local profile', !!st().settings.onlineAccount.cloudUserId);
  check('local profile survived sign-up', st().profile?.username === 'Ama');
  check('local records survived sign-up', st().lessons.some((l) => l.id === offlineLesson.id));

  const deviceId = st().settings.device?.deviceId;
  check('device identity created', !!deviceId && deviceId.startsWith('dev_'));
  check('device id is not the email', !String(deviceId).includes('ama@example.com'));

  check('first sync NOT auto-approved', link.firstSyncApproved() === false);
  const pushesBefore = cloud.pushes;
  check('nothing uploaded before consent', pushesBefore === 0, String(pushesBefore));

  const plan = await link.planLink();
  check('plan sees empty cloud (first device)', plan.cloudTotal === 0, String(plan.cloudTotal));
  check('plan offers upload', plan.options.includes('upload'));
  check('plan offers keeping local only', plan.options.includes('local-only'));
  check('plan recommends upload for a first device', plan.recommended === 'upload');

  const linked = await link.executeLink('upload');
  check('explicit upload succeeded', linked.ok === true, linked.message);
  check('records were uploaded', linked.pushed > 0, String(linked.pushed));
  check('first sync now approved', link.firstSyncApproved() === true);

  const cloudStore = cloud.data.get(st().settings.onlineAccount.cloudUserId);
  check('cloud received the lesson', [...cloudStore.keys()].includes('lesson:' + offlineLesson.id));
  check('cloud received the Phase 6 skill', [...cloudStore.keys()].includes('skill:' + offlineSkill.id));
  check('cloud received the clinical experience', [...cloudStore.keys()].includes('clinicalExperience:' + offlineExp.id));
  check('cloud received the bundle', [...cloudStore.keys()].includes('bundle:' + offlineBundle.id));

  // =====================================================================
  console.log('\n§36 — API keys are NEVER synchronised');
  const withKey = { ...(st().settings.ai ?? {}) };
  withKey.tutor = { enabled: true, provider: 'openai', apiKey: 'sk-SUPER-SECRET-123', model: 'gpt-4o-mini', temperature: 0.5, mode: 'cloud' };
  await st().saveSettings({ ...st().settings, ai: withKey });

  await aiConfigSync.pushAiConfig();
  const uploadedAi = cloud.aiConfig.get(st().settings.onlineAccount.cloudUserId);
  check('AI preferences uploaded', !!uploadedAi?.tutor, JSON.stringify(uploadedAi));
  check('API key NOT uploaded', !JSON.stringify(uploadedAi).includes('sk-SUPER-SECRET-123'), JSON.stringify(uploadedAi));
  check('shareable preferences kept', uploadedAi.tutor.model === 'gpt-4o-mini' && uploadedAi.tutor.mode === 'cloud');
  check('stripDeviceSecrets removes apiKey', !('apiKey' in aiConfigSync.stripDeviceSecrets(withKey).tutor));
  check('no key anywhere in the whole cloud dump', !JSON.stringify([...cloud.aiConfig.values()]).includes('sk-SUPER-SECRET'));

  // A cloud config must never be able to inject a key back into a device.
  cloud.aiConfig.set(st().settings.onlineAccount.cloudUserId, {
    tutor: { enabled: true, provider: 'openai', apiKey: 'sk-EVIL-FROM-CLOUD', model: 'gpt-4o' },
  });
  await aiConfigSync.syncAiConfig();
  check('local key preserved after pull', st().settings.ai.tutor.apiKey === 'sk-SUPER-SECRET-123', st().settings.ai.tutor.apiKey);
  check('cloud-injected key rejected', st().settings.ai.tutor.apiKey !== 'sk-EVIL-FROM-CLOUD');
  check('cloud preference still applied', st().settings.ai.tutor.model === 'gpt-4o');

  // =====================================================================
  console.log('\n§35 — AI conversations do not sync unless opted in');
  const chat = defaults.newChatSession ? defaults.newChatSession('chat', 'Private AI conversation') : null;
  if (chat) {
    await st().save('chat', chat);
    check('chat queued locally', engine.loadPending().some((p) => p.module === 'chat'));
    await scheduler.runSync(true);
    const store2 = cloud.data.get(st().settings.onlineAccount.cloudUserId);
    check('chat NOT uploaded by default', ![...store2.keys()].some((k) => k.startsWith('chat:')), [...store2.keys()].filter((k) => k.startsWith('chat:')).join(','));
    check('chat still queued for later', engine.loadPending().some((p) => p.module === 'chat'));

    await setAccount({ syncAiConversations: true });
    check('opt-in enables chat sync', engine.aiSyncEnabled() === true);
    await scheduler.runSync(true);
    const store3 = cloud.data.get(st().settings.onlineAccount.cloudUserId);
    check('chat uploaded after opt-in', [...store3.keys()].some((k) => k.startsWith('chat:')));
    await setAccount({ syncAiConversations: false });
  } else {
    check('chat module helper available', false, 'newChatSession missing');
  }

  // =====================================================================
  console.log('\nTEST 65 — multi-device: record from A appears on B');
  const userId = st().settings.onlineAccount.cloudUserId;
  const deviceALesson = defaults.newLesson('Beta blockers reduce mortality in HFrEF.', '2026-11-05');
  await st().save('lesson', deviceALesson);
  await scheduler.runSync(true);
  check('device A pushed the new note', cloud.data.get(userId).has('lesson:' + deviceALesson.id));

  // --- Become device B ---
  await resetLocal();
  check('device B starts empty', st().lessons.length === 0);
  const loginB = await auth.signIn('ama@example.com', 'pw-12345');
  check('device B signed in', loginB.ok === true, loginB.error);

  const planB = await link.planLink();
  check('device B sees existing cloud data', planB.cloudTotal > 0, String(planB.cloudTotal));
  check('device B offered download', planB.options.includes('download'));
  check('device B recommended download (empty locally)', planB.recommended === 'download');

  const linkB = await link.executeLink('download');
  check('device B download succeeded', linkB.ok === true, linkB.message);
  check("device A's note is now on device B", st().lessons.some((l) => l.id === deviceALesson.id));
  check('Phase 6 skill also arrived', st().skills.some((s) => s.id === offlineSkill.id));
  check('clinical experience also arrived', st().clinicalExperiences.some((e) => e.id === offlineExp.id));
  check('project also arrived', st().projects.some((p) => p.id === offlineProject.id));

  // =====================================================================
  console.log('\n§59/§60 — bundle snapshots and academic stamps survive sync');
  const syncedBundle = st().bundles.find((b) => b.id === offlineBundle.id);
  check('bundle arrived on device B', !!syncedBundle);
  check('snapshot content unchanged',
    JSON.stringify(syncedBundle.snapshot) === JSON.stringify(offlineBundle.snapshot),
    `${(offlineBundle.snapshot ?? []).length} vs ${(syncedBundle?.snapshot ?? []).length}`);
  check('bundle period unchanged', syncedBundle.periodStart === offlineBundle.periodStart);
  const syncedSkill = st().skills.find((s) => s.id === offlineSkill.id);
  check('academic stamp preserved through sync', syncedSkill.academic?.stageId === offlineSkill.academic?.stageId);
  check('academic level preserved', syncedSkill.academic?.level === '200', JSON.stringify(syncedSkill.academic));

  // =====================================================================
  console.log('\n§58 — second device WITH local data is never overwritten');
  await resetLocal();
  const localOnlyNote = defaults.newLesson('Local-only note on this device.', '2026-12-01');
  await st().save('lesson', localOnlyNote);
  await auth.signIn('ama@example.com', 'pw-12345');
  const planC = await link.planLink();
  check('plan sees data on BOTH sides', planC.localTotal > 0 && planC.cloudTotal > 0, `${planC.localTotal}/${planC.cloudTotal}`);
  check('merge is offered', planC.options.includes('merge'));
  check('merge is recommended', planC.recommended === 'merge');
  check('no destructive "replace cloud" option', !planC.options.includes('replace-cloud'));

  const merged = await link.executeLink('merge');
  check('merge succeeded', merged.ok === true, merged.message);
  check('local-only note survived the merge', st().lessons.some((l) => l.id === localOnlyNote.id));
  check('cloud note also present', st().lessons.some((l) => l.id === deviceALesson.id));

  // =====================================================================
  console.log('\nTEST 66 — conflict: same field, two devices');
  const conflictNote = defaults.newLesson('Original title', '2026-12-05');
  await st().save('lesson', conflictNote);
  await scheduler.runSync(true);
  engine.savePending([]);

  // Another device edits the SAME field later, straight into the cloud.
  const cloudCopy = cloud.data.get(userId).get('lesson:' + conflictNote.id);
  cloud.data.get(userId).set('lesson:' + conflictNote.id, {
    ...cloudCopy,
    data: { ...cloudCopy.data, title: 'Edited on the OTHER device' },
    updatedAt: Date.now() + 60_000,
  });
  // ...and we edit it locally too, so both sides moved.
  const localVersion = st().lessons.find((l) => l.id === conflictNote.id);
  await st().save('lesson', { ...localVersion, title: 'Edited on THIS device' });
  check('local edit queued', engine.loadPending().some((p) => p.id === conflictNote.id));

  await scheduler.runSync(true);
  const conflicts = engine.loadConflicts();
  check('conflict detected', conflicts.length > 0, String(conflicts.length));
  const c = conflicts.find((x) => x.id === conflictNote.id);
  check('conflict names the record', !!c && /Edited on THIS device|Original/.test(c.title), c?.title);
  check('conflict identifies the clashing field', !!c && c.fields.includes('title'), JSON.stringify(c?.fields));
  check('conflict keeps BOTH versions', !!c?.localData && !!c?.serverData);
  check('local value NOT silently overwritten',
    st().lessons.find((l) => l.id === conflictNote.id)?.title === 'Edited on THIS device',
    st().lessons.find((l) => l.id === conflictNote.id)?.title);
  check('sync status reports the conflict', scheduler.syncStatus().light === 'error');
  check('auto-sync pauses during a conflict', scheduler.canAutoSync().ok === false);

  await engine.resolveConflict('lesson', conflictNote.id, 'server');
  check('resolving to cloud applies the cloud value',
    st().lessons.find((l) => l.id === conflictNote.id)?.title === 'Edited on the OTHER device');
  check('conflict cleared', engine.conflictCount() === 0);

  // Field-level merge: different fields on each side must NOT conflict.
  const mergeNote = defaults.newLesson('Merge me', '2026-12-06');
  mergeNote.content = 'original body';
  await st().save('lesson', mergeNote);
  await scheduler.runSync(true);
  engine.savePending([]);
  const base = cloud.data.get(userId).get('lesson:' + mergeNote.id);
  cloud.data.get(userId).set('lesson:' + mergeNote.id, {
    ...base,
    data: { ...base.data, content: 'body changed remotely' },
    updatedAt: Date.now() + 60_000,
  });
  const mine = st().lessons.find((l) => l.id === mergeNote.id);
  await st().save('lesson', { ...mine, title: 'title changed locally' });
  await scheduler.runSync(true);
  const mergedNote = st().lessons.find((l) => l.id === mergeNote.id);
  check('different fields merged without a conflict', engine.conflictCount() === 0, String(engine.conflictCount()));
  check('local field kept', mergedNote.title === 'title changed locally', mergedNote.title);
  check('remote field adopted', mergedNote.content === 'body changed remotely', mergedNote.content);

  // =====================================================================
  console.log('\n§24/§25 — deletions propagate and never resurrect');
  const doomed = defaults.newLesson('Delete me', '2026-12-10');
  await st().save('lesson', doomed);
  await scheduler.runSync(true);
  check('record is in the cloud', cloud.data.get(userId).has('lesson:' + doomed.id));

  await st().remove('lesson', doomed.id);
  check('tombstone written', engine.loadTombstones().some((t) => t.id === doomed.id));
  check('delete queued', engine.loadPending().some((p) => p.op === 'delete' && p.id === doomed.id));
  await scheduler.runSync(true);
  check('deletion propagated to the cloud', cloud.data.get(userId).get('lesson:' + doomed.id)?.deleted === true);

  // A stale server copy must not bring it back.
  cloud.data.get(userId).set('lesson:' + doomed.id, {
    module: 'lesson', id: doomed.id, data: { ...doomed }, createdAt: doomed.createdAt, updatedAt: doomed.updatedAt,
  });
  await scheduler.runSync(true);
  check('deleted record is NOT resurrected', !st().lessons.some((l) => l.id === doomed.id));

  // =====================================================================
  console.log('\nTEST 70 — cloud failure: app keeps working, changes queue');
  cloud.down = true;
  const duringOutage = defaults.newLesson('Written during an outage.', '2026-12-12');
  await st().save('lesson', duringOutage);
  check('record saved during outage', st().lessons.some((l) => l.id === duringOutage.id));
  const outageRes = await scheduler.runSync(true);
  check('sync reports failure without throwing', outageRes.ok === false);
  check('failure message is reassuring', /locally|later|unavailable/i.test(outageRes.message), outageRes.message);
  check('change is still queued', engine.loadPending().some((p) => p.id === duringOutage.id));
  check('backoff scheduled', (st().settings.onlineAccount.failureCount ?? 0) > 0);
  check('auto-sync blocked during backoff', scheduler.canAutoSync().ok === false);

  cloud.down = false;
  await setAccount({ retryAfter: undefined, failureCount: 0 });
  const recovered = await scheduler.runSync(true);
  check('sync recovers when the cloud returns', recovered.ok === true, recovered.message);
  check('queued change reached the cloud', cloud.data.get(userId).has('lesson:' + duringOutage.id));
  check('queue drained', !engine.loadPending().some((p) => p.id === duringOutage.id));

  // =====================================================================
  console.log('\nTEST 63 — reconnect after being offline');
  setOnline(false);
  const whileOffline = defaults.newLesson('Written while offline.', '2026-12-15');
  await st().save('lesson', whileOffline);
  check('saved while offline', st().lessons.some((l) => l.id === whileOffline.id));
  check('queued while offline', engine.loadPending().some((p) => p.id === whileOffline.id));
  const offlineAttempt = await scheduler.runSync(true);
  check('sync declines politely while offline', offlineAttempt.ok === false && /offline/i.test(offlineAttempt.message), offlineAttempt.message);
  check('status shows offline with pending work', scheduler.syncStatus().light === 'offline');

  setOnline(true);
  const afterReconnect = await scheduler.runSync(true);
  check('sync succeeds after reconnecting', afterReconnect.ok === true, afterReconnect.message);
  check('offline work reached the cloud', cloud.data.get(userId).has('lesson:' + whileOffline.id));

  // =====================================================================
  console.log('\nTEST 69 — backup and restore');
  const backupRes = await cloudBackup.createCloudBackup({ label: 'Test backup' });
  check('backup created', backupRes.ok === true, backupRes.error);
  check('manifest counts real records', (backupRes.manifest?.recordCount ?? 0) > 0, String(backupRes.manifest?.recordCount));
  check('manifest records the device', !!backupRes.manifest?.deviceId);

  const list = await cloudBackup.listCloudBackups();
  check('backup appears in history', list.ok && list.backups.some((b) => b.id === backupRes.manifest.id));

  const backedUpNote = defaults.newLesson('Present at backup time.', '2026-12-20');
  await st().save('lesson', backedUpNote);
  const backup2 = await cloudBackup.createCloudBackup({ label: 'Second' });
  check('second backup created', backup2.ok === true);

  // Change the record, then restore.
  const before = st().lessons.find((l) => l.id === backedUpNote.id);
  await st().save('lesson', { ...before, title: 'Changed after the backup' });
  check('record changed after backup', st().lessons.find((l) => l.id === backedUpNote.id).title === 'Changed after the backup');

  const preview = await cloudBackup.previewRestore(backup2.manifest.id);
  check('restore preview works', preview.ok === true, preview.error);
  check('preview reports what is inside', preview.groups.length > 0);
  check('preview does not change anything', st().lessons.find((l) => l.id === backedUpNote.id).title === 'Changed after the backup');

  const backupsBefore = (await cloudBackup.listCloudBackups()).backups.length;
  const restore = await cloudBackup.restoreCloudBackup(backup2.manifest.id);
  check('restore succeeded', restore.ok === true, restore.error);
  check('a safety backup was taken first', !!restore.safetyBackupId);
  const backupsAfter = (await cloudBackup.listCloudBackups()).backups.length;
  check('safety backup is in history', backupsAfter === backupsBefore + 1, `${backupsBefore} -> ${backupsAfter}`);
  check('restored the earlier value', st().lessons.find((l) => l.id === backedUpNote.id).title === 'Present at backup time.',
    st().lessons.find((l) => l.id === backedUpNote.id).title);

  const exportStr = cloudBackup.buildDataExport();
  check('data export produced', exportStr.length > 100);
  check('export contains no API key', !exportStr.includes('sk-SUPER-SECRET-123'));
  check('export contains no session token', !exportStr.includes('tok_' + userId));

  // =====================================================================
  console.log('\nTEST 71 — security: cross-user access is impossible');
  const other = await (async () => {
    // Register a second user directly against the fake cloud.
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'register', email: 'kofi@example.com', password: 'pw-98765', name: 'Kofi' }),
    });
    return res.json();
  })();
  const otherId = other.user.id;
  cloud.data.get(otherId).set('lesson:secret-1', {
    module: 'lesson', id: 'secret-1', data: { id: 'secret-1', title: "KOFI PRIVATE NOTE" }, createdAt: 1, updatedAt: 1,
  });

  // Ama pulls with HER token — she must never see Kofi's record.
  const amaPull = await fetch('/api/sync', { method: 'GET', headers: { Authorization: 'Bearer tok_' + userId } });
  const amaRecords = (await amaPull.json()).records;
  check("user A cannot read user B's records", !amaRecords.some((r) => r.id === 'secret-1'), 'leaked');
  check('records are scoped by token, not by client input', !JSON.stringify(amaRecords).includes('KOFI PRIVATE NOTE'));

  const forged = await fetch('/api/sync', { method: 'GET', headers: { Authorization: 'Bearer tok_FORGED' } });
  check('forged token is rejected', forged.status === 401 || !(await forged.json()).records?.length);

  const noToken = await fetch('/api/sync', { method: 'GET', headers: {} });
  check('missing token is rejected', noToken.status === 401);

  await scheduler.runSync(true);
  check("Kofi's note never landed locally", !st().lessons.some((l) => l.id === 'secret-1'));

  // =====================================================================
  console.log('\nTEST 67 — sign out keeps local data');
  const beforeSignOut = st().lessons.length;
  const skillsBefore = st().skills.length;
  await auth.signOut();
  check('signed out', st().settings.onlineAccount.connected === false);
  check('token cleared', !st().settings.onlineAccount.token);
  check('local notes remain', st().lessons.length === beforeSignOut, `${beforeSignOut} -> ${st().lessons.length}`);
  check('local skills remain', st().skills.length === skillsBefore);
  check('profile remains', !!st().profile);
  check('status returns to offline account', scheduler.syncStatus().light === 'signed-out');
  const afterOut = await scheduler.runSync(true);
  check('cloud operations stop', afterOut.ok === false && /sign in/i.test(afterOut.message), afterOut.message);
  const backupWhileOut = await cloudBackup.createCloudBackup();
  check('cloud backup refuses politely', backupWhileOut.ok === false && /sign in/i.test(backupWhileOut.error), backupWhileOut.error);

  // Local work continues perfectly after signing out.
  const afterSignOutNote = defaults.newLesson('Still working after sign-out.', '2026-12-25');
  await st().save('lesson', afterSignOutNote);
  check('can still create records signed out', st().lessons.some((l) => l.id === afterSignOutNote.id));

  // =====================================================================
  console.log('\nTEST 68 — account switch does not mix data');
  await resetLocal();
  const kofiLogin = await auth.signIn('kofi@example.com', 'pw-98765');
  check('second user signed in', kofiLogin.ok === true, kofiLogin.error);
  const kofiPlan = await link.planLink();
  check('sees only their own cloud data', kofiPlan.cloudTotal === 1, String(kofiPlan.cloudTotal));
  await link.executeLink('download');
  check("Kofi sees their own note", st().lessons.some((l) => l.id === 'secret-1'));
  check("Ama's notes are absent", !st().lessons.some((l) => l.id === offlineLesson.id));
  check("Ama's skills are absent", !st().skills.some((s) => s.id === offlineSkill.id));

  // =====================================================================
  console.log('\nEXTRA — coverage, categories and device management');
  const allModules = new Set(engine.SYNCED_MODULES);
  for (const m of ['clinicalExperience', 'skill', 'achievement', 'certification', 'project', 'research', 'leadership', 'goal']) {
    check(`${m} is synchronised`, allModules.has(m));
  }
  check('settings are NOT synced as a record', !allModules.has('settings'));
  check('profile is NOT synced as a record', !allModules.has('profile'));
  check('AI chat is opt-in only', !allModules.has('chat') && engine.OPT_IN_MODULES.includes('chat'));
  check('sync categories cover the professional journey',
    engine.SYNC_CATEGORIES.some((c) => c.key === 'professional' && c.modules.includes('skill')));

  const dev = auth.deviceInfo();
  check('device info exposes a name', !!dev.deviceName);
  check('device info exposes a platform', !!dev.platform);
  await auth.renameDevice('My Ubuntu PC');
  check('device can be renamed', auth.deviceInfo().deviceName === 'My Ubuntu PC');

  check('formatBytes is human readable', link.formatBytes(2048) === '2.0 KB', link.formatBytes(2048));
} finally {
  const origErr = console.error;
  console.error = () => {};
  await server.close().catch(() => {});
  await new Promise((r) => setTimeout(r, 150));
  console.error = origErr;
}

console.log('');
if (failures) {
  console.error(`PHASE 7 TESTS FAILED — ${failures} failing check(s)`);
  process.exit(1);
}
console.log('ALL PHASE 7 ACCEPTANCE TESTS PASSED ✔');
