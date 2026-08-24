// End-to-end API tests for the consolidated serverless backend.
// Run with: npm run test:api
const assert = require('assert');
const path = require('path');
const apiDir = path.resolve(__dirname, '..', 'api');

function makeReqRes() {
  const headers = {};
  const res = {
    statusCode: 0, body: null, headersSent: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { headers[k] = v; },
    end() { this.ended = true; return this; },
  };
  return { res, headers, req: { headers: {}, query: {}, body: {}, method: 'GET', socket: { remoteAddress: '127.0.0.1' } } };
}
async function call(fn, req, res) { await fn(req, res); return res; }

(async () => {
  const auth = require(path.join(apiDir, 'auth/index.js'));
  const sync = require(path.join(apiDir, 'sync.js'));
  const aiConfig = require(path.join(apiDir, 'aiConfig.js'));
  const admin = require(path.join(apiDir, 'admin/index.js'));

  // CORS preflight
  let { req, res, headers } = makeReqRes();
  req.method = 'OPTIONS';
  await call(auth, req, res);
  assert.strictEqual(res.statusCode, 204, 'OPTIONS -> 204');
  assert.strictEqual(headers['Access-Control-Allow-Origin'], '*');

  // register
  ({ req, res } = makeReqRes()); req.method = 'POST';
  req.body = { action: 'register', email: 'Test@Example.com', password: 'secret123', name: 'T', securityQuestion: 'School?', securityAnswer: 'St Marys' };
  let r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 201, 'register');
  assert.strictEqual(r.body.user.email, 'test@example.com', 'email lowercased');
  const token = r.body.token;

  // dup register
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'register', email: 'test@example.com', password: 'another123' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 409, 'dup register');

  // login
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'login', email: 'test@example.com', password: 'wrong' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 401, 'bad login');
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'login', email: 'test@example.com', password: 'secret123' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'good login');

  // me
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token; req.query = { action: 'me' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'me');

  // sync push preserves updatedAt
  const t1 = 1000000000000;
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.headers.authorization = 'Bearer ' + token;
  req.body = { records: [{ module: 'day', id: 'd1', data: { date: '2026-01-01' }, createdAt: t1, updatedAt: t1 }] };
  r = await call(sync, req, res);
  assert.strictEqual(r.statusCode, 200, 'sync push');
  assert.strictEqual(r.body.records.find((x) => x.id === 'd1').updatedAt, t1, 'updatedAt preserved');

  // sync pull incremental
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token; req.query = { since: String(t1 + 1) };
  r = await call(sync, req, res);
  assert.strictEqual(r.body.records.length, 0, 'incremental');

  // aiConfig round trip.
  // Phase 8 §6: the SERVER strips credentials, so a modified client cannot
  // park an API key in the cloud. Shareable preferences must still survive.
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.headers.authorization = 'Bearer ' + token;
  req.body = { aiConfig: { tutor: { enabled: true, provider: 'openai', apiKey: 'sk-t', model: 'gpt-4o-mini' } } };
  r = await call(aiConfig, req, res);
  assert.strictEqual(r.statusCode, 200, 'aiConfig save');
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token;
  r = await call(aiConfig, req, res);
  assert.strictEqual(r.body.aiConfig.tutor.apiKey, undefined, 'aiConfig strips apiKey server-side');
  assert.strictEqual(r.body.aiConfig.tutor.model, 'gpt-4o-mini', 'aiConfig keeps preferences');
  assert.strictEqual(r.body.aiConfig.tutor.enabled, true, 'aiConfig keeps enabled flag');
  assert.ok(!JSON.stringify(r.body).includes('sk-t'), 'no credential anywhere in the response');

  // security-question
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'security-question', email: 'test@example.com' };
  r = await call(auth, req, res);
  assert.strictEqual(r.body.securityQuestion, 'School?', 'question returned');

  // security reset (case-insensitive)
  ({ req, res } = makeReqRes()); req.method = 'POST';
  req.body = { action: 'reset', method: 'security', email: 'test@example.com', password: 'newpass1', securityAnswer: 'st marys' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'security reset');
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'login', email: 'test@example.com', password: 'newpass1' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'login new password');

  // forgot no-enumeration
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { action: 'forgot', email: 'nobody@example.com' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'forgot unknown 200');
  assert.ok(!/token/i.test(r.body.message), 'no token leak');

  // admin guarded
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token; req.query = { action: 'list' };
  r = await call(admin, req, res);
  assert.strictEqual(r.statusCode, 403, 'admin blocked');

  // delete account
  ({ req, res } = makeReqRes()); req.method = 'DELETE'; req.headers.authorization = 'Bearer ' + token;
  req.body = { action: 'delete-account', password: 'newpass1' };
  r = await call(auth, req, res);
  assert.strictEqual(r.statusCode, 200, 'delete account');

  console.log('ALL API TESTS PASSED ✔');
})().catch((e) => { console.error('API TEST FAIL:', e); process.exit(1); });
