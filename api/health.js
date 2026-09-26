// Health endpoint — liveness + coarse configuration state.
// NEVER returns actual secret values — only (set)/(not set) booleans.
const { guard } = require('./_lib/errors.js');
const { validateEnv } = require('./_lib/env.js');

module.exports = guard(async function handler(req, res) {
  const status = validateEnv();
  return res.status(200).json({
    ok: true,
    name: 'clinical-rx-api',
    timestamp: Date.now(),
    mode: status.mode,
    config: {
      kv: status.features.kv,
      email: status.features.email,
      adminReset: status.features.adminReset,
      sessionSecretConfigured: !!(process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32),
    },
    missingRequired: status.mode === 'production' ? status.missingRequired : [],
    warnings: status.warnings,
  });
});
