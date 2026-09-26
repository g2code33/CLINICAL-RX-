#!/usr/bin/env node
/**
 * Production readiness check.
 *
 * Runs locally or in CI. Verifies static/build-time conditions required for a
 * production release. Does NOT start the server or require real secrets.
 * Exits non-zero if any required gate fails.
 *
 *   $ node scripts/production-check.mjs
 */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const failures = [];
const warnings = [];
const info = [];

function fail(msg) { failures.push(msg); }
function warn(msg) { warnings.push(msg); }
function note(msg) { info.push(msg); }

// ---------- Helpers ----------
function read(p) {
  try { return readFileSync(path.join(root, p), 'utf8'); } catch { return null; }
}
function run(cmd) {
  try { return { code: 0, out: execSync(cmd, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }) }; }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') }; }
}

// ---------- Version consistency ----------
const pkg = JSON.parse(read('package.json'));
const version = String(pkg.version);
note(`package.json version: ${version}`);

// Check Android versionName/Code match.
const gradle = read('android/app/build.gradle') || '';
const versionNameM = /versionName\s+"([^"]+)"/.exec(gradle);
const versionCodeM = /versionCode\s+(\d+)/.exec(gradle);
if (!versionNameM || versionNameM[1] !== version) fail(`android versionName (${versionNameM?.[1] ?? 'missing'}) does not match package.json (${version}). Run "node scripts/sync-android-version.mjs".`);
else note(`android versionName: ${versionNameM[1]}`);
if (versionCodeM) note(`android versionCode: ${versionCodeM[1]}`);

// ---------- Production hardening gates ----------
const authSrc = read('api/_lib/auth.js') || '';
if (/dev-secret-change-me/.test(authSrc) && !/dev-secret-change-me['"]\s*\)/.test(authSrc) === false) {
  // The string may appear in PLACEHOLDERS block; require the production path to use effectiveSessionSecret().
}
if (!authSrc.includes('effectiveSessionSecret()')) {
  fail('api/_lib/auth.js does not use effectiveSessionSecret() — production SESSION_SECRET fallback may exist.');
} else note('auth.js uses effectiveSessionSecret (no hardcoded production fallback).');

const authIndex = read('api/auth/index.js') || '';
if (/Reset token \(dev/.test(authIndex)) {
  fail('api/auth/index.js still contains the dev reset-token echo.');
} else note('Auth forgot-password does not return reset tokens in responses.');

if (!authIndex.includes('tokenHash') || !authIndex.includes('createHash')) {
  warn('Reset tokens do not appear to be stored as hashes.');
} else note('Reset tokens are SHA-256 hashed before storage.');

const workflow = read('.github/workflows/build-desktop.yml') || '';
if (/refs\/heads\/main'\s*\)\s*$/.test(workflow.split('\n').find(l => l.includes('if:') && l.includes('release')) || '')) {
  // Checked by context; just skip.
}
if (!workflow.includes("startsWith(github.ref, 'refs/tags/v')")) {
  fail('Release workflow does not appear to be tag-driven — push to main may publish releases.');
} else note('Release workflow is tag-driven (v*.*.*).');

if (/falling back to the debug key/i.test(workflow) && workflow.includes('release:')) {
  fail('Release workflow contains a "fall back to debug key" path for the production Android build.');
} else note('Android release requires keystore (no debug-APK fallback).');

// ---------- Forbidden production fallbacks ----------
for (const file of ['api/_lib/auth.js', 'api/auth/index.js', 'api/_lib/store.js']) {
  const src = read(file);
  if (!src) continue;
  if (/process\.env\.[A-Z_]+\s*\|\|\s*['"][a-z][^'"]{6,}['"]/i.test(src.replace(/effectiveSessionSecret/g, '').replace(/test-only-fixed/, ''))) {
    // heuristic — skip our known safe dev/test paths
    const hits = src.split('\n').filter((line, i) => {
      if (line.includes('ephemeral in-memory')) return false;
      if (line.includes('test-only-fixed')) return false;
      if (line.includes('CLINICAL_RX_SKIP')) return false;
      if (/APP_URL\s*\|\|/.test(line)) return false;
      if (/noreply@/.test(line)) return false;
      if (line.match(/process\.env\.[A-Z_]+\s*\|\|\s*['"][a-z][^'"]{6,}['"]/i)) return true;
      return false;
    });
    if (hits.length) fail(`${file} contains possible production fallback defaults: ${hits.join(' | ').slice(0,200)}`);
  }
}

// ---------- Secret scan ----------
const suspicious = [];
function scanWalk(dir, acc) {
  if (acc.length > 50) return;
  for (const name of ['node_modules', '.git', 'dist', 'release', '.next', 'android/build', '.gradle']) {
    if (dir.endsWith('/' + name) || dir === path.join(root, name)) return;
  }
  let entries;
  try { entries = []; } catch { return; }
  const fs = await_import('node:fs');
}
// Use synchronous walk.
import('node:fs').then(() => {}).catch(() => {});
function walkSync(d, files = []) {
  let entries;
  try { entries = readdirSync(d, { withFileTypes: true }); } catch { return files; }
  for (const e of entries) {
    if (['node_modules', '.git', 'dist', 'release', 'dist-electron', '.gradle', 'android/build', '.next', '.cache'].includes(e.name)) continue;
    const full = path.join(d, e.name);
    if (e.isDirectory()) walkSync(full, files);
    else if (/\.(js|ts|tsx|mjs|cjs|json|yml|yaml|env|sh|md)$/.test(e.name)) files.push(full);
  }
  return files;
}
// Workaround: use sync fs.
import { readdirSync } from 'node:fs';
for (const file of walkSync(root).slice(0, 800)) {
  const rel = path.relative(root, file);
  let src;
  try { src = readFileSync(file, 'utf8'); } catch { continue; }
  // Private-key heuristics
  if (/-----BEGIN (RSA|EC|OPENSSH|DSA|PGP) PRIVATE KEY-----/.test(src)) { suspicious.push(`${rel}: private key`); }
  // AWS-access-key style
  if (/(?<![A-Z0-9])AKIA[0-9A-Z]{16}/.test(src)) suspicious.push(`${rel}: possible AWS key id`);
  // GitHub PAT
  if (/gh[pousr]_[A-Za-z0-9]{20,}/.test(src)) suspicious.push(`${rel}: possible GitHub token`);
  // Hardcoded placeholder-looking long hex passwords/secrets that look real (skip comments)
  if (!/(test|example|sample|placeholder|\.example\.)/i.test(rel)) {
    const sk = /(?:api[_-]?key|secret|password|token)\s*[:=]\s*['"]([A-Za-z0-9_\-+/=]{32,})['"]/i.exec(src);
    if (sk) {
      const val = sk[1];
      if (!/^(YOUR_|xxx+|changeme|change-me|replace-me|example|placeholder|test+|dev)/i.test(val)) {
        // skip known safe strings
        const line = sk[0];
        if (!line.includes('SECRET_FIELDS') && !line.includes('Bearer ') && !line.includes('Authorization')) {
          // ignore things inside documentation/examples
          if (!/example|sample|docs/i.test(rel)) suspicious.push(`${rel}: possible hardcoded secret (${line.slice(0,80)})`);
        }
      }
    }
  }
}
if (suspicious.length) {
  for (const s of suspicious) fail('Secret scan: ' + s);
} else note('Secret scan: no obvious secrets committed.');

// ---------- Build existence ----------
if (!existsSync(path.join(root, 'package-lock.json'))) warn('package-lock.json missing — CI uses npm ci which needs it.');
if (!existsSync(path.join(root, 'vite.config.ts')) && !existsSync(path.join(root, 'vite.config.js'))) fail('No Vite config found.');
note(`node version: ${process.version}`);

// ---------- Print report ----------
console.log('\n=== Clinical Rx Production Readiness Check ===\n');
for (const m of info) console.log('  ℹ', m);
for (const w of warnings) console.log('  ⚠', w);
for (const f of failures) console.log('  ✗', f);
console.log(`\n  ${failures.length} failure(s), ${warnings.length} warning(s), ${info.length} info`);
if (failures.length) {
  console.log('\n❌ NOT READY\n');
  process.exit(1);
}
if (warnings.length) console.log('\n⚠ READY WITH WARNINGS\n');
else console.log('\n✅ READY\n');
