# CLINICAL Rx — User Guide

Your personal clinical learning companion. Everything works offline; an account
is always optional.

---

## Getting started

When you first open CLINICAL Rx you can choose **Start Offline** or **Sign In**.

**Start Offline is the normal choice.** You get the whole app immediately — no
account, no email, no internet. Your records live on your own device. You can
create an account later and keep everything you have already written.

The dashboard greets you with your current level, what you have done today,
quick actions for the five things you start most often, your recent activity
and your upcoming goals.

---

## Working offline

Offline is not a limited mode — it is how the app is designed to run.

Fully available with no internet: learning notes, ward rounds, medicines,
diseases, investigations, questions, revision, quizzes, bundles, search, the
PharmD journey, skills, projects, goals, the portfolio and CV builder,
exports, settings, and local AI if you have configured it.

Requires internet: cloud AI providers, signing in, cloud sync and cloud backup.

A small **Offline** indicator appears when you lose connection. Your work
continues to save normally, and anything waiting on the network — a sync, an AI
job — queues and resumes by itself when you reconnect.

---

## Capturing your learning

**Learning notes** need only a title and what you learnt. Disease, medicine,
course, level and semester are optional — add them when useful, skip them when
you are in a hurry.

**Ward rounds** save with just a ward and date. Add captures as the round
happens; everything else is optional.

> CLINICAL Rx never stores patient-identifying information. There are no fields
> for names, hospital numbers or dates of birth. If an export looks like it may
> contain something identifying, you will be warned before you share it.

**Questions** let you park something to research later. **Revision** schedules
what you have captured for spaced repetition.

---

## Bundles

A bundle packages a period of work into one reviewable summary.

- **Automatic Daily / Weekly** — generated for you.
- **Manual Day / Week / Custom** — you choose what goes in.
- **Merged** — combine several bundles into one.

Each card shows its type, dates, record count and academic context, with quick
actions to Open, Favourite, Export or Delete.

**A bundle is a snapshot.** If you later edit a medicine that a bundle
included, the bundle does not change — it is a record of what you knew then.
Deleting a bundle never deletes your clinical records.

---

## Search

Press **Ctrl/Cmd + K** anywhere. Search covers every module — notes, medicines,
diseases, investigations, questions, ward rounds, bundles, courses, skills,
projects, research, achievements, goals and your AI conversations — and groups
results by module so you can see where a term appears. Move with the arrow
keys, open with Enter.

Search works entirely offline.

---

## Using the AI

CLINICAL Rx can use a **local** AI (runs on your machine, works offline) or a
**cloud** provider (needs internet and an API key). Configure either in
**Settings → AI**. Each AI module — General, Clinical, Revision, Search,
Bundler, Career, Research — has its own settings, so changing one does not
disturb another.

The header always shows which module is active and whether you are on
💻 Local, ☁️ Cloud or have no provider configured.

**What the AI will and will not do**

- It answers from *your* records and lists the Sources it used; click one to
  open it.
- If you ask about something you have never recorded, it tells you it found
  nothing rather than inventing a memory.
- It can read freely, but creating, editing or deleting a record always asks
  you first — and destructive actions ask more firmly.
- AI-written text is always labelled so you can review it before relying on it.

With no provider configured you get a clear message saying so. You never get a
fabricated answer.

---

## Your PharmD journey

The journey shows your levels as a timeline. Your current stage is always
obvious, and you can click back into any previous level.

When you progress from Level 200 to Level 300, your Level 200 work is
**archived, not altered**. Every note, ward round and bundle stays stamped with
the year you created it, and remains fully readable. The 📚 Archive lets you
filter by level, year, semester and course.

---

## Portfolio and CV

Skills, projects, research, achievements, certifications, leadership roles and
clinical experience are **private by default**. Only records you explicitly mark
as `PORTFOLIO` appear in your portfolio or CV — private ones never leave.

Skill ratings are always yours to set. The app will never award you a
competency; attach evidence so your rating is defensible in an interview.

The CV builder shows sections on the left and a live preview on the right, with
Save, Export PDF and Export Text. Anything AI-drafted is labelled
`AI GENERATED — REVIEW`.

---

## Accounts and sync

An account is optional and can be added at any time without losing anything you
have already created.

Once signed in you can sync across devices, back up to the cloud and use cloud
AI. **Signing out never deletes your local data** — you keep working offline
and can sign back in whenever you like.

If you edit the same record on two devices, the most recent edit wins and the
other version is preserved rather than discarded.

---

## Backup and restore

**Settings → Data → Download backup** writes a single portable JSON file
containing everything: notes, clinical records, ward rounds, bundles, academic
history, skills, projects and goals. For safety, API keys are deliberately
*not* included.

To restore, use **Import backup**. Restoring *merges*: records from the file
replace matching records, and anything on your device that is not in the file
is left alone. A restore can never leave you with less than you started with.

You can also set an automatic daily or weekly backup.

---

## Exporting

Bundles, portfolios, CVs and ward rounds export to PDF, Markdown or JSON
depending on the screen. You always see a preview before exporting, and exports
never depend on your window size. Private records and credentials are never
included.

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + K` | Command bar — navigate, search, ask AI |
| `Ctrl/Cmd + Shift + F` | Full global search |
| `Ctrl/Cmd + N` | New record in the current context |
| `Ctrl/Cmd + ,` | Settings |
| `Esc` | Close the open dialog |
| `?` | Show all shortcuts |
| `g` then `h` / `m` / `r` / `b` / `a` | Home, Medicines, Revision, Bundles, AI |

The app is fully keyboard navigable, with a skip link as the first tab stop and
visible focus on every control.

---

## If something goes wrong

Errors tell you what happened, whether your data is safe, and what to do next.
In almost every case the answer is that your local data is untouched.

For recovery procedures — database problems, a failed update, a lost device,
account recovery — see [`DISASTER-RECOVERY.md`](./DISASTER-RECOVERY.md).
