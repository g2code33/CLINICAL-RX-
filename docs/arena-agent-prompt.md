# Arena Agent Handoff — CLINICAL Rx

Working brief for any coding agent picking up `g2code33/CLINICAL-RX-`.
Keep this file up to date when the architecture changes.

---

## 1. What the project is

**CLINICAL Rx** — an offline-first clinical learning app for pharmacy/clinical
students. The user records what they encounter and learn each clinical day, and
the app turns it into revision, quizzes, bundles and AI study help.

It ships as **four targets from one codebase**:

| Target | How | Notes |
| --- | --- | --- |
| Web (PWA) | Vercel | `localStorage` adapter, service worker on |
| Desktop | Electron (Windows + Linux) | SQLite adapter via IPC, service worker off |
| Android | Capacitor 8 | Signed APK built by CI, in-place updates work |
| API | Vercel serverless (`api/`) | 5 functions, Redis/KV or in-memory |

**Stack:** React 18 · TypeScript · Vite 6 · Tailwind 3 · Zustand ·
react-router-dom (**HashRouter**) · Electron · Capacitor · Drizzle + better-sqlite3.

---

## 2. Session rules

- **Branch is fixed per session** (e.g. `arena/<id>-clinical-rx`). Always work on
  it. Never create or switch to another branch — Arena tracks the session by
  branch name and work elsewhere is lost.
- **Sandbox resets git between turns.** Start every turn with:
  ```bash
  git fetch origin main && git fetch --unshallow origin   # ignore errors
  git checkout -f origin/main -B <your-session-branch>
  ```
  Note this **discards uncommitted work** — commit before you finish a turn.
- Commit after each feature/fix batch using `feat:` / `fix:` / `ci:` / `chore:`.
- The user sometimes pushes from their own VSCode between turns. **Re-fetch
  `origin/main` before pushing**; rebase and use `--force-with-lease` only when
  genuinely needed.

### Getting work onto `main`

The user wants fast iteration (no PR review). Depending on the agent's
permissions one of these applies:

- **Agent can push to main:** `git push origin HEAD:main`.
- **Agent restricted to the session branch** (common on Arena): push the branch,
  then the user fast-forwards:
  ```bash
  git fetch origin
  git merge --ff-only origin/<session-branch>
  git push origin HEAD:main
  ```

Either way CI fires the moment the commit lands on `main`.

---

## 3. Release / bump protocol

Triggered by the user saying **"bump"**, **"push and bump"** or **"ship"**.

1. **Verify — all five must pass:**
   ```bash
   npm run typecheck
   npm run build:web
   npm run smoke
   npm test               # api + ward rounds
   npm run build:electron
   ```
2. `npm version patch --no-git-tag-version` (or `minor`/`major`).
3. **Also update `android/app/build.gradle`** — bump `versionName` to match and
   increment `versionCode` by 1. CI does *not* do this for you; a stale
   `versionCode` breaks in-place APK updates.
4. Commit `release: vX.Y.Z`, then land it on `main`.
5. **Watch CI:**
   ```bash
   gh run list --limit 3
   gh run watch <id> --exit-status
   gh release view v<version> --json assets --jq '.assets[].name'
   ```

CI ("Build & Release Desktop App") publishes: Windows `.exe` + `latest.yml`,
Linux `.deb`/`.AppImage` + `latest-linux.yml`, and a signed
`clinical-rx-<version>.apk`. Keystore values come from repo secrets —
**never print or commit them**.

> ⚠️ **Workflow files are not pushable by the bot** (token lacks the `workflows`
> permission). The editable template is **`docs/workflow-build-desktop.yml`**.
> To change CI: edit the template, push, then have the user run:
> ```bash
> git pull origin main
> cp docs/workflow-build-desktop.yml .github/workflows/build-desktop.yml
> git add -A && git commit -m "ci: ..." && git push origin main
> ```
> Or ask them to grant the GitHub App the "Workflows" permission.

---

## 4. Architecture map

```
src/
├── App.tsx                 # routes, theme, startup queues (AI, backup, reminders, weekly quiz, ward AI)
├── components/
│   ├── Layout.tsx          # sidebar + mobile drawer + bottom nav  ← add nav entries here
│   ├── Modal.tsx           # Modal + TagInput
│   ├── ui.tsx              # PageHeader, StatCard, EmptyState, Pill, PasswordInput
│   ├── CommandPalette.tsx  # Ctrl+P     ← register new destinations
│   ├── SearchModal.tsx     # Ctrl+K     ← register new record types
│   ├── WardQuickCapture.tsx / WardEntryCard.tsx
│   └── TaskIndicator, UndoToast, SyncIndicator, UpdateBadge, …
├── pages/                  # Dashboard, ClinicalDays, WardRounds, Calendar, Diseases,
│                           # Medicines, Investigations, Questions, Revision, Quiz,
│                           # QuestionBank, Progress, Bundles, AiChat, Settings, Admin, Auth
├── services/
│   ├── ai.ts               # provider transport (OpenAI/Anthropic/OpenRouter/NVIDIA/custom) + SSE
│   ├── aiTools.ts          # runAiModule, getEffectiveAiConfig, memory, quiz gen  ← AI entry point
│   ├── aiTaskQueue.ts      # offline AI retry queue
│   ├── wardRounds.ts       # ward round CRUD, search, digests, compartment sync
│   ├── wardAi.ts           # ward analysis, per-entry Ask AI, NL interpretation, AI queue
│   ├── bundler.ts          # bundle generation/merge + ward-round bundles
│   ├── autoBundle.ts       # automatic daily/weekly bundling + reconnect timer
│   ├── daySync.ts          # clinical day → compartments
│   ├── syncEngine.ts / syncClient.ts   # cloud sync + offline queue
│   └── srs, streaks, reminders, weeklyQuiz, questionBank, backup, export, privacy, defaults
├── stores/                 # data.ts (main), tasks.ts, ui.ts, notifications.ts
├── db/                     # adapter.ts (contract), localStorageAdapter, electronAdapter
└── types/index.ts          # ModuleType + every record shape

electron/{main,preload}.ts + electron/db/{schema,database}.ts
api/            auth/index.js, sync.js, aiConfig.js, admin/index.js, health.js, _lib/*
android/        Capacitor project (Node ≥22 + JDK 21)
```

### Storage model

**Everything is a JSON blob in one KV table**, keyed by `(module, id)`:

```ts
StorageAdapter { list(module) · get(module,id) · put(module,id,data,createdAt,updatedAt) · remove(module,id) }
```

SQLite (`records` table) on desktop, one `localStorage` key on web. To add a
record type you must touch **all** of these:

1. `src/types/index.ts` — add to the `ModuleType` union + define the interface
2. `src/stores/data.ts` — state field, `init()` load, `all()` map, and
   **`LIST_KEY`** if the plural is irregular (`wardEntry` → `wardEntries`)
3. `src/services/syncEngine.ts` — add to the `modules` array
4. `src/services/defaults.ts` — a `newX()` factory

---

## 5. Gotchas (hard-won)

- **React #185** — a zustand selector returning a freshly-built array/object
  loops forever. Use `useShallow` or select primitives.
- **Quiz loading state** must derive from the global task store (`kind:'quiz'`)
  and adopt finished tasks on return; the AI layer creates `'questionGen'`
  internally.
- **Sync:** apply server records with `{ fromSync: true }` so server timestamps
  survive and records aren't re-enqueued — otherwise sync never converges.
- **`better-sqlite3` is pinned to 12.2.0.** In a sandbox it can't compile;
  use `npm install --ignore-scripts` (web/API/Electron-TS are unaffected).
- **Electron** needs `asarUnpack` for `dist/`+`build/`. Service worker must stay
  off in Electron and Capacitor.
- **Auth CORS** preflight returns **204**.
- Security-question reset is **case-insensitive, lowercased**.
- **Two vite configs exist** (`vite.config.ts` *and* a committed compiled
  `vite.config.js`). **Vite loads the `.js` first** — edit both or your change
  silently does nothing. Same trap: tracked `vite.config.d.ts` and
  `tsconfig*.tsbuildinfo`.
- **Dev server for remote previews** needs `host: true` + `allowedHosts: true`.
- Router is **HashRouter** — deep links look like `#/ward-rounds?round=<id>`.

---

## 6. Domain rules — non-negotiable

1. **No patient data. Ever.** No names, IDs, hospital/MRN numbers, phone,
   address, demographics. The app records *what the student learned*, not who
   they saw. Never let a feature drift toward EMR/EHR.
2. **User data and AI data stay separate.** AI must never overwrite something
   the student wrote. Store AI output in its own record/field and surface it as
   accept / edit / reject. (See `wardAnalysis` and `WardEntry.aiSuggestion`.)
3. **Offline-first.** Core flows must work with zero internet: record, edit,
   delete, search, view history, create local bundles. AI is strictly additive
   and queued when unavailable — never lose user work because AI failed.
4. **Safety framing.** AI is a learning aid, never the clinical supervisor, and
   must encourage verification against guidelines, formulary or a supervisor.
   No patient-specific treatment decisions.
5. **PHI scanner** (`services/privacy.ts`) runs before export/share.

---

## 7. Verification before shipping

```bash
npm run typecheck        # tsc -b
npm run build:web        # vite build
npm run smoke            # boots the bundle in jsdom
npm test                 # api.test.js + wardRounds.test.mjs
npm run build:electron   # electron main tsc
```

`npm run test:ward` alone runs the Ward Rounds suite (34 checks: offline
capture, restart persistence, compartment sync, AI queueing, search, bundle
independence, and an assertion that no patient-identifying field exists).

Keep the user informed in chat about what changed and the CI status.

---

## 8. Mobile

APK is built by CI on every push to `main` and attached to the release
(`clinical-rx-<version>.apk`, signed, in-place updates work):
<https://github.com/g2code33/CLINICAL-RX-/releases/latest>

Local: `npm run mobile:android` (needs Node ≥22 + JDK 21).
Remember to bump `versionCode` in `android/app/build.gradle` on every release.
