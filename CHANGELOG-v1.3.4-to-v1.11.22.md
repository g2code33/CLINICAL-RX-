# CLINICAL Rx — Changelog (v1.3.4 → v1.11.22)

## v1.11.22 — Hotfix: AI works with pre-existing desktop keys (2026-09-28)
- **Regression fix for desktop users:** v1.11.20 stopped reading API keys from
  the OS keychain on desktop, so users who saved their keys before v1.11.20
  (when keys lived ONLY in safeStorage, never in `settings.ai.apiKey`) saw
  "GENERAL ASSISTANT STATUS: STILL NOT READY" — the orchestrator thought a
  key existed but `aiChat()` saw an empty `cfg.apiKey` and bailed.
  - Added `secret:get` IPC (restricted to `ai:*` accounts only) so the
    renderer can pull plaintext from safeStorage when needed.
  - New `resolveKey(moduleKey)` helper checks, in order: session memory →
    `settings.ai.<k>.apiKey` (cloud / new saves) → OS keychain via the new
    IPC (legacy desktop keys). All outbound AI calls now go through it.
  - `getKeyStatus()` now rehydrates the plaintext into `sessionKeys` so the
    synchronous `getKeyForRequest()` and `vaultKeys` cache stay in sync.
  - `cloudProvider.generate()`, `runAiModule()`, Bundles ask-AI and
    Community Pharmacy AI flows all resolve a real key before building the
    HTTP request, so desktop installs never send an empty Authorization
    header again.
- `AiGenerateRequest` now carries `configKey` so the provider knows which
  vault slot to open when borrowing a key across modules.
- Service worker cache bumped to `clinical-rx-v30`.

---

## v1.11.21 — Hotfix: Community Pharmacy modules + quiet console (2026-09-28)
- **Desktop data loss fix:** the Electron main-process module allowlist was
  missing the Community Pharmacy workstation tables (`cpEncounter`,
  `cpDrugCard`, `cpScenario`). Any save to those modules on desktop threw
  `Invalid module` at the IPC layer, meaning CP encounters, drug cards and
  scenarios never made it to SQLite. Added them to `ALLOWED_MODULES`.
- **Quieter DevTools console:** the local-AI runtime probe no longer
  fires on boot (which caused `ERR_CONNECTION_REFUSED` lines for
  127.0.0.1:11434/1234/8080 when the user didn't have Ollama/LM Studio
  running). Probing now only happens when (a) the user has at least one
  AI module actually set to "local" mode, or (b) they tap "Rescan local
  runtimes" in AI Settings.
- Bumped `clinical-rx-v29` service worker cache.

---

## v1.11.20 — Cloud sign-in persistence + API-key cloud sync (2026-09-28)

## v1.11.20 — Cloud sign-in persistence + API-key cloud sync (2026-09-28)

Two long-standing user requests addressed in this patch:

### 🔐 Cloud sign-in now survives reloads — forever until you log out
- **Bug:** after signing into a cloud account on desktop, the app would show
  as signed-out the next time you opened it.
- **Root cause:** the dual-write storage adapter (localStorage ↔ SQLite) was
  serving SQLite results unconditionally once SQLite had *any* rows for a
  module. On first launch, default settings (with `onlineAccount.connected:
  false`) were written to SQLite BEFORE the Electron preload bridge attached.
  After sign-in, writes dual-wrote correctly, but SQLite still held the stale
  default record for the `settings` module because the previous reconciliation
  only migrated when SQLite was *completely* empty.
- **Fix:** `adapter.list(module)` now always merges both backends by id and
  keeps the record with the LATEST `updatedAt` (last-write-wins). Any newer
  localStorage copy is back-filled to SQLite, and any newer SQLite copy is
  stashed back to localStorage so the renderer cache stays hot. Sign-in
  state, lastSynced timestamps and the auth token now reliably survive
  reloads on desktop, web, and Android.

### ☁️ API keys NOW sync with your cloud account
- **Previous behaviour (Phase 7 §36):** `apiKey` and `localModel` were
  stripped before upload and stripped again on pull — "keys never leave the
  device".
- **New behaviour (per explicit user request):**
  - `apiKey` travels with your account, end-to-end with the rest of your
    profile. Signing in on a new device / reinstall restores your keys
    automatically.
  - On desktop, restored keys are re-stashed in the OS credential store
    (safeStorage) automatically; outbound AI requests still run through
    `aiFetchWithKey()` so plaintext never comes back to the renderer.
  - On web, restored keys are held in session memory (just like typed keys)
    and mirrored into settings so the next sync round-trips them.
  - `localModel` (a filesystem path on the local machine) continues to be
    stripped — it has no meaning on another device.
  - Backups (`.crxbak` files) still redact keys — download files should
    not be leaking secrets.
- **Server defence-in-depth:** `/api/aiConfig` now allows `apiKey` (capped
  at 500 chars) but still rejects generic credential-looking fields
  (`secret`, `token`, `password`, `api_key`).

### Other fixes
- **Auth page** now routes sign-in/sign-up through `authService.signIn()` /
  `signUp()` (the same code path used by Settings → Disconnect/reconnect),
  so `cloudUserId` is always set, device identity is ensured, and the
  account record is persisted through one tested path.
- `setApiKey()` now mirrors the key into `settings.ai.<module>.apiKey` and
  queues a debounced cloud push; `removeApiKey()` clears the field from
  settings too.
- `getKeyStatus()` will now transparently rehydrate a cloud-restored key
  into OS/session storage the first time it's queried.
- Inline help text on the AI Settings page updated to reflect the new sync
  behaviour.
- Bumped `clinical-rx-v28` service worker cache so 1.11.20 clients pick up
  the new bundle on reload.

### Tests
- Phase 7 §36, Phase 8 §6, and `api.test.js` updated from the old
  "keys never sync" assertions to the new "keys sync, localModel doesn't"
  behaviour, including a new server-side check that generic credential
  fields (token/secret/password) are still rejected even though `apiKey`
  is allowed.
- All 15 test suites green; tsc, vite, electron tsc, and production-check
  all pass.

---

## v1.11.19 — Courses page one-level UX (2026-09-28)
- Courses page no longer shows duplicate pills; the journey is now a single
  flat list of semesters with current level highlighted.
- Shipped to GitHub releases with `.deb`, `.exe`, `.AppImage`, `.apk`.
- All 15 test suites green, CI (Linux + Windows) green.

