/**
 * 🎨 ICON REGISTRY
 *
 * Every emoji/icon the app shows in navigation and module headers is declared
 * here once, with a stable key. Components read icons through `appIcon(key)`
 * instead of hardcoding an emoji, which makes them overridable at runtime.
 *
 * An override may be:
 *   · another emoji  — stored as the character itself
 *   · an image       — stored as a data URL (PNG/JPEG/SVG/WebP)
 *
 * Overrides live in localStorage, so they are per-device and survive restarts
 * without touching the user's clinical records. Resetting is always possible:
 * the built-in default is never overwritten, only shadowed.
 */

const STORE_KEY = 'clinical-rx:icon-overrides';

/** Largest accepted image override. Data URLs are stored inline, so keep it small. */
export const MAX_ICON_BYTES = 256 * 1024; // 256 KB

export interface IconDef {
  key: string;
  /** The shipped default. Never modified. */
  fallback: string;
  /** Human label shown in the admin editor. */
  label: string;
  /** Grouping in the editor UI. */
  group: string;
}

/**
 * The catalogue of overridable icons.
 *
 * Keys are stable identifiers — renaming one loses its override, so treat them
 * as permanent once shipped.
 */
export const ICON_CATALOG: IconDef[] = [
  // ---- Clinical navigation ----
  { key: 'nav.home', fallback: '🏠', label: 'Home', group: 'Clinical navigation' },
  { key: 'nav.learning', fallback: '📋', label: 'Clinical Learning', group: 'Clinical navigation' },
  { key: 'nav.notes', fallback: '💡', label: 'Learning Notes', group: 'Clinical navigation' },
  { key: 'nav.clinicalDays', fallback: '📆', label: 'Clinical Days', group: 'Clinical navigation' },
  { key: 'nav.wardRounds', fallback: '🏥', label: 'Ward Rounds', group: 'Clinical navigation' },
  { key: 'nav.calendar', fallback: '📅', label: 'Calendar', group: 'Clinical navigation' },
  { key: 'nav.diseases', fallback: '🦠', label: 'Diseases', group: 'Clinical navigation' },
  { key: 'nav.medicines', fallback: '💊', label: 'Medicines', group: 'Clinical navigation' },
  { key: 'nav.investigations', fallback: '🧪', label: 'Investigations', group: 'Clinical navigation' },
  { key: 'nav.questions', fallback: '❓', label: 'Questions', group: 'Clinical navigation' },
  { key: 'nav.revision', fallback: '📚', label: 'Revision', group: 'Clinical navigation' },
  { key: 'nav.quiz', fallback: '📝', label: 'Quiz', group: 'Clinical navigation' },
  { key: 'nav.questionBank', fallback: '🗂', label: 'Question Bank', group: 'Clinical navigation' },
  { key: 'nav.bundles', fallback: '📦', label: 'Bundles', group: 'Clinical navigation' },
  { key: 'nav.progress', fallback: '📊', label: 'Progress', group: 'Clinical navigation' },
  { key: 'nav.ai', fallback: '🤖', label: 'AI', group: 'Clinical navigation' },
  { key: 'nav.sync', fallback: '☁️', label: 'Sync & Backup', group: 'Clinical navigation' },
  { key: 'nav.settings', fallback: '⚙️', label: 'Settings', group: 'Clinical navigation' },
  { key: 'nav.admin', fallback: '🛡️', label: 'Admin Panel', group: 'Clinical navigation' },

  // ---- PharmD navigation ----
  { key: 'nav.journey', fallback: '🎓', label: 'My Journey', group: 'PharmD navigation' },
  { key: 'nav.timeline', fallback: '📈', label: 'Timeline', group: 'PharmD navigation' },
  { key: 'nav.experience', fallback: '🏥', label: 'Clinical Experience', group: 'PharmD navigation' },
  { key: 'nav.skills', fallback: '🧠', label: 'Skills', group: 'PharmD navigation' },
  { key: 'nav.projects', fallback: '💻', label: 'Projects', group: 'PharmD navigation' },
  { key: 'nav.research', fallback: '🔬', label: 'Research', group: 'PharmD navigation' },
  { key: 'nav.leadership', fallback: '🏅', label: 'Leadership', group: 'PharmD navigation' },
  { key: 'nav.achievements', fallback: '🏆', label: 'Achievements', group: 'PharmD navigation' },
  { key: 'nav.certifications', fallback: '📜', label: 'Certifications', group: 'PharmD navigation' },
  { key: 'nav.goals', fallback: '🎯', label: 'Goals', group: 'PharmD navigation' },
  { key: 'nav.portfolio', fallback: '📁', label: 'Portfolio & CV', group: 'PharmD navigation' },
  { key: 'nav.archive', fallback: '📚', label: 'Academic Archive', group: 'PharmD navigation' },
  { key: 'nav.courses', fallback: '📚', label: 'Courses', group: 'PharmD navigation' },
  { key: 'nav.favorites', fallback: '⭐', label: 'Favorites', group: 'PharmD navigation' },

  // ---- AI modules ----
  { key: 'ai.general', fallback: '💬', label: 'General AI', group: 'AI modules' },
  { key: 'ai.clinical', fallback: '🩺', label: 'Clinical AI', group: 'AI modules' },
  { key: 'ai.revision', fallback: '🧠', label: 'Revision AI', group: 'AI modules' },
  { key: 'ai.search', fallback: '🔎', label: 'Search AI', group: 'AI modules' },
  { key: 'ai.bundler', fallback: '📦', label: 'Bundler AI', group: 'AI modules' },
  { key: 'ai.career', fallback: '🎓', label: 'Career AI', group: 'AI modules' },
  { key: 'ai.research', fallback: '🔬', label: 'Research AI', group: 'AI modules' },

  // ---- Actions & status ----
  { key: 'action.add', fallback: '＋', label: 'Add / create', group: 'Actions & status' },
  { key: 'action.edit', fallback: '✏️', label: 'Edit', group: 'Actions & status' },
  { key: 'action.delete', fallback: '🗑', label: 'Delete', group: 'Actions & status' },
  { key: 'action.export', fallback: '⬇', label: 'Export', group: 'Actions & status' },
  { key: 'action.import', fallback: '⬆', label: 'Import', group: 'Actions & status' },
  { key: 'action.favorite', fallback: '⭐', label: 'Favorite', group: 'Actions & status' },
  { key: 'action.merge', fallback: '🔗', label: 'Merge', group: 'Actions & status' },
  { key: 'action.search', fallback: '🔎', label: 'Search', group: 'Actions & status' },
  { key: 'action.menu', fallback: '☰', label: 'Menu (hamburger)', group: 'Actions & status' },
  { key: 'status.online', fallback: '☁️', label: 'Online / cloud', group: 'Actions & status' },
  { key: 'status.offline', fallback: '📴', label: 'Offline', group: 'Actions & status' },
  { key: 'status.local', fallback: '💻', label: 'Local AI', group: 'Actions & status' },
  { key: 'status.locked', fallback: '🔒', label: 'Locked / security', group: 'Actions & status' },
  { key: 'status.success', fallback: '✓', label: 'Success', group: 'Actions & status' },
  { key: 'status.warning', fallback: '⚠️', label: 'Warning', group: 'Actions & status' },
];

type Overrides = Record<string, string>;

function readOverrides(): Overrides {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? (obj as Overrides) : {};
  } catch {
    return {};
  }
}

function writeOverrides(next: Overrides): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable — the app keeps using defaults */
  }
  notify();
}

// ---- Change notification -------------------------------------------------
// Components subscribe so an icon change is reflected immediately, without a
// page reload.

type Listener = () => void;
const listeners = new Set<Listener>();

function notify(): void {
  for (const l of listeners) {
    try {
      l();
    } catch {
      /* a broken listener must not stop the others */
    }
  }
}

export function subscribeIcons(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Version counter for `useSyncExternalStore`. */
let version = 0;
const bump = () => {
  version++;
};
listeners.add(bump);
export function iconsVersion(): number {
  return version;
}

// ---- Reads ---------------------------------------------------------------

export function iconDef(key: string): IconDef | undefined {
  return ICON_CATALOG.find((i) => i.key === key);
}

/**
 * The icon to render for a key: the override if one is set, else the default.
 * Unknown keys return the key itself so a typo is visible rather than blank.
 */
export function appIcon(key: string): string {
  const override = readOverrides()[key];
  if (override) return override;
  return iconDef(key)?.fallback ?? key;
}

/** True when the value is an image rather than an emoji/text glyph. */
export function isImageIcon(value: string): boolean {
  return typeof value === 'string' && value.startsWith('data:');
}

export function hasOverride(key: string): boolean {
  return !!readOverrides()[key];
}

export function allOverrides(): Overrides {
  return readOverrides();
}

export function overrideCount(): number {
  return Object.keys(readOverrides()).length;
}

// ---- Writes --------------------------------------------------------------

export interface IconResult {
  ok: boolean;
  error?: string;
}

/** Set an emoji/text override. Kept short so layout cannot be broken by it. */
export function setEmojiIcon(key: string, emoji: string): IconResult {
  if (!iconDef(key)) return { ok: false, error: 'Unknown icon.' };
  const value = emoji.trim();
  if (!value) return { ok: false, error: 'Enter an emoji or character.' };
  // Emoji can legitimately be several code points (flags, ZWJ sequences), but
  // a whole word here would wreck the navigation layout.
  if ([...value].length > 4) return { ok: false, error: 'Use a single emoji or a very short symbol.' };
  writeOverrides({ ...readOverrides(), [key]: value });
  return { ok: true };
}

/**
 * Set an image override from a data URL.
 *
 * Only raster/vector image types are accepted, and only as data URLs: a remote
 * URL would make the UI depend on the network, which breaks the offline-first
 * guarantee.
 */
export function setImageIcon(key: string, dataUrl: string): IconResult {
  if (!iconDef(key)) return { ok: false, error: 'Unknown icon.' };
  if (!/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);base64,/.test(dataUrl)) {
    return { ok: false, error: 'Use a PNG, JPEG, GIF, WebP or SVG image.' };
  }
  // Rough decoded size from the base64 payload.
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const bytes = Math.floor((base64.length * 3) / 4);
  if (bytes > MAX_ICON_BYTES) {
    return { ok: false, error: `That image is too large (max ${Math.round(MAX_ICON_BYTES / 1024)} KB).` };
  }
  writeOverrides({ ...readOverrides(), [key]: dataUrl });
  return { ok: true };
}

/** Remove one override, restoring the shipped default. */
export function resetIcon(key: string): void {
  const next = readOverrides();
  delete next[key];
  writeOverrides(next);
}

/** Remove every override. */
export function resetAllIcons(): void {
  writeOverrides({});
}

/** Export overrides so a customised icon set can be moved between devices. */
export function exportIcons(): string {
  return JSON.stringify({ app: 'clinical-rx', kind: 'icon-overrides', version: 1, icons: readOverrides() }, null, 2);
}

/** Import a previously exported icon set. Merges rather than replacing. */
export function importIcons(json: string): IconResult {
  let parsed: any;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  if (!parsed || parsed.kind !== 'icon-overrides' || typeof parsed.icons !== 'object') {
    return { ok: false, error: 'That file is not a CLINICAL Rx icon set.' };
  }
  const incoming: Overrides = {};
  for (const [k, v] of Object.entries(parsed.icons as Record<string, unknown>)) {
    // Only accept keys this build knows about, and only string values.
    if (typeof v === 'string' && iconDef(k)) incoming[k] = v;
  }
  writeOverrides({ ...readOverrides(), ...incoming });
  return { ok: true };
}
