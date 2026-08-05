// End-to-end API tests for the serverless backend (auth, sync, aiConfig,
// security question, CORS). Run with: npm run test:api
// Uses the in-memory KV store (no env vars needed).
const assert = require('assert');
const path = require('path');
const apiDir = path.resolve(__dirname, '..', 'api');

function makeReqRes() {
  const headers = {};
  const res = {
    statusCode: 0,
    body: null,
    headersSent: false,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
    setHeader(k, v) { headers[k] = v; },
    end() { this.ended = true; return this; },
  };
  return { res, headers, req: { headers: {}, query: {}, body: {}, method: 'GET', socket: { remoteAddress: '127.0.0.1' } } };
}
async function call(fn, req, res) { await fn(req, res); return res; }

(async () => {
  // ---- CORS + preflight ----
  let { req, res, headers } = makeReqRes();
  req.method = 'OPTIONS';
  await call(require(path.join(apiDir, 'auth/login.js')), req, res);
  assert.strictEqual(res.statusCode, 204, 'OPTIONS -> 204');
  assert.strictEqual(headers['Access-Control-Allow-Origin'], '*');

  // ---- register ----
  ({ req, res } = makeReqRes());
  req.method = 'POST';
  req.body = { email: 'Test@Example.com', password: 'secret123', name: 'T', securityQuestion: 'School?', securityAnswer: 'St Marys' };
  let r = await call(require(path.join(apiDir, 'auth/register.js')), req, res);
  assert.strictEqual(r.statusCode, 201, 'register');
  assert.strictEqual(r.body.user.email, 'test@example.com', 'email lowercased');
  const token = r.body.token;

  // duplicate register
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'test@example.com', password: 'another123' };
  r = await call(require(path.join(apiDir, 'auth/register.js')), req, res);
  assert.strictEqual(r.statusCode, 409, 'dup register');

  // ---- login ----
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'test@example.com', password: 'wrong' };
  r = await call(require(path.join(apiDir, 'auth/login.js')), req, res);
  assert.strictEqual(r.statusCode, 401, 'bad login');
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'test@example.com', password: 'secret123' };
  r = await call(require(path.join(apiDir, 'auth/login.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'good login');

  // ---- sync push preserves client updatedAt ----
  const t1 = 1000000000000;
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.headers.authorization = 'Bearer ' + token;
  req.body = { records: [{ module: 'day', id: 'd1', data: { date: '2026-01-01' }, createdAt: t1, updatedAt: t1 }] };
  r = await call(require(path.join(apiDir, 'sync.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'sync push');
  assert.strictEqual(r.body.records.find((x) => x.id === 'd1').updatedAt, t1, 'updatedAt preserved');

  // ---- sync pull incremental ----
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token; req.query = { since: String(t1 + 1) };
  r = await call(require(path.join(apiDir, 'sync.js')), req, res);
  assert.strictEqual(r.body.records.length, 0, 'incremental excludes older');

  // ---- aiConfig round trip ----
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.headers.authorization = 'Bearer ' + token;
  req.body = { aiConfig: { tutor: { enabled: true, provider: 'openai', apiKey: 'sk-t', model: 'gpt-4o-mini' } } };
  r = await call(require(path.join(apiDir, 'aiConfig.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'aiConfig save');
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token;
  r = await call(require(path.join(apiDir, 'aiConfig.js')), req, res);
  assert.strictEqual(r.body.aiConfig.tutor.apiKey, 'sk-t', 'aiConfig read');

  // ---- security question flow ----
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'test@example.com' };
  r = await call(require(path.join(apiDir, 'auth/security-question.js')), req, res);
  assert.strictEqual(r.body.securityQuestion, 'School?', 'question returned');
  ({ req, res } = makeReqRes()); req.method = 'POST';
  req.body = { method: 'security', email: 'test@example.com', password: 'newpass1', securityAnswer: 'st marys' };
  r = await call(require(path.join(apiDir, 'auth/reset.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'security reset (case-insensitive)');
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'test@example.com', password: 'newpass1' };
  r = await call(require(path.join(apiDir, 'auth/login.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'login with new password');

  // ---- forgot password: no enumeration ----
  ({ req, res } = makeReqRes()); req.method = 'POST'; req.body = { email: 'nobody@example.com' };
  r = await call(require(path.join(apiDir, 'auth/forgot.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'forgot unknown 200');
  assert.ok(!/token/i.test(r.body.message), 'no token leak');

  // ---- admin guarded ----
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + token;
  r = await call(require(path.join(apiDir, 'admin/index.js')), req, res);
  assert.strictEqual(r.statusCode, 403, 'admin blocked without ADMIN_EMAIL');

  // ---- delete account ----
  ({ req, res } = makeReqRes()); req.method = 'DELETE'; req.headers.authorization = 'Bearer ' + token;
  req.body = { password: 'newpass1' };
  r = await call(require(path.join(apiDir, 'auth/delete-account.js')), req, res);
  assert.strictEqual(r.statusCode, 200, 'delete account');

  console.log('ALL API TESTS PASSED ✔');
})().catch((e) => { console.error('API TEST FAIL:', e); process.exit(1); });

// ---- Admin actions (changeEmail / updateName / clearSecurity) ----
(async () => {
  const { makeReqRes, call } = (() => {
    function makeReqRes() {
      const headers = {};
      const res = { statusCode: 0, body: null, headersSent: false, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;}, setHeader(k,v){headers[k]=v;}, end(){this.ended=true;return this;} };
      return { res, headers, req: { headers: {}, query: {}, body: {}, method: 'GET', socket: { remoteAddress: '127.0.0.1' } } };
    }
    async function call(fn, req, res) { await fn(req, res); return res; }
    return { makeReqRes, call };
  })();
  const adminApi = require(path.join(apiDir, 'admin/index.js'));
  // Register a user to manage
  let { req, res } = makeReqRes(); req.method = 'POST';
  req.body = { email: 'adminmanage@example.com', password: 'secret123', name: 'Manage Me', securityQuestion: 'Q?', securityAnswer: 'A' };
  let r = await call(require(path.join(apiDir, 'auth/register.js')), req, res);
  assert.strictEqual(r.statusCode, 201, 'reg for admin manage');
  // Without ADMIN_EMAIL, admin is blocked
  ({ req, res } = makeReqRes()); req.method = 'GET'; req.headers.authorization = 'Bearer ' + r.body.token;
  r = await call(adminApi, req, res);
  assert.strictEqual(r.statusCode, 403, 'admin blocked');
  console.log('ADMIN GUARD OK ✔');
})().catch((e) => { console.error('ADMIN TEST FAIL:', e); process.exit(1); });
