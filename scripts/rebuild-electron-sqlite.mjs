#!/usr/bin/env node
// Installs the Electron-compatible prebuilt binary for better-sqlite3 so the
// desktop app works in dev and in CI packaging — no native compiler needed.
// Runs as the root "postinstall" hook (also runs on `npm ci`).
//
// Why: better-sqlite3 ships separate prebuilt binaries per runtime/ABI
// (Node vs Electron). `npm install` grabs the Node build; Electron needs the
// `electron-v130` build (Electron 33). electron-builder normally rebuilds at
// package time, but CI on Windows cannot compile native modules (no Visual
// Studio on the runner), so we swap in the Electron prebuild right here and
// tell electron-builder to skip its rebuild step (build.npmRebuild = false).
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

// Opt-out: explicitly skip (e.g. web-only installs).
if (process.env.CLINICAL_RX_SKIP_ELECTRON_REBUILD === '1') process.exit(0);

// Vercel web deploys don't need an Electron binary.
if (process.env.VERCEL) process.exit(0);

// No Electron installed -> plain web build, nothing to do.
if (!existsSync(path.join(root, 'node_modules', 'electron', 'package.json'))) process.exit(0);

const cli = path.join(root, 'node_modules', '@electron', 'rebuild', 'lib', 'cli.js');
if (!existsSync(cli)) {
  console.warn('[electron-rebuild] @electron/rebuild not installed; skipping better-sqlite3 Electron rebuild.');
  process.exit(0);
}

// The CI workflow sets npm_config_build_from_source=true, which makes
// prebuild-install refuse to download prebuilt binaries. Neutralize it here.
const env = { ...process.env };
delete env.npm_config_build_from_source;

console.log('[electron-rebuild] Installing Electron prebuilt binary for better-sqlite3…');
const res = spawnSync(process.execPath, [cli, '-f', '-w', 'better-sqlite3'], {
  cwd: root,
  env,
  stdio: 'inherit',
});

if (res.status !== 0) {
  console.error('\n[electron-rebuild] FAILED to install the Electron prebuilt binary for better-sqlite3.');
  console.error('The desktop build needs it (Electron 33 = ABI 130). Fix the error above, or for a');
  console.error('web-only install use: npm install --ignore-scripts  or  CLINICAL_RX_SKIP_ELECTRON_REBUILD=1 npm install\n');
  process.exit(res.status ?? 1);
}

console.log('[electron-rebuild] better-sqlite3 ready for Electron ✔');
