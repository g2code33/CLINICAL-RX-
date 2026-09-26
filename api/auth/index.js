// Consolidated auth endpoint. Vercel Hobby allows max 12 serverless
// functions, and we have 13 individual api files. This handler serves ALL
// auth actions from one function via the `action` field, so the deployment
// stays under the limit. Each action still uses its original logic.
const crypto = require('crypto');
const { redis } = require('../_lib/redis.js');
const {
  hashPassword, verifyPassword, verifyHash, signToken, verifyToken, uuid,
} = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');
const { rateLimit, consume } = require('../_lib/rateLimit.js');
const { canSendResetEmail, allowDevResetTokenReturn, detectMode } = require('../_lib/env.js');

function emailOf(req) { return String(req.body?.email || '').trim().toLowerCase(); }
function tokenOf(req) {
  const auth = req.headers.authorization;
  if (!auth) return null;
  return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
}
async function findUserByToken(userId) {
  const users = await redis.hgetall('users');
  if (!users) return null;
  for (const [email, data] of Object.entries(users)) {
    const user = JSON.parse(data);
    if (user.id === userId) return { email, user };
  }
  return null;
}
async function findUserByEmail(e) {
  const raw = await redis.hget('users', e);
  return raw ? JSON.parse(raw) : null;
}

/**
 * Phase 8 §36: credential-guessing actions get their own, much stricter
 * bucket. Previously every auth action shared one max:60 window, so an
 * attacker had 60 password attempts per 15 minutes — and harmless calls like
 * `me` consumed the same budget.
 */
/**
 * Phase 8 §36: credential-guessing actions get their own, much stricter
 * bucket. Previously every auth action shared one max:60 window, so an
 * attacker had 60 password attempts per 15 minutes — and harmless calls like
 * `me` consumed the same budget.
 */
const SENSITIVE_ACTIONS = new Set(['login', 'register', 'reset', 'forgot', 'change-password', 'delete-account', 'security-question']);

async function handler(req, res) {
  const action = req.body?.action || req.query?.action || '';

  if (SENSITIVE_ACTIONS.has(action)) {
    const { allowed, retryAfter } = consume('auth-sensitive', req, 10, 15 * 60 * 1000);
    if (!allowed) {
      if (res.setHeader) res.setHeader('Retry-After', String(retryAfter));
      return fail(res, 429, 'Too many attempts. Please wait a few minutes and try again.');
    }
  }

  // ---- REGISTER ----
  if (action === 'register') {
    const { email, password, name, securityQuestion, securityAnswer } = req.body;
    if (!email || !password) return fail(res, 400, 'Email and password are required.');
    if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    const e = emailOf(req);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail(res, 400, 'Invalid email address.');
    const existing = await redis.hget('users', e);
    if (existing) return fail(res, 409, 'An account with this email already exists. Try signing in instead.');
    const id = uuid();
    const user = {
      id, name: (name || e.split('@')[0]).trim(), email: e,
      password: hashPassword(password), createdAt: Date.now(),
      ...(securityQuestion && securityAnswer ? { securityQuestion: String(securityQuestion).trim(), securityAnswer: hashPassword(String(securityAnswer).trim().toLowerCase()) } : {}),
    };
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return ok(res, 201, { token: signToken(id), user: { id, name: user.name, email: e } });
  }

  // ---- LOGIN ----
  if (action === 'login') {
    const { email, password } = req.body;
    if (!email || !password) return fail(res, 400, 'Email and password are required.');
    const e = emailOf(req);
    const user = await findUserByEmail(e);
    if (!user || !verifyPassword(String(password), user.password)) return fail(res, 401, 'Invalid email or password.');
    return ok(res, 200, { token: signToken(user.id), user: { id: user.id, name: user.name, email: e } });
  }

  // ---- ME ----
  if (action === 'me') {
    const userId = verifyToken(tokenOf(req));
    if (!userId) return fail(res, 401, 'Invalid token');
    const found = await findUserByToken(userId);
    if (!found) return fail(res, 404, 'User not found');
    return ok(res, 200, { user: { id: found.user.id, name: found.user.name, email: found.email } });
  }

  // ---- UPDATE PROFILE ----
  if (action === 'update') {
    const userId = verifyToken(tokenOf(req));
    if (!userId) return fail(res, 401, 'Invalid token');
    const { name, securityQuestion, securityAnswer } = req.body || {};
    const found = await findUserByToken(userId);
    if (!found) return fail(res, 404, 'User not found.');
    if (name !== undefined) found.user.name = String(name).trim();
    if (securityQuestion !== undefined) {
      if (securityQuestion.trim()) {
        found.user.securityQuestion = securityQuestion.trim();
        if (securityAnswer && securityAnswer.trim()) found.user.securityAnswer = hashPassword(securityAnswer.trim().toLowerCase());
      } else {
        delete found.user.securityQuestion;
        delete found.user.securityAnswer;
      }
    }
    await redis.hset('users', { [found.email]: JSON.stringify(found.user) });
    return ok(res, 200, { user: { id: found.user.id, name: found.user.name, email: found.email } });
  }

  // ---- CHANGE PASSWORD ----
  if (action === 'change-password') {
    const userId = verifyToken(tokenOf(req));
    if (!userId) return fail(res, 401, 'Invalid token');
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) return fail(res, 400, 'Current and new password required.');
    if (String(newPassword).length < 6) return fail(res, 400, 'New password must be at least 6 characters.');
    const found = await findUserByToken(userId);
    if (!found) return fail(res, 404, 'User not found.');
    if (!verifyPassword(currentPassword, found.user.password)) return fail(res, 401, 'Current password is incorrect.');
    found.user.password = hashPassword(newPassword);
    await redis.hset('users', { [found.email]: JSON.stringify(found.user) });
    return ok(res, 200, { message: 'Password changed successfully.' });
  }

  // ---- DELETE ACCOUNT ----
  if (action === 'delete-account') {
    const userId = verifyToken(tokenOf(req));
    if (!userId) return fail(res, 401, 'Invalid token');
    const { password } = req.body || {};
    if (!password) return fail(res, 400, 'Password required to confirm deletion.');
    const found = await findUserByToken(userId);
    if (!found) return fail(res, 404, 'User not found.');
    if (!verifyPassword(password, found.user.password)) return fail(res, 401, 'Password is incorrect.');
    await redis.hdel('users', found.email);
    try { await redis.hdel('sync:' + userId); } catch {}
    try { await redis.del('aiConfig:' + userId); } catch {}
    return ok(res, 200, { message: 'Account deleted successfully.' });
  }

  // ---- FORGOT ----
  // Security properties (fail-closed in production):
  //   * Always returns the same generic response (no account enumeration).
  //   * Reset tokens are 32 random bytes, single-use, 30-minute TTL.
  //   * Only a SHA-256 hash of the token is stored in Redis.
  //   * Production: email via Resend is used; plaintext token NEVER returned.
  //   * Development: token returned ONLY with explicit CRX_DEV_EXPOSE_RESET_TOKEN=1.
  if (action === 'forgot') {
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Email is required.');
    const e = emailOf(req);
    const GENERIC = 'If an account exists for that email, a reset link has been sent.';
    const user = await findUserByEmail(e);

    if (user) {
      const tokenPlain = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(tokenPlain).digest('hex');
      const ttlMs = 30 * 60 * 1000;
      await redis.set(`reset:${tokenHash}`, JSON.stringify({ email: e, expires: Date.now() + ttlMs, used: false }), 'PX', ttlMs);

      const appUrl = process.env.APP_URL || '';
      const resetUrl = appUrl
        ? `${appUrl}/#/reset?token=${encodeURIComponent(tokenPlain)}&email=${encodeURIComponent(e)}`
        : null;

      if (process.env.RESEND_API_KEY && process.env.FROM_EMAIL && resetUrl) {
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.FROM_EMAIL, to: e,
            subject: 'CLINICAL Rx — Password reset',
            html: `<p>Click below to reset your password (link expires in 30 minutes and can only be used once):</p><a href="${resetUrl}">Reset password</a><p>If you did not request this, ignore this email.</p>`,
          }),
        }).catch((err) => { console.error('[clinical-rx] Resend error:', err?.message); });
      } else if (detectMode() !== 'production' && allowDevResetTokenReturn() && resetUrl) {
        return ok(res, 200, { message: GENERIC + ' [dev — reset link not emailed]', resetUrl });
      }
    }
    return ok(res, 200, { message: GENERIC });
  }

  // ---- SECURITY QUESTION (fetch) ----
  if (action === 'security-question') {
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Email is required.');
    const e = emailOf(req);
    const user = await findUserByEmail(e);
    return ok(res, 200, { securityQuestion: user?.securityQuestion || null });
  }

  // ---- RESET (token / security / admin) ----
  if (action === 'reset') {
    const { method, email, password, token, securityAnswer, adminToken } = req.body || {};

    if (method === 'admin') {
      if (!process.env.ADMIN_RESET_TOKEN) return fail(res, 403, 'Admin reset is not configured on this server.');
      const expected = process.env.ADMIN_RESET_TOKEN;
      const a = Buffer.from(String(adminToken || ''));
      const b = Buffer.from(expected);
      if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail(res, 403, 'Invalid admin token.');
      if (!email || !password) return fail(res, 400, 'Email and password required.');
      if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
      const e = emailOf(req);
      const user = await findUserByEmail(e);
      if (!user) return fail(res, 404, 'User not found.');
      user.password = hashPassword(password);
      await redis.hset('users', { [e]: JSON.stringify(user) });
      return ok(res, 200, { message: 'Password reset by admin.' });
    }

    if (method === 'token') {
      if (!token || !email || !password) return fail(res, 400, 'Token, email, and new password required.');
      if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
      if (String(token).length !== 64 || !/^[a-f0-9]{64}$/.test(token)) return fail(res, 400, 'Invalid or expired token.');
      const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex');
      const raw = await redis.get(`reset:${tokenHash}`);
      if (!raw) return fail(res, 400, 'Invalid or expired token.');
      let data;
      try { data = JSON.parse(raw); } catch { return fail(res, 400, 'Invalid or expired token.'); }
      if (!data || data.used) { await redis.del(`reset:${tokenHash}`); return fail(res, 400, 'Invalid or expired token.'); }
      if (!data.expires || data.expires < Date.now()) { await redis.del(`reset:${tokenHash}`); return fail(res, 400, 'Token expired.'); }
      const e = emailOf(req);
      if (data.email !== e) return fail(res, 400, 'Email mismatch.');
      const user = await findUserByEmail(e);
      if (!user) return fail(res, 404, 'User not found.');
      user.password = hashPassword(password);
      await redis.hset('users', { [e]: JSON.stringify(user) });
      // Single-use: invalidate immediately to prevent replay.
      await redis.del(`reset:${tokenHash}`);
      return ok(res, 200, { message: 'Password reset successfully.' });
    }

    if (method === 'security') {
      if (!email || !password || !securityAnswer) return fail(res, 400, 'Email, new password and security answer are required.');
      const e = emailOf(req);
      const user = await findUserByEmail(e);
      if (!user) return fail(res, 404, 'User not found.');
      if (!user.securityQuestion || !user.securityAnswer) return fail(res, 400, 'No security question set.');
      if (!verifyHash(String(securityAnswer).trim().toLowerCase(), user.securityAnswer)) return fail(res, 400, 'Security answer incorrect.');
      user.password = hashPassword(password);
      await redis.hset('users', { [e]: JSON.stringify(user) });
      return ok(res, 200, { message: 'Password reset via security question.' });
    }

    return fail(res, 400, 'Invalid reset method.');
  }

  return fail(res, 400, 'Unknown auth action.');
}

module.exports = guard(rateLimit({ route: 'auth', max: 60, windowMs: 15 * 60 * 1000 })(handler));
