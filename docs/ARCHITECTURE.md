# CLINICAL Rx — Developer Documentation

Engineering reference for the CLINICAL Rx desktop/web application.
Companion documents: [`USER-GUIDE.md`](./USER-GUIDE.md) and
[`DISASTER-RECOVERY.md`](./DISASTER-RECOVERY.md).

---

## 1. Architecture

```
                CLINICAL Rx
                     │
    ┌────────────────┼────────────────┐
    │                │                │
 LEARNING         CLINICAL         PHARMD
    │                │                │
    └────────────────┼────────────────┘
                     │
             INTELLIGENCE LAYER
                     │
    ┌────────────────┼────────────────┐
    │                │                │
  SEARCH            AI              BUNDLES
    │                │                │
    │        ┌───────┴───────┐        │
    │        │               │        │
    │      CLOUD           LOCAL      │
    │        AI              AI       │
    │        │               │        │
    └────────┴───────┬───────┴────────┘
                     │
                LOCAL DATABASE
                     │
                OPTIONAL SYNC
                     │
                CLOUD BACKUP
```

**The governing rule: the local system is independently useful.** Everything
below the Intelligence Layer works with no account, no network and no AI
provider. Cloud sync, cloud AI and cloud backup are strictly additive.

### Stack

| Layer | Technology |
|---|---|
| UI | React 19 + TypeScript, Tailwind, React Router (hash routing) |
| State | Zustand (`src/stores/data.ts` — one store, all modules) |
| Desktop | Electron 38 + better-sqlite3 + Drizzle |
| Web | Vite build, browser storage adapter |
| Mobile | Capacitor (Android) |
| API | Vercel serverless functions (`api/`) |
| Packaging | electron-builder (NSIS, AppImage, deb) |

### Directory map

```
src/
  components/        Shared UI. ui/primitives.tsx is the component library.
  pages/             One file per screen; journey/ holds PharmD screens.
  services/          All business logic. No logic lives in components.
  stores/            Zustand stores (data, ui, notifications, tasks).
  db/adapter.ts      Chooses SQLite (Electron) or browser storage (web).
  types/index.ts     Every record type in the app.
electron/            Main process, preload bridge, SQLite layer.
api/                 Serverless endpoints (auth, sync, aiConfig, admin).
test/                14 suites, all runnable offline.
```

---

## 2. Database

A deliberately simple single-table key/value store:

```sql
CREATE TABLE records (
  id         TEXT    NOT NULL,
  module     TEXT    NOT NULL,
  data       TEXT    NOT NULL,   -- JSON-serialised record
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (module, id)
);
CREATE INDEX idx_records_module         ON records (module);
CREATE INDEX idx_records_module_updated ON records (module, updated_at);
```

**Why a JSON blob rather than a relational schema.** This is a single-user
learning app whose record shapes evolve every phase. Typed shapes live in
`src/types/index.ts` and are enforced by TypeScript; SQLite stores them
opaquely. That means a new field never needs a schema migration — the main
source of data-loss risk in an app like this.

**Why the key is `(module, id)`.** Every query addresses a row by module *and*
id. A single-column `id` key would make ids globally unique instead, letting
one module's insert collide with another's.

**Durability settings** (`electron/db/database.ts`):

| Pragma | Value | Reason |
|---|---|---|
| `journal_mode` | `WAL` | Atomic commits; reads proceed during writes |
| `synchronous` | `NORMAL` | Crash-safe with WAL, without an fsync per write |
| `foreign_keys` | `ON` | No silent orphans |
| `busy_timeout` | `5000` | Wait instead of throwing `SQLITE_BUSY` |

Writes use a single atomic `INSERT … ON CONFLICT DO UPDATE`. The earlier
read-then-write pattern had a race window where interleaved writes could lose a
change. `created_at` is never rewritten by an update.

`close()` checkpoints the WAL and closes the handle so a clean quit does not
look like a crash to SQLite on next launch.

### Migrations

`migrateSchema()` upgrades a v1 database (single-column key) to the composite
key. It is transactional, idempotent, and **refuses to swap in a table that
lost rows** — if the copy is short it rolls back and leaves the original
untouched. A failed migration never blocks startup.

Verified by `test/phase10.migration.test.mjs` against real SQLite, including a
350-row upgrade checked byte-for-byte.

---

## 3. Offline architecture

Offline is the default, not a degraded mode.

- The storage adapter (`src/db/adapter.ts`) resolves to SQLite under Electron
  and browser storage on web. Application code never knows which.
- No route, page or service requires authentication to function.
- Network-dependent work is queued: `syncEngine` keeps a pending-operations
  list, `aiTaskQueue` retries AI jobs, `wardAi` retries analyses. Each drains
  on the `online` event.
- `OfflineIndicator` reports state without alarm; the wording always tells the
  user their data is safe.

The Phase 10 end-to-end test runs the **entire** user journey — notes, ward
rounds, bundles, merging, promotion, portfolio, backup, restore — with `fetch`
throwing on any call, and asserts zero network calls.

---

## 4. AI architecture

```
UI (AiWorkspace / AiChat)
      │
aiOrchestrator.ts      routing, fallback, safety, source attribution
      │
      ├── intelligence.ts    retrieval over stored records
      ├── aiSafety.ts        injection defence, PHI + clinical-risk checks
      ├── aiSecrets.ts       key storage; keys never enter the renderer log
      └── providers ── localAi.ts (Ollama etc.) │ aiService.ts (cloud)
```

**Modules.** General, Clinical, Revision, Search, Bundler, Career, Research.
Each keeps its own provider configuration — changing Clinical AI settings must
not alter Revision AI.

**Provider modes.** `AUTO` (prefer configured, fall back), `LOCAL ONLY`,
`CLOUD ONLY`. Local-only never silently escalates to cloud, and cloud-only
fails honestly when offline rather than substituting local.

**Grounding and honesty.** `intelligence.retrieveKnowledge()` selects relevant
records and `formatForAi()` bounds them — the whole database is never sent.
When nothing relevant exists the assistant says so instead of implying stored
knowledge. Answers that used records expose a clickable Sources list; a source
whose record was deleted renders an unavailable state.

**Write safety.** Reads are free; creates/edits require explicit confirmation
and destructive operations require stronger confirmation
(`aiToolRegistry.grantConfirmation`). AI output is always stored separately
from user content and labelled `AI GENERATED — REVIEW`.

---

## 5. Cloud, sync and backup

All optional. Signing out never deletes local data.

- **Auth** — `api/auth/index.js`, bcrypt hashes, rate-limited, tokens scoped
  per user. Recovery by email link or security question.
- **Sync** — `syncEngine.ts` pushes queued operations and pulls changes.
  Conflicts resolve last-write-wins by `updatedAt`, with the loser preserved
  rather than discarded. Deletions propagate as tombstones. AI conversations
  sync **only** if the user opts in.
- **Local backup** — `buildBackup()` produces a portable JSON file covering
  every module, **with credentials redacted**. `restoreBackup()` merges by id:
  records in the file overwrite same-id records, anything local but absent
  from the file is left alone. A restore can never be worse than a no-op.
- **Cloud backup** — `cloudBackup.ts`. Restoring writes a safety backup first
  and cancels if that safety copy cannot be created.
- **Pre-update safety** — installing a desktop update writes a local safety
  backup before handing over to the updater.

---

## 6. Security

| Control | Implementation |
|---|---|
| Electron isolation | `contextIsolation: true`, `nodeIntegration: false`, restricted preload |
| Navigation | `will-navigate` + `setWindowOpenHandler` block untrusted targets |
| Secrets | API keys never in renderer logs, never in backups, never in exports |
| Transport | Server-side authorization; clients cannot request another user's records |
| Input | Validation and prototype-pollution guards on every API entry point |
| Rate limiting | `api/_lib/rateLimit.js` on auth, sync and AI config |
| Errors | `api/_lib/errors.js` returns a reference id; internals stay server-side |
| App Lock | PBKDF2-hashed PIN, throttled attempts, no plaintext storage |
| Audit log | Security events recorded locally; secrets never logged |

Covered by `test/phase8.test.mjs` (injection, PHI, IPC, authorization, offline
security) and the Phase 10 backup-redaction regression test.

**Clinical safety.** No patient-identifiable fields exist anywhere in the data
model. Exports are scanned for possible PHI and the user is warned before
sharing. High-risk clinical topics receive contextual caution. This is a
learning tool, explicitly not an EMR.

---

## 7. PharmD Journey

Academic stages (Level 200/300/400) with **immutable history**: records are
stamped with the academic year in which they were created, and promotion never
restamps existing records. Promoting archives the old stage and leaves every
record readable exactly where it was.

Professional records (skills, projects, research, achievements, certifications,
leadership, clinical experience, goals) are **private by default**; only
records explicitly marked `portfolio` appear in the portfolio or CV. The app
never auto-assigns a competency rating — students set their own confidence and
attach evidence.

---

## 8. Bundler

A bundle is an **immutable snapshot**, not a live query. Editing a source
record afterwards must never alter an existing bundle — asserted directly in
the e2e test.

Types: Automatic Daily, Automatic Weekly, Manual Day, Manual Week, Manual
Custom, Merged. Merged bundles record lineage in `sourceBundleIds` and keep
their own copy, so deleting a source bundle leaves the merge intact. Deleting
a bundle never touches the underlying clinical records.

---

## 9. Search

Local-first and instant: search runs over in-memory store data, so no network
is required. Results are grouped by module across Learning, Medicines,
Diseases, Investigations, Questions, Ward Rounds, Bundles, Courses, Skills,
Projects, Research, Achievements, Goals, AI conversations, pages and settings
actions. `Ctrl/Cmd+K` opens the command bar, `Ctrl/Cmd+Shift+F` full search.

---

## 10. UI/UX

One design system in `src/index.css` (`.btn`, `.input`, `.card`, `.label`,
brand palette) plus the component library in `src/components/ui/primitives.tsx`
(Badge, IconButton, Tabs, LoadingState, ErrorState, Dialog, ConfirmDialog,
Section, Collapsible, Field) and `src/components/ui.tsx` (EmptyState,
PageHeader, StatCard, Pill, PasswordInput).

Accessibility: skip link, landmark roles, real dialog semantics with focus trap
and restore, visible focus rings, `aria-pressed` on toggles, `role="tablist"`
on tabs, status never conveyed by colour alone, and `prefers-reduced-motion`
support. No native `confirm`/`alert`/`prompt` remains anywhere.

---

## 11. Build and release

```bash
npm ci                 # install
npm run typecheck      # tsc -b, must be clean
npm test               # 14 suites, all offline
npm run build:web      # web bundle → dist/
npm run build          # web + electron main/preload
npm run dist           # packaged installers → release/
```

Release procedure:

1. `npm test && npm run typecheck && npm run build:web` — all must pass.
2. `npm version patch --no-git-tag-version` (or `minor`/`major`).
3. Commit `release: vX.Y.Z`, push, fast-forward `main`.
4. CI builds and publishes installers to the GitHub release.
5. Verify with `gh release view vX.Y.Z --json assets`.

**Environment variables** (server-side only, never bundled):

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection for sync/auth |
| `JWT_SECRET` | Token signing |
| `RESEND_API_KEY` | Password-reset email (optional) |
| `ADMIN_EMAILS` | Admin panel allowlist |

Signing keystore secrets are injected by CI and must never be committed.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `npm ci` fails on better-sqlite3 | Native module needs a compiler + network. Use `npm ci --ignore-scripts` for web-only work. |
| Blank window in packaged app | `dist/` missing from the build — run `npm run build` before `npm run dist`. |
| "Not a CLINICAL Rx backup" | The file is not a backup produced by this app; check you selected the right JSON. |
| AI says no provider configured | Expected offline with no local model — configure one in Settings → AI. |
| Sync says offline | Normal. Changes queue locally and drain when the connection returns. |
| `.deb` auto-update unavailable | Known platform limit; download the new `.deb` and reinstall. |

---

## 13. Known limitations and technical debt

- **better-sqlite3 requires a native build.** CI compiles it; sandboxes without
  a toolchain cannot. Desktop DB behaviour is verified against Node's built-in
  SQLite using identical SQL.
- **Renderer bundle ≈ 870 kB (244 kB gzipped).** Acceptable for a desktop app;
  route-level code splitting is the obvious next optimisation.
- **`api/admin/index.js` is not rate-limited** (other endpoints are).
- **Sync conflict resolution is last-write-wins.** Adequate for one user across
  their own devices; not a general CRDT.
- **`sandbox: false` in Electron** — required by the current preload bridge.
  `contextIsolation` and `nodeIntegration: false` are the effective controls.
- **No automated UI/browser test layer.** Verification is logic + integration
  tests plus manual UI review.
