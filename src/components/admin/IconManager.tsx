import { useMemo, useRef, useState } from 'react';
import {
  ICON_CATALOG,
  MAX_ICON_BYTES,
  appIcon,
  hasOverride,
  isImageIcon,
  iconDef,
  overrideCount,
  resetAllIcons,
  resetIcon,
  setEmojiIcon,
  setImageIcon,
  exportIcons,
  importIcons,
} from '../../services/iconRegistry';
import { AppIcon } from '../AppIcon';
import { downloadText } from '../../services/export';
import { confirmAction } from '../ui/globalConfirm';

/**
 * 🎨 ICON & EMOJI MANAGER (Admin)
 *
 * Lists every icon the app uses and lets an administrator replace any of them
 * with a different emoji or an uploaded image (PNG/JPEG/GIF/WebP/SVG).
 *
 * Design decisions worth stating:
 *  · Images are stored as data URLs, never remote links — a remote icon would
 *    break the offline-first guarantee the whole app rests on.
 *  · Overrides are per-device and live outside the clinical data, so changing
 *    an icon can never touch a student's records.
 *  · The shipped default is only ever shadowed, so Reset always works.
 */
export function IconManager() {
  const [group, setGroup] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [emoji, setEmoji] = useState('');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  // Bumped after each change so the list re-reads the registry.
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);
  const fileRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const groups = useMemo(() => ['all', ...Array.from(new Set(ICON_CATALOG.map((i) => i.group)))], []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ICON_CATALOG.filter((i) => {
      if (group !== 'all' && i.group !== group) return false;
      if (!q) return true;
      return i.label.toLowerCase().includes(q) || i.key.toLowerCase().includes(q);
    });
  }, [group, query]);

  const startEdit = (key: string) => {
    setEditing(key);
    const current = appIcon(key);
    setEmoji(isImageIcon(current) ? '' : current);
    setError('');
    setNote('');
  };

  const saveEmoji = (key: string) => {
    const res = setEmojiIcon(key, emoji);
    if (!res.ok) {
      setError(res.error ?? 'Could not save that icon.');
      return;
    }
    setEditing(null);
    setError('');
    setNote(`✓ ${iconDef(key)?.label} updated.`);
    rerender();
  };

  const uploadImage = (key: string, file: File) => {
    if (file.size > MAX_ICON_BYTES) {
      setError(`That image is too large (max ${Math.round(MAX_ICON_BYTES / 1024)} KB).`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const res = setImageIcon(key, String(reader.result));
      if (!res.ok) {
        setError(res.error ?? 'Could not use that image.');
        return;
      }
      setEditing(null);
      setError('');
      setNote(`✓ ${iconDef(key)?.label} replaced with your image.`);
      rerender();
    };
    reader.onerror = () => setError('Could not read that file.');
    reader.readAsDataURL(file);
  };

  const count = overrideCount();

  return (
    <div className="card">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">🎨 Icons &amp; emojis</h2>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-700">
          {count} customised
        </span>
      </div>
      <p className="mb-3 text-xs text-slate-400">
        Replace any icon in the app with another emoji or your own image. Changes apply immediately everywhere the icon
        appears, and only affect this device — no student records are touched.
      </p>

      {note && <p className="mb-2 rounded bg-emerald-50 p-2 text-xs text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">{note}</p>}

      {/* Filters */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          className="input max-w-56 flex-1"
          placeholder="Search icons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search icons"
        />
        <select className="input !w-auto" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filter by group">
          {groups.map((g) => (
            <option key={g} value={g}>
              {g === 'all' ? 'All groups' : g}
            </option>
          ))}
        </select>
      </div>

      {/* Icon grid */}
      <div className="grid gap-2 sm:grid-cols-2">
        {visible.map((def) => {
          const overridden = hasOverride(def.key);
          const isEditing = editing === def.key;
          return (
            <div
              key={def.key}
              className={`rounded-lg border p-2.5 ${
                overridden ? 'border-brand-400 bg-brand-50/50 dark:border-brand-600 dark:bg-brand-950/40' : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-2xl dark:bg-slate-800">
                  <AppIcon name={def.key} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{def.label}</div>
                  <div className="truncate text-[11px] opacity-60">
                    {def.group}
                    {overridden && ' · customised'}
                  </div>
                </div>
                {!isEditing && (
                  <div className="flex shrink-0 gap-1">
                    <button className="btn-secondary !px-2 !py-1 text-xs" onClick={() => startEdit(def.key)}>
                      Change
                    </button>
                    {overridden && (
                      <button
                        className="btn-ghost !px-2 !py-1 text-xs"
                        onClick={() => {
                          resetIcon(def.key);
                          setNote(`${def.label} restored to the default ${def.fallback}.`);
                          rerender();
                        }}
                        aria-label={`Reset ${def.label} to default`}
                        title="Reset to default"
                      >
                        ↺
                      </button>
                    )}
                  </div>
                )}
              </div>

              {isEditing && (
                <div className="mt-2 space-y-2 border-t border-slate-200 pt-2 dark:border-slate-700">
                  <div>
                    <label className="text-[11px] opacity-70" htmlFor={`emoji-${def.key}`}>
                      Use an emoji or symbol
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        id={`emoji-${def.key}`}
                        className="input flex-1 text-center text-lg"
                        value={emoji}
                        onChange={(e) => setEmoji(e.target.value)}
                        placeholder={def.fallback}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEmoji(def.key);
                        }}
                      />
                      <button className="btn-primary text-xs" disabled={!emoji.trim()} onClick={() => saveEmoji(def.key)}>
                        Save
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] opacity-70">Or upload an image (PNG, JPEG, GIF, WebP, SVG)</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) uploadImage(def.key, f);
                          if (fileRef.current) fileRef.current.value = '';
                        }}
                      />
                      <button className="btn-secondary text-xs" onClick={() => fileRef.current?.click()}>
                        ⬆ Choose image
                      </button>
                      <button
                        className="btn-secondary text-xs"
                        onClick={() => {
                          setEditing(null);
                          setError('');
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="mt-1 text-[10px] opacity-60">
                      Square images work best. Max {Math.round(MAX_ICON_BYTES / 1024)} KB — stored on this device, so
                      icons keep working offline.
                    </p>
                  </div>

                  {error && (
                    <p className="text-xs text-red-600" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {visible.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No icons match “{query}”.</p>}

      {/* Bulk actions */}
      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-3 dark:border-slate-700">
        <button
          className="btn-secondary text-xs"
          onClick={() => {
            downloadText('clinical-rx-icons.json', exportIcons(), 'application/json');
            setNote('✓ Icon set exported.');
          }}
        >
          ⬇ Export icon set
        </button>
        <input
          ref={importRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            const res = importIcons(await f.text());
            setNote(res.ok ? '✓ Icon set imported.' : '');
            setError(res.ok ? '' : res.error ?? 'Import failed.');
            if (importRef.current) importRef.current.value = '';
            rerender();
          }}
        />
        <button className="btn-secondary text-xs" onClick={() => importRef.current?.click()}>
          ⬆ Import icon set
        </button>
        {count > 0 && (
          <button
            className="btn-secondary text-xs !text-red-600"
            onClick={async () => {
              const ok = await confirmAction({
                title: 'Restore all default icons?',
                message: `${count} customised icon${count === 1 ? '' : 's'} will go back to the built-in default.`,
                note: 'No records are affected — this only changes how icons look.',
                confirmLabel: 'Restore defaults',
                destructive: true,
              });
              if (!ok) return;
              resetAllIcons();
              setNote('All icons restored to defaults.');
              rerender();
            }}
          >
            ↺ Restore all defaults
          </button>
        )}
      </div>
    </div>
  );
}
