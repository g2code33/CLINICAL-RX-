'use strict';
/**
 * Centralized production environment validation.
 *
 * - Fails closed in production when required secrets are missing.
 * - NEVER prints secret values in logs.
 * - Dev mode may use an ephemeral random session secret; test mode uses a
 *   fixed, non-production string. Both are impossible to enable accidentally
 *   in production because NODE_ENV/VERCEL are checked.
 */

const crypto = require('crypto');

function detectMode() {
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV === 'development') return 'development';
  if (process.env.VERCEL === '1' || process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

function validateEnv() {
  const mode = detectMode();
  const missingRequired = [];
  const warnings = [];

  if (mode !== 'test') {
    const sess = process.env.SESSION_SECRET;
    if (!sess || sess.length < 32) {
      if (mode === 'production') {
        missingRequired.push('SESSION_SECRET (min 32 bytes, cryptographically random)');
      } else {
        warnings.push('SESSION_SECRET not set — ephemeral in-memory secret will be used (dev only).');
      }
    }
  }

  const hasKvUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const hasKvToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  if (mode === 'production') {
    if (!hasKvUrl || !hasKvToken) {
      missingRequired.push('KV_REST_API_URL + KV_REST_API_TOKEN (Upstash/Redis REST credentials)');
    }
  } else if (!hasKvUrl || !hasKvToken) {
    warnings.push('KV storage not configured — cloud sync/auth uses in-memory storage (dev only).');
  }

  const email = !!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL);
  if (mode === 'production' && !email) {
    warnings.push('RESEND_API_KEY / FROM_EMAIL not set — forgot-password email flow is disabled (security-question reset still works).');
  }

  if (mode === 'production' && process.env.ADMIN_RESET_TOKEN && process.env.ADMIN_RESET_TOKEN.length < 32) {
    warnings.push('ADMIN_RESET_TOKEN is too short (<32 chars).');
  }

  const PLACEHOLDERS = [
    'dev-secret-change-me', 'changeme', 'change-me', 'secret', 'password',
    'your-secret-here', 'xxx', 'replace-me', 'example', 'test', 'debug',
  ];
  for (const key of ['SESSION_SECRET', 'ADMIN_RESET_TOKEN', 'KV_REST_API_TOKEN', 'RESEND_API_KEY']) {
    const v = process.env[key];
    if (v && PLACEHOLDERS.includes(String(v).toLowerCase().trim())) {
      if (mode === 'production') missingRequired.push(`${key} is a placeholder — replace with a real secret`);
      else warnings.push(`${key} looks like a placeholder value.`);
    }
  }

  return {
    ok: mode !== 'production' || missingRequired.length === 0,
    mode,
    missingRequired,
    warnings,
    features: {
      kv: hasKvUrl && hasKvToken,
      email,
      adminReset: !!process.env.ADMIN_RESET_TOKEN,
    },
  };
}

function assertProductionReady() {
  const status = validateEnv();
  if (status.mode === 'production' && !status.ok) {
    const msg = [
      '========================================',
      'CLINICAL RX PRODUCTION CONFIG INVALID',
      '========================================',
      ...status.missingRequired.map((m) => `  ✗ MISSING: ${m}`),
      ...status.warnings.map((w) => `  ⚠ ${w}`),
      '========================================',
      'Refusing to start. Set the missing variables and redeploy.',
    ].join('\n');
    console.error(msg);
    throw new Error('Production config invalid — see server logs. (Secrets are never logged.)');
  }
  if (status.warnings.length) {
    console.warn('[clinical-rx] env warnings (non-fatal):');
    for (const w of status.warnings) console.warn('  ⚠', w);
  }
  return status;
}

function effectiveSessionSecret() {
  const configured = process.env.SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  const mode = detectMode();
  if (mode === 'production') {
    throw new Error('SESSION_SECRET is not set — refuse to sign tokens in production.');
  }
  if (mode === 'test') return 'test-only-fixed-secret-do-not-use-in-prod-please-32bytes!';
  if (!globalThis.__CR_DEV_SESSION_SECRET__) {
    globalThis.__CR_DEV_SESSION_SECRET__ = crypto.randomBytes(48).toString('hex');
    console.warn('[clinical-rx] DEV MODE: generated ephemeral SESSION_SECRET. Set SESSION_SECRET to persist sessions across restarts.');
  }
  return globalThis.__CR_DEV_SESSION_SECRET__;
}

function canSendResetEmail() {
  return detectMode() !== 'production' || !!(process.env.RESEND_API_KEY && process.env.FROM_EMAIL);
}

function allowDevResetTokenReturn() {
  return detectMode() === 'development' && process.env.CRX_DEV_EXPOSE_RESET_TOKEN === '1';
}

module.exports = {
  detectMode,
  validateEnv,
  assertProductionReady,
  effectiveSessionSecret,
  canSendResetEmail,
  allowDevResetTokenReturn,
};
