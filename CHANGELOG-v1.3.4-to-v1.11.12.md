# Clinical Rx — Changelog: v1.3.4 → v1.11.11

**Versions covered:** `v1.3.4` (2026-08-06) → `v1.11.11` (2026-09-26)
**Releases:** 38 tagged versions over ~7 weeks
**Current production version:** [v1.11.11](https://github.com/g2code33/CLINICAL-RX-/releases/tag/v1.11.11)

> Releases without authored notes (v1.3.5–v1.8.17) are summarized from their commit messages and feature milestones in this document. v1.11.1+ release notes are reproduced verbatim from GitHub where they exist.

---

## 📌 TL;DR — What changed since v1.3.4

| Area | v1.3.4 state | v1.11.11 state |
|---|---|---|
| **AI modules** | A handful of core AI features (Tutor, Quizzer, basic interactions) | **27 modules**: 8 core + 15 PharmD Journey sections, plus Community Pharmacy Preceptor, Drug of Choice Lab, IV Compatibility, Career Counsellor, Settings Helper. Cross-module key borrowing. |
| **Community Pharmacy** | Not present | Full workstation: encounter tracker, Ghanaian-retail drug library with counselling points, practice scenarios, study list, bundler, AI Preceptor with live workstation context. |
| **Health APIs** | Basic search | Offline history, favourites, labels, tags, notes, keyboard shortcuts, professional styling, dark mode. |
| **Profile persistence** | Volatile across updates, auto-logout on refresh failure | **Persists forever**: stable storage key, 3-snapshot rolling backups with auto-recovery, no auto-logout, explicit Sign-out/Settings-reset only paths. |
| **Windows desktop** | Inconsistent builds | Auto-updating signed installer (.exe), published on every version tag. |
| **Linux desktop** | Not published | `.AppImage` portable + `.deb` package + auto-updater metadata (`latest-linux.yml`). |
| **Android APK** | Debug APKs or no build | **Signed release APK** on every tag, jarsigner-verified (never a debug-signed APK), auto-synced `versionCode`/`versionName`. |
| **CI/Release pipeline** | Manual / ad-hoc | **Tag-driven** releases (main-push runs CI only; publishing requires `vX.Y.Z` tag), fail-closed security gates, production-readiness static check. |
| **Security** | Hardcoded dev fallback secret, reset tokens in responses | Fail-closed production boot; 32-byte single-use SHA-256 hashed reset tokens; generic auth responses; timing-safe admin reset; no secret leakage via health endpoint/errors; Electron safeStorage vault with no renderer `get()`. |
| **Accessibility/UI** | Native `confirm()` dialogs, icon-only buttons without labels | `aria-label` on every icon-only button, Modal-based `useConfirm()` dialogs (dark-mode aware, keyboard accessible). |
| **Tests** | Partial | All **15** existing suites pass (api, ward, phase1–12, unified); `typecheck` and `vite build` clean. |

---

## 🔖 Versions v1.3.5 – v1.8.17 _(2026-08-06 → 2026-09-05)_

These versions carried the rapid feature build-up between the initial v1.3.4 baseline and the v1.11 production reboot. Highlights, grouped by feature:

### AI expansion (v1.3.5 → v1.8.x)
- **Live-preview AI card** + step checklist unified across all AI sections (preserving the left-hand TaskIndicator).
- **Quiz auto-save + exit**: every finished quiz is persisted (including time-outs); explicit Exit button shown after review.
- **27 AI modules** introduced one by one across this range:
  - Core: Tutor, History & PE Quizzer, Drug of Choice Lab, IV Compatibility, Interactions, Career Counsellor, Settings Helper.
  - Community Pharmacy Preceptor (injects latest 8 encounters + 15 drug cards + low-confidence cases into every turn).
  - PharmD Journey (15 sections): Pre-clinical, Pharm Chem, Pharmacognosy, Pharm Practice, Pharmacology I & II, Pharmaceutics I & II, Clinical Pharm, Pharmacotherapeutics I–IV, Clerkship, Career Planning.
- **Cross-module key borrowing** — a single working API key automatically powers every AI section.
- **Ward Round AI module** added.

### Community Pharmacy workstation
- Encounter tracker, drug library (common Ghanaian retail drugs with counselling points), practice scenarios, study list, bundler, integrated AI Preceptor.

### UI/UX & reliability
- **Global contrast safety net** — fixes white-on-tint contrast on the current-level highlight (Academic Settings, Journey timeline, Sync plan).
- NavLink double-active bug fixed (My Journey + child both showing as green) across all 4 NavLink sites (desktop rail, mobile drawer, bottom bar).
- Favourite button, tag-editor persistence, history-modal dark-mode contrast fixes.
- Service Worker cache repeatedly bumped to bust stale shells.

### Phase 10 / Production foundation (v1.5.0 → v1.6.2)
- **Database durability**: atomic upsert, schema migration, dead-code cleanup.
- **Backup/restore**: fixed data loss (career records were missing on restore); extracted `restoreBackup`; added end-to-end journey tests.
- **Pre-update safety backup** + API-key redaction in backups.
- Architecture + user guide + disaster-recovery documentation added.
- v1.6.0 tagged "production ready" — Phase 10 final integration, testing, optimization.

---

## 📦 v1.11.1 — AI Configuration Overhaul & Community Pharmacy _(2026-09-05)_

> This was the first v1.11 production release and represents the culmination of the v1.8.x feature builds.

### What's New
- **27 AI modules**, each with its own Provider / Model / API Key / Test button in Settings → AI.
- **Cross-module key borrowing**: one working API key powers every AI section automatically.
- **Community Pharmacy Preceptor** (CP mode) injects live workstation context (latest 8 encounters, 15 drug cards, low-confidence cases) into every Preceptor turn.
- **Community Pharmacy Workstation**: encounter tracker, drug library (common Ghanaian retail drugs with counselling points), practice scenarios, study list, bundler, AI Preceptor.
- **Health APIs** (carried from v1.8.17): offline history, favorites/labels/tags/notes, keyboard shortcuts, professional styling, dark-mode contrast.

### Fixes
- NavLink double-active bug fixed across all 4 NavLink sites.
- Favourite button, tag-editor persistence, history-modal dark-mode contrast.
- Service Worker cache bumped to bust stale shell.

### Tech
- Version **1.11.1**
- Build: clean typecheck + vite build (main bundle 1.16 MB / 326 KB gzip).

---

## 📦 v1.11.2 — Profile persists forever _(2026-09-25)_

### Local profile now persists forever
Your local profile is created **once** and survives everything:

- ✅ **App updates** — storage key `clinical-rx:v1` permanently stable, never renamed by cache/version bumps.
- ✅ **Closing and reopening** — profile, notes, ward rounds, bundles, AI config all stay put.
- ✅ **Browser crashes / partial writes** — **3-snapshot rolling backup** for profile + settings under `clinical-rx:profile-backup:v1`. Automatic recovery from corruption before you ever see Onboarding.
- ✅ **No auto-logout** — `refreshSession()` only sets a `needs-reauth` flag for cloud sync; it **never** disconnects you. The explicit **Sign out** button in Sync Center is the only way to log out, and even that keeps all local data.
- ✅ **Service Worker** only deletes old `clinical-rx-*` HTTP caches; never touches localStorage or IndexedDB.
- ✅ `saveProfile()` defensively preserves `profile.id` + `createdAt` — a buggy re-save can never manufacture a "new identity".

### What counts as a deliberate wipe
- 🗑 **Settings → Clear all data** (red, double-confirmed) — the intentional factory reset, the only code path that removes the local profile.
- ☁️ **Sign out** in Sync Center — drops cloud session only; local profile + all records remain.

### Tech
- Version **1.11.2**; SW cache `clinical-rx-v10`.

---

## 📦 v1.11.3 _(2026-09-25)_

Version bump + Service Worker cache refresh.

- Version **1.11.3**; SW cache `clinical-rx-v11`.
- Includes all profile-persistence guarantees from v1.11.2.

---

## 📦 v1.11.4 — CI build fix _(2026-09-26)_

First pass at fixing the failing GitHub Actions build (Android SDK step breaking on new runners because `android-actions/setup-android@v3` was deprecated and EOFing).

### Fixes
- **Android SDK setup replaced** with a manual cmdline-tools download + `sdkmanager` install of `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.
- `actions/setup-java` v4 → **v5** (silences Node 20 deprecation warning).
- Node.js unified to **22** across the whole job (Capacitor CLI 8 requires Node ≥ 22).
- `npm ci --ignore-scripts` + explicit `npm rebuild better-sqlite3 --build-from-source` for native-module reliability.
- Android upload step fell back to debug APK when no signing keystore was configured (this was later **removed** in v1.11.11 for security — debug APKs are never published as production releases).

- SW cache `clinical-rx-v12`.

---

## 📦 v1.11.5 — CI build fix _(2026-09-26)_

Second CI fix pass after v1.11.4's manual cmdline-tools script failed on path layout.

### Fixes
- **Android SDK**: upgraded to `android-actions/setup-android@v4` (latest, maintained) with its `packages` input — one-step install of `platform-tools`, `platforms;android-34`, `build-tools;34.0.0`.
- **Windows native module build**: removed `--ignore-scripts` + manual rebuild; `npm ci` now runs the project's `postinstall` (`scripts/rebuild-electron-sqlite.mjs`) which downloads the Electron `better-sqlite3` prebuilt via `@electron/rebuild` + `prebuild-install` — no compiler needed on the runner.
- `setup-java` **v5**; Node.js **22** unified.

- SW cache `clinical-rx-v13`.

---

## 📦 v1.11.6 — CI build GREEN ✅ _(2026-09-26)_

All three build artifacts succeed on GitHub Actions: Windows desktop, Linux desktop, Android APK.

### Fixes
- **Windows desktop** fixed via `@electron/rebuild`/`prebuild-install` (no native compile).
- **Android APK** — three issues:
  1. Runner pinned to **ubuntu-22.04** (`ubuntu-latest` was migrating to 26.04 which breaks JDK+Android).
  2. Installed **`platforms;android-36`** + **`build-tools;36.0.0`** (project compiles against `compileSdkVersion=36`, so installing only 34 caused Gradle "failed to find target android-36").
  3. Writes `android/local.properties` with `sdk.dir=...` before invoking Gradle.
- Gradle invocations now pass `--stacktrace` for future failures.
- `setup-java` v5; `android-actions/setup-android@v4`; Node 22 unified.
- Android upload falls back to debug APK when no signing keystore is configured (replaced in v1.11.11 by a hard-fail).

- Version **1.11.6**; SW cache `clinical-rx-v14`.

---

## 📦 v1.11.7 — CI build GREEN ✅ (all artifacts) _(2026-09-26)_

All CI jobs pass and publish artifacts.

- ✅ **Windows desktop** — .exe + latest.yml published
- ✅ **Linux desktop** — .AppImage + .deb + latest-linux.yml published
- ✅ **Android APK** — built and uploaded

### Fixes in this release
1. Windows native-module build via postinstall / @electron/rebuild.
2. Android SDK v4 action with packages `platform-tools platforms;android-36 build-tools;36.0.0`.
3. JDK 17 → **21** (Android Gradle Plugin 8.13.0 requires JDK 21).
4. Runner pinned to `ubuntu-22.04`.
5. `local.properties` written explicitly before Gradle.
6. `setup-java` v5; Node 22 unified.
7. Android upload fell back to debug APK (**superseded** by v1.11.11 hard-fail).

- SW cache `clinical-rx-v15`.

---

## 🛡 v1.11.8 / v1.11.9 / v1.11.10 — Production Hardening sprints _(2026-09-26, tags deleted)_

Intermediate tags that were deleted (superseded by v1.11.11) during the security-hardening pass. Work delivered:
- Removed hardcoded `dev-secret-change-me` SESSION_SECRET; centralized env validation in `api/_lib/env.js` (fails closed in production, logs only secret **names**, never values).
- Forgot-password hardened: random 32-byte tokens, 30-min TTL, single-use, SHA-256 hashed in Redis, never returned in production responses; dev visibility gated on `CRX_DEV_EXPOSE_RESET_TOKEN=1` + non-production.
- Admin reset uses `timingSafeEqual`; requires `ADMIN_RESET_TOKEN`.
- Generic auth responses prevent account enumeration; `/api/health` returns booleans only; placeholder secrets rejected at startup.
- Tag-driven releases; Android signing-required guard; `npm run production:check`; Android version-sync script.
- UI: `aria-label` on all ×/🗑 icon-only buttons; bare `window.confirm()` calls replaced with Modal-based `useConfirm()`.
- Fixed AGP 8.13 APK output path (variant subdirectories, glob discovery).
- All 15 test suites pass.

These were rolled up and superseded by **v1.11.11** (below).

---

## 🚀 v1.11.11 — Production Hardening (all platforms released) _(2026-09-26) — **Current production**_

https://github.com/g2code33/CLINICAL-RX-/releases/tag/v1.11.11

All three targets now ship: **Windows**, **Linux**, and **Android (signed APK)**.

### Assets published on this release
| Asset | Size | Purpose |
|---|---|---|
| `ClinicalRx-Setup-1.11.11.exe` | 96 MB | Windows installer (auto-update) |
| `ClinicalRx-1.11.11.AppImage` | 126 MB | Linux portable |
| `clinical-rx_1.11.11_amd64.deb` | 86 MB | Linux Debian/Ubuntu package |
| `clinical-rx-1.11.11.apk` | 8 MB | **Signed** Android release APK (arm64 + x86_64; verified non-debug) |
| `latest.yml` / `latest-linux.yml` | — | Auto-updater metadata |

### Security (fail-closed)
- Hardcoded `dev-secret-change-me` SESSION_SECRET removed. Production refuses to start when `SESSION_SECRET` / Upstash KV credentials are missing; only secret **names** are logged, never values.
- Forgot-password: random 32-byte tokens, 30-min TTL, single-use, SHA-256 hashed in Redis, never returned in responses in production; dev-visibility gated on `CRX_DEV_EXPOSE_RESET_TOKEN=1` + non-production.
- Admin reset uses `timingSafeEqual`; requires `ADMIN_RESET_TOKEN` configured.
- Generic auth responses prevent account enumeration; `/api/health` returns booleans only; placeholder secrets rejected at startup.
- Electron preload is a minimal typed IPC bridge; secret vault uses OS `safeStorage` with **no `get` exposed to the renderer**.

### Release pipeline
- **Tag-driven releases only** (`vX.Y.Z`). Main-branch push runs CI and never publishes to users.
- **Android production guard**: all four keystore secrets required; debug APKs **never** published; `jarsigner` verifies non-debug signature; absolute-path APK discovery that ignores `*-unaligned.apk` and tolerates AGP output subdirectories.
- `actions/setup-java` v5; Node 22 unified; `ubuntu-22.04` pinned.
- `npm run production:check` static gate in CI (version sync, no fallbacks, tag workflow, signing guard, basic secret scan).

### Versioning & UI
- `scripts/sync-android-version.mjs` keeps Android `versionName` / `versionCode` in lockstep with `package.json` (`1.11.11` → `11111`); mobile build scripts auto-sync.
- All icon-only ×/🗑 buttons have `aria-label`. Bare `window.confirm()` calls replaced with the project's Modal-based `useConfirm()` dialog (consistent dark-mode/accessible style).

### Tests
- All **15** existing suites pass: api, ward, phase1–12, unified.
- `typecheck` and `vite build` clean.
- Production readiness check: ✅ READY (0 failures, 0 warnings).

### Deployment requirements
- **Web** (Vercel/Netlify) production must set `SESSION_SECRET`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. Without these the API correctly refuses to boot instead of silently using insecure defaults.
- **Android keystore secrets** (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`) configured in repo Settings → Secrets; future tags will automatically publish signed APKs.

---

## 📊 Release summary table

| Version | Date | Headline | Status |
|---|---|---|---|
| v1.3.4 | 2026-08-06 | Baseline (feature build begins) | Superseded |
| v1.3.5–v1.3.8 | 2026-08-06 | Live-preview AI card, quiz auto-save, rapid fixes | Superseded |
| v1.4.0–v1.4.3 | 2026-08-06 | UI/contrast + AI expansion | Superseded |
| v1.5.0 | 2026-08-24 | Phase 10 durability + migration + backups | Superseded |
| v1.6.0 / v1.6.2 | 2026-08-24 | "Production ready" milestone, docs | Superseded |
| v1.7.0 | 2026-08-26 | Consolidation | Superseded |
| v1.8.0–v1.8.17 | 2026-08-29 → 2026-09-05 | Health APIs, contrast safety net, Ward Round AI, fixes | Superseded |
| v1.11.1 | 2026-09-05 | 27 AI modules, Community Pharmacy workstation | Superseded |
| v1.11.2 | 2026-09-25 | Profile persists forever (rolling backups, no auto-logout) | Superseded |
| v1.11.3 | 2026-09-25 | Version + SW cache bump | Superseded |
| v1.11.4 | 2026-09-26 | CI build fix (Android SDK manual setup) | Superseded |
| v1.11.5 | 2026-09-26 | CI build fix (android-actions v4, Windows prebuilds) | Superseded |
| v1.11.6 | 2026-09-26 | CI GREEN — all three artifacts | Superseded |
| v1.11.7 | 2026-09-26 | CI GREEN — JDK 21, ubuntu-22.04 pinned | Superseded |
| **v1.11.11** | **2026-09-26** | **Production hardening complete — signed APK, tag-driven releases, fail-closed security, all tests green** | **✅ Latest / Production** |

---

_Generated 2026-09-26. Sources: GitHub release bodies for v1.11.1+, commit messages (`git log v1.3.4..v1.8.17`) for earlier feature-range notes._

---

## 🛠 v1.11.12 — Fix false "Update available" pill _(2026-09-27)_

Fixes a bug where the header showed **🔄 Update available** even while running the latest version, which happened when you manually installed a new installer over an existing install that had previously downloaded/staged an older update. electron-updater sees the stale cache and fires `update-available` on first launch despite the running binary being newer.

- **Main-process semver gate**: in `electron/main.ts`, an inline `cmpVer()` compares `a.b.c` numerically and only forwards `update-available` to the renderer when the remote version is strictly greater than `app.getVersion()`. Equal or older remotes collapse to `up-to-date`.
- `autoUpdater.allowPrerelease = false`, `allowDowngrade = false` set explicitly.
- **Race fix** in `useUpdateState()`: `getVersion`/`installType`/`getState` are awaited together via `Promise.all` (previously `getState` ran before `meta` loaded, so the post-restart "mark up-to-date" guard never fired). Added a cancelled flag.
- Header auto-check now waits 2.5 s after launch and for meta to load before checking, preventing a flash-of-available.
- Version **1.11.12**; SW cache `clinical-rx-v20`; Android versionCode 11112.
- Windows/Linux/Android all signed and published.
