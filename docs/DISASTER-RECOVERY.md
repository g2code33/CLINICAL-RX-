# CLINICAL Rx — Disaster Recovery

Recovery procedures for the situations most likely to threaten user data.

**Governing principle (§45): never sacrifice user data for convenience.** When
a procedure is uncertain, preserve what exists and prefer duplicate-safe
recovery over destructive automation.

---

## Where your data lives

| Platform | Location |
|---|---|
| Windows | `%APPDATA%/ClinicalRx/clinical-rx/clinical-rx.db` |
| Linux | `~/.config/ClinicalRx/clinical-rx/clinical-rx.db` |
| macOS | `~/Library/Application Support/ClinicalRx/clinical-rx/clinical-rx.db` |
| Web | Browser storage for the site's origin |

Alongside the `.db` you may see `clinical-rx.db-wal` and `-shm`. **These are
part of the database.** When copying a database, copy all three.

---

## 1. Database corruption

*Symptoms: the app fails to load records, or reports a database error.*

1. **Quit the app first.** Copying a live database can produce an inconsistent
   copy.
2. **Back up the current files before touching anything** — copy the `.db`,
   `-wal` and `-shm` files to a safe folder. Even a damaged database may be
   partly recoverable, so never delete it.
3. Check the damage:
   ```bash
   sqlite3 clinical-rx.db "PRAGMA integrity_check;"
   ```
   `ok` means the file is intact and the problem lies elsewhere.
4. Attempt a salvage:
   ```bash
   sqlite3 clinical-rx.db ".recover" | sqlite3 recovered.db
   sqlite3 recovered.db "SELECT module, COUNT(*) FROM records GROUP BY module;"
   ```
   If the counts look right, replace the original with `recovered.db` (keeping
   the damaged original).
5. If salvage fails, reinstall and **Import backup** from your most recent JSON
   backup (Settings → Data).

---

## 2. Failed migration

Migrations are transactional and refuse to complete if rows would be lost — a
failed migration rolls back and leaves the original table untouched, and the
app still starts on the old schema.

1. Note the message logged as `[db] schema migration skipped: …`.
2. Take a file-level copy of the database.
3. Export a JSON backup from within the app (this works on the old schema).
4. Reinstall the current version and import the backup — a fresh install
   creates the current schema directly, bypassing the migration entirely.

---

## 3. Failed update

Installing a desktop update writes a **local safety backup** first, stored under
the `clinical-rx:pre-update-backup` key in application storage.

1. Reinstall the last known-good version from the GitHub releases page.
2. Your database is untouched by a failed update — updates replace the
   application, not your records.
3. If records are missing, import your most recent JSON backup.
4. Report the failure with the version numbers involved.

`.deb` installs do not support in-app auto-update: download the new `.deb` and
reinstall. Your data directory is preserved across reinstalls.

---

## 4. Cloud outage

**No action required.** The app is offline-first: every core feature keeps
working, and changes queue locally. When the service returns, queued operations
drain automatically.

Do **not** clear application data or reinstall to "fix" a sync error — that is
the one action that can actually lose the queued changes.

---

## 5. Lost or replaced device

**If you had cloud sync enabled:** install CLINICAL Rx on the new device, sign
in, and let the first sync pull your records.

**If you were offline-only:** you need your JSON backup file. Install, then
Settings → Data → Import backup.

**If you have neither**, the data existed only on the lost device and cannot be
recovered. This is the trade-off of a private, offline-first, no-account-
required design — which is why automatic backups are worth enabling.

---

## 6. Account recovery

1. **Password reset by email** — Auth screen → "Forgot password". Requires the
   server to have a mail service configured.
2. **Security question** — if you set one, retrieve it by email address and
   reset with your answer.
3. **Neither available** — your local data is unaffected. Continue working
   offline and contact an administrator; an account is never required to use
   the app.

Losing account access never means losing local records.

---

## 7. Backup restoration

1. Settings → Data → **Import backup**, select your `.json` file.
2. Restore **merges**: records in the file overwrite matching records by id;
   anything on the device that is not in the file is left alone. It can never
   leave you with less than you started with.
3. The result reports how many records were restored and whether any were
   skipped as unreadable.

**Notes**

- Backups deliberately exclude API keys. Re-enter provider keys after restoring
  onto a new machine.
- A file that is not a CLINICAL Rx backup is rejected without touching your
  data.
- Cloud restore writes a safety backup of your current state first, and cancels
  if that safety copy cannot be created.

---

## 8. Interrupted operations

| Interrupted | Result |
|---|---|
| Crash / power loss mid-write | WAL rolls the incomplete transaction back. No partial records. |
| Sync interrupted | Unsent changes stay queued and retry. |
| Bundle generation interrupted | No bundle is created. Source records untouched. |
| Backup interrupted | Incomplete file; the app is unaffected. Re-run it. |
| Restore interrupted | Records written so far are valid; re-run to finish. Merge semantics make this safe. |

---

## Emergency data extraction

If the app will not start but the database is intact:

```bash
sqlite3 clinical-rx.db \
  "SELECT data FROM records WHERE module='lesson';" > my-notes.json
```

Every record is stored as JSON in the `data` column, so your content is always
recoverable with standard tools — no proprietary format stands between you and
your own writing.
