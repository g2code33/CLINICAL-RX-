const crypto = require('crypto');
const { effectiveSessionSecret, assertProductionReady } = require('./env.js');

// Enforce production environment validation at module load. Cold-start fails
// loudly if production secrets are missing instead of silently using a
// hardcoded fallback.
assertProductionReady();

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const h = crypto.randomBytes(16).toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) { return verifyHash(password, stored); }

function verifyHash(value, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const [salt, hash] = parts;
  if (!salt || !hash) return false;
  let test;
  try { test = crypto.scryptSync(value, salt, 32); } catch { return false; }
  const expected = Buffer.from(hash, 'hex');
  if (test.length !== expected.length) return false;
  return crypto.timingSafeEqual(test, expected);
}

function b64url(buf) { return buf.toString('base64url'); }

function signToken(userId) {
  const secret = effectiveSessionSecret();
  const header = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payload = b64url(Buffer.from(JSON.stringify({
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  })));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token) return null;
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return null;
    const secret = effectiveSessionSecret();
    const expected = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
    const a = Buffer.from(expected);
    const b = Buffer.from(s);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    return payload.sub;
  } catch { return null; }
}

module.exports = { uuid, hashPassword, verifyPassword, verifyHash, signToken, verifyToken, TOKEN_TTL_SECONDS };
