#!/usr/bin/env node
/**
 * Sync Android versionCode/versionName with package.json.
 *
 * - versionName is read directly from package.json (e.g. "1.11.7").
 * - versionCode is a monotonically increasing integer derived from
 *   MAJOR*10000 + MINOR*100 + PATCH (fits Android's max of ~2100000000).
 *
 * This runs before the Android build so Gradle never builds a stale version.
 * Run as part of `mobile:build`/CI. Idempotent.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = String(pkg.version);
const m = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
if (!m) {
  console.error(`[sync-android-version] Cannot parse version "${version}"; expected MAJOR.MINOR.PATCH`);
  process.exit(1);
}
const [, maj, min, pat] = m.map(Number);
const versionCode = maj * 10000 + min * 100 + pat;

const gradlePath = path.join(root, 'android', 'app', 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
gradle = gradle.replace(/versionName\s+"[^"]+"/, `versionName "${version}"`);
writeFileSync(gradlePath, gradle);
console.log(`[sync-android-version] android versionCode=${versionCode} versionName="${version}"`);
