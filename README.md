# 💊 CLINICAL Rx

**Your personal clinical companion** — an offline-first PC application that helps you
record, organise and learn from your clinical days, and an optional AI layer that runs
online. Built around the **WHO → WHAT → WHERE → WHY → HOW → DT** learning framework.

- 🪟 Runs on **Windows** and **Ubuntu** as a desktop app (Electron)
- 🌐 Also runs **fully on Vercel** as a web app
- 🧠 **Offline-first**: the core (recording, learning, bundles, revision, progress) works
  with zero internet
- 🤖 Optional AI (Clinical Tutor, Case Analyzer, Question Generator, Revision Coach,
  Clinical Chat, Daily/Weekly Bundler) — each with its own provider/API key/model in Settings
- 🔒 **No patient information.** CLINICAL Rx only records de-identified clinical learning
  observations, and a PHI/PII scanner warns before any export/share.

---

## ✨ Features

- **Home dashboard** — clinical day count, conditions, medicines, investigations, today's log, quick actions
- **⚡ Quick Capture** — record a disease / medicine / investigation / question / lesson in ≤3 taps
- **Clinical Days** — per-day log: conditions, medicines, investigations, observations, lessons, uncertainties, topics to research
- **Diseases / Conditions** — WHO → WHAT → WHERE → WHY → HOW → DT framework + linked medicines + revision coverage
- **Medicines** — class, mechanism, indications, dosage, routes, contraindications, adverse effects, interactions, counselling
- **Investigations / Labs** — why requested, result, reference range, interpretation, clinical significance
- **❓ Questions Vault** — category, priority, open/answered
- **📚 Revision Engine** — turns your clinical exposure into study material
- **📊 Progress** — category learning percentages (pathology, pharmacology, therapeutics, microbiology, clinical skills)
- **📦 Bundle Library** — three independent bundle types that never overwrite each other:
  - 🤖 **Automatic** daily & weekly bundles
  - ✍️ **Manual** bundles (Day / Week / Custom) via "＋ Create Bundle"
  - 🔗 **Merged** bundles (combine any bundles → a brand-new artifact, originals untouched)
  - Bundle vault with search/filter, permanent IDs, immutable snapshots, lineage, versioning/follow-ups, and export (Markdown / JSON) & Share (copy to clipboard) with a PHI/PII warning
- **⚙️ Settings** — appearance, clinical profile, learning profile, per-module AI config, data backup/import, optional online account

---

## 🧱 Tech Stack

| Layer | Choice |
| --- | --- |
| UI | React 18 + TypeScript |
| Bundler | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router |
| State | Zustand |
| Desktop shell | Electron 31 |
| Local database (desktop) | SQLite + Drizzle ORM |
| Web storage (Vercel) | Browser storage adapter (same UI) |
| Packaging | electron-builder |
| CI/CD | GitHub Actions + Vercel |

The app uses a **pluggable storage layer** (`StorageAdapter`). The exact same React UI
runs against SQLite (via Electron IPC, on desktop) or browser storage (on Vercel), so all
features behave identically on Windows, Ubuntu, and the web.

---

## 📁 Project Structure

```
clinical-rx/
├── electron/
│   ├── main.ts            # Electron main process + IPC bridge
│   ├── preload.ts         # Secure context-bridge API
│   └── db/
│       ├── schema.ts      # Drizzle SQLite schema
│       └── database.ts    # SQLite KV store
├── src/
│   ├── main.tsx           # React entry
│   ├── App.tsx            # Router + theme + init
│   ├── components/        # Layout, Modal, QuickAdd, EntityManager, UI helpers
│   ├── pages/             # Dashboard, ClinicalDays, Diseases, Medicines,
│   │                      # Investigations, Questions, Revision, Progress,
│   │                      # Bundles, AiChat, Settings
│   ├── db/                # StorageAdapter + localStorage & Electron impls
│   ├── stores/data.ts     # Zustand data store
│   ├── services/          # ai, bundler, export, privacy, defaults
│   └── types/index.ts     # TypeScript types
├── .github/workflows/     # Desktop CI (Windows + Linux)
├── vercel.json            # Vercel web deployment config
└── package.json
```

---

## 🚀 Getting Started (development)

Requires Node.js 18+.

```bash
npm install

# Web only (browser, runs on Vercel):
npm run dev

# Desktop (Electron):
npm run dev:desktop
```

### Build for production

```bash
npm run build:web     # web bundle → dist/
npm run build:electron # Electron main → dist-electron/
npm run dist          # package desktop app
```

### Package installers

| Command | Output |
| --- | --- |
| `npm run dist:win` | Windows NSIS installer (`ClinicalRx-Setup-1.0.0.exe`) |
| `npm run dist:linux` | Ubuntu AppImage + `.deb` |

> On Linux, `npm run dist` produces an `.AppImage` (runs on Ubuntu without install)
> and a `.deb` (installable via `sudo apt install ./clinical-rx-*.deb`).

---

## 🛠 GitHub Actions (build on GitHub)

On every push to `main` (and PRs) the workflow `.github/workflows/build-desktop.yml`:

1. Type-checks the code
2. Builds the web bundle
3. Builds the Electron main process
4. Packages the desktop app for **Windows** and **Ubuntu**
5. Uploads the installers as build artifacts

Push the repo to GitHub and open **Actions** → the run will compile everything and the
artifacts will contain the `.exe`, `.AppImage`, and `.deb` installers.

---

## 🌐 Deploy to Vercel (online account)

The web version runs the same app and works fully in the browser when you have an
online account.

1. Push the repo to GitHub
2. In [Vercel](https://vercel.com), **New Project → Import** the repo
3. Vercel auto-detects Vite and uses `vercel.json` (`npm run vercel-build`, output `dist/`)
4. Deploy → you get a live URL for the web app

**How online works here:** the desktop app stores everything in SQLite locally. The
Vercel web build uses the identical UI with browser storage. The "Online Account" in
Settings is the optional secondary layer. For real multi-device sync you'd add a sync
backend (the `StorageAdapter` and bundle export are designed so this can be wired in
without touching the UI). Bundles can be exported/shared as Markdown or JSON so you can
bring your clinical learning pack anywhere — e.g. to ask another AI or a supervisor to
explain it.

---

## 🤖 AI Setup

1. Open **Settings → AI Configuration**
2. Enable each module and set its **provider**, **model**, and **API key**
   (OpenAI, Anthropic, OpenRouter, or any OpenAI-compatible custom endpoint)
3. AI features appear (AI Chat, Ask AI on a bundle, AI-powered bundler summaries)

AI requires internet. Everything else — recording, bundles (queued), revision, progress,
search — works fully offline. If no API key is set, bundles are generated with a built-in
offline summary instead of failing.

> 🔐 Security note: in the shipped version, API keys are stored with your local data and
> kept out of the renderer only where the OS allows. For production, store keys in the OS
> secure credential store and/or a server-side proxy so keys never ship in the client.

---

## 🔒 Privacy

CLINICAL Rx is designed **not to store any patient-identifying information** (no names,
IDs, phone numbers, addresses). You record clinical *learning observations* only
("what did I learn today?"). Before exporting or sharing a bundle, a PHI/PII scanner
warns if it detects anything identifying.

---

## 📄 License

MIT
