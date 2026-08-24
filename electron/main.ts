import { app, BrowserWindow, ipcMain, Notification, safeStorage, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { SqliteKV } from './db/database';

let store: SqliteKV | null = null;
let mainWindow: BrowserWindow | null = null;
// Set true when the app should really quit (update install, explicit quit)
// instead of hiding to the background.
let allowQuit = false;
// True while an update is being installed — the window close/hide handlers
// must not interfere with quitAndInstall.
let installing = false;

const UPDATE_OWNER = 'g2code33';
const UPDATE_REPO = 'CLINICAL-RX-';

function isDev() {
  return !app.isPackaged;
}

function sendToRenderer(channel: string, payload: unknown) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function initUpdater() {
  if (!app.isPackaged) return; // only check for real updates when packaged

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.setFeedURL({
    provider: 'github',
    owner: UPDATE_OWNER,
    repo: UPDATE_REPO,
  });

  autoUpdater.on('checking-for-update', () => sendToRenderer('update:status', { state: 'checking' }));
  autoUpdater.on('update-available', (info) => {
    sendToRenderer('update:status', { state: 'available', version: info.version });
  });
  autoUpdater.on('update-not-available', (info) => {
    sendToRenderer('update:status', { state: 'up-to-date', version: info.version });
  });
  autoUpdater.on('error', (err) => sendToRenderer('update:status', { state: 'error', message: err?.message || 'Update error' }));
  autoUpdater.on('download-progress', (p) =>
    sendToRenderer('update:status', { state: 'downloading', percent: Math.round(p.percent), transferred: p.transferred, total: p.total })
  );
  autoUpdater.on('update-downloaded', (info) =>
    sendToRenderer('update:status', { state: 'downloaded', version: info.version })
  );
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Clinical Rx',
    icon: path.join(__dirname, '../build/icon.png'),
    show: false,
    backgroundColor: '#0f172a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false, // keep timers/AI working when minimized/hidden
    },
  });

  if (isDev() && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Load the packaged renderer. The renderer files are UNPACKED from the
    // asar (build.asarUnpack: dist/**/*), so they live on the real filesystem
    // at resources/app.asar.unpacked/dist — loading from there avoids the
    // "ERR_FAILED on app.asar file:// load" bug that caused a blank window
    // until a manual reload.
    const asarDir = __dirname.includes('app.asar') ? __dirname.replace('app.asar', 'app.asar.unpacked') : __dirname;
    const index = path.join(asarDir, '../dist/index.html');
    win.loadFile(index).catch((err) => {
      console.error('[clinical-rx] load failed:', err);
      // Retry once against the plain asar path (in case unpacked is absent).
      setTimeout(() => {
        win.loadFile(path.join(__dirname, '../dist/index.html')).catch((e2) => {
          console.error('[clinical-rx] second load failed:', e2);
          const { dialog } = require('electron');
          dialog.showErrorBox('CLINICAL Rx could not load', 'The app could not load its interface. Please reinstall.');
        });
      }, 300);
    });
  }
  // Ignore aborted navigations (ERR_ABORTED = -3); a genuine failure already
  // triggers the retry above, so no aggressive reload loop here.
  win.webContents.on('did-fail-load', (_e, code) => {
    if (code === -3) return;
  });
  // --- Navigation hardening (Phase 8 §3, §5) ---
  //
  // Without these guards a compromised or malicious link can navigate the
  // renderer away from the app — to a remote page that still sits inside a
  // window holding our preload bridge — or open a child window with Node
  // privileges. Both are classic Electron escapes.

  const isInternalUrl = (target: string): boolean => {
    try {
      const u = new URL(target);
      if (u.protocol === 'file:') return true; // packaged renderer
      const devServer = process.env.VITE_DEV_SERVER_URL;
      if (isDev() && devServer && target.startsWith(devServer)) return true;
      return false;
    } catch {
      return false;
    }
  };

  // Only http(s) links are handed to the OS browser. Never shell-execute a
  // renderer-supplied string, and never open file:/ custom schemes this way.
  const openExternally = (target: string) => {
    try {
      const u = new URL(target);
      if (u.protocol === 'https:' || u.protocol === 'http:') void shell.openExternal(u.toString());
    } catch {
      /* malformed URL: ignore rather than pass it anywhere */
    }
  };

  win.webContents.on('will-navigate', (event, target) => {
    if (isInternalUrl(target)) return;
    event.preventDefault();
    openExternally(target);
  });

  // Deny ALL child windows; route legitimate external links to the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternally(url);
    return { action: 'deny' };
  });

  // Never allow <webview> — we don't use it, and it's a large attack surface.
  win.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });

  // Deny every privileged web permission: the app needs none of them.
  win.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  win.once('ready-to-show', () => win.show());
  // Closing the window hides it (renderer keeps running -> AI/bundles finish)
  // unless the app is actually quitting (update install / quit).
  win.on('close', (e) => {
    if (allowQuit) return;
    e.preventDefault();
    win.hide();
  });
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });
  return win;
}


// ===========================================================================
// PHASE 8 — IPC INPUT VALIDATION & SSRF ALLOWLIST
//
// The renderer is treated as UNTRUSTED. Every value crossing the bridge is
// validated here, in the main process, before it can reach the filesystem,
// the database or the network.
// ===========================================================================

/** Modules the renderer may touch. Anything else is rejected outright. */
const ALLOWED_MODULES = new Set([
  'profile', 'settings', 'day', 'disease', 'medicine', 'investigation',
  'question', 'lesson', 'revision', 'bundle', 'chat', 'quiz', 'reminder',
  'wardRound', 'wardEntry', 'wardAnalysis', 'academicStage', 'academicPeriod',
  'course', 'activity',
  'clinicalExperience', 'skill', 'achievement', 'certification',
  'project', 'research', 'leadership', 'goal',
  'backup', 'auditLog',
]);

function isValidModule(m: unknown): m is string {
  return typeof m === 'string' && ALLOWED_MODULES.has(m);
}

/**
 * Record ids are app-generated (uuid / prefixed tokens). Constraining the
 * shape blocks path traversal and control characters reaching storage.
 */
function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(id);
}

/** Credential slot names, e.g. "ai:tutor". */
function isValidAccount(a: unknown): a is string {
  return typeof a === 'string' && a.length > 0 && a.length <= 64 && /^[A-Za-z0-9._:-]+$/.test(a);
}

function isValidTimestamp(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 4102444800000; // <= year 2100
}

/** Reject payloads large enough to be a denial-of-service. */
const MAX_RECORD_BYTES = 5 * 1024 * 1024;

/**
 * Strip prototype-polluting keys from anything the renderer sends us before it
 * is persisted (Phase 8 §2). Depth-limited so a hostile nested object cannot
 * blow the stack.
 */
function sanitizeForStorage(value: unknown, depth = 0): unknown {
  if (depth > 32 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForStorage(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    out[k] = sanitizeForStorage(v, depth + 1);
  }
  return out;
}

/**
 * Hosts the AI proxy may contact. An API key is injected into these requests,
 * so the destination must be known-good — never renderer-controlled.
 */
const ALLOWED_AI_HOSTS = new Set([
  'api.openai.com',
  'api.anthropic.com',
  'generativelanguage.googleapis.com',
  'api.groq.com',
  'openrouter.ai',
  'api.mistral.ai',
  'api.cohere.ai',
  'api.deepseek.com',
  'api.together.xyz',
  'api.x.ai',
  'api.perplexity.ai',
]);

/** Headers the renderer may set on a proxied AI request. */
const ALLOWED_REQUEST_HEADERS = new Set([
  'authorization',
  'content-type',
  'accept',
  'x-api-key',
  'anthropic-version',
  'anthropic-dangerous-direct-browser-access',
  'openai-organization',
  'openai-beta',
  'http-referer',
  'x-title',
]);

/** Is this host a private/loopback address? Used to block SSRF to the LAN. */
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === 'localhost' || h === '::1' || h.endsWith('.local') || h.endsWith('.internal')) return true;
  // IPv4 literals in private / loopback / link-local / CGNAT ranges.
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true; // link-local (cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

type UrlCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Validate an outbound AI URL.
 *
 * Requires HTTPS and an allowlisted host. A user-configured custom endpoint is
 * permitted only when they set it in Settings (checked by the caller against
 * their own config), never when it arrives unannounced from the renderer.
 */
function parseAiUrl(raw: string): UrlCheck {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: 'Invalid request URL.' };
  }
  if (u.protocol !== 'https:') {
    return { ok: false, error: 'AI requests must use HTTPS.' };
  }
  if (isPrivateHost(u.hostname)) {
    return { ok: false, error: 'AI requests cannot target private network addresses.' };
  }
  if (!ALLOWED_AI_HOSTS.has(u.hostname.toLowerCase())) {
    return {
      ok: false,
      error: `"${u.hostname}" is not an approved AI provider. Add it in Settings if you trust it.`,
    };
  }
  return { ok: true, url: u.toString() };
}

/**
 * 🔐 SECURE API KEY STORAGE
 *
 * API keys are NEVER kept in localStorage, in the SQLite records, in the React
 * tree, or in the repository. They are encrypted with Electron's safeStorage,
 * which is backed by the operating system's credential facility (DPAPI on
 * Windows, Keychain on macOS, libsecret/kwallet on Linux), and written to a
 * file only the current OS user account can decrypt.
 *
 * The renderer can SET a key, ASK WHETHER one exists, and DELETE it. It can
 * never read one back — decryption happens in the main process only, at the
 * moment a request is sent.
 */
function secretsPath() {
  return path.join(app.getPath('userData'), 'ai-secrets.bin');
}

type SecretMap = Record<string, string>;

function readSecrets(): SecretMap {
  try {
    if (!fs.existsSync(secretsPath())) return {};
    const buf = fs.readFileSync(secretsPath());
    if (!buf.length) return {};
    if (!safeStorage.isEncryptionAvailable()) return {};
    const json = safeStorage.decryptString(buf);
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSecrets(map: SecretMap): boolean {
  try {
    if (!safeStorage.isEncryptionAvailable()) return false;
    const buf = safeStorage.encryptString(JSON.stringify(map));
    fs.writeFileSync(secretsPath(), buf, { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

function initSecretsIpc() {
  ipcMain.handle('secret:available', () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  });

  // Store a key. Returns only ok/false — never echoes the value back.
  ipcMain.handle('secret:set', (_e, account: string, value: string) => {
    if (!isValidAccount(account) || typeof value !== 'string') return { ok: false };
    if (value.length > 8192) return { ok: false };
    const map = readSecrets();
    if (value.trim()) map[account] = value;
    else delete map[account];
    return { ok: writeSecrets(map) };
  });

  // Existence + a masked hint only. The plaintext never crosses the bridge.
  ipcMain.handle('secret:status', (_e, account: string) => {
    if (!isValidAccount(account)) return { present: false };
    const map = readSecrets();
    const v = map[account];
    if (!v) return { present: false };
    return { present: true, hint: `••••${v.slice(-4)}`, length: v.length };
  });

  ipcMain.handle('secret:delete', (_e, account: string) => {
    if (!isValidAccount(account)) return { ok: false };
    const map = readSecrets();
    delete map[account];
    return { ok: writeSecrets(map) };
  });

  ipcMain.handle('secret:list', () => Object.keys(readSecrets()));

  /**
   * Send an AI request using a stored key. The key is decrypted here, used for
   * the outbound HTTPS call, and discarded — the renderer only ever sees the
   * model's reply.
   */
  ipcMain.handle('secret:aiFetch', async (_e, account: string, url: string, init: any) => {
    // --- Input validation (Phase 8 §4). Never trust the renderer. ---
    if (!isValidAccount(account)) return { ok: false, error: 'Invalid credential name.' };
    if (typeof url !== 'string' || url.length > 2048) return { ok: false, error: 'Invalid request URL.' };

    // --- SSRF / key-exfiltration guard (Phase 8 §6, §27) ---
    //
    // This handler injects a DECRYPTED API key into an outbound request. If the
    // renderer could name any URL, then any injected script could point it at
    // an attacker's server and steal the key — defeating the whole reason the
    // key never crosses the bridge. So the destination must be on the
    // allowlist, and it must be HTTPS.
    const dest = parseAiUrl(url);
    if (!dest.ok) return { ok: false, error: dest.error };

    const map = readSecrets();
    const key = map[account];
    if (!key) return { ok: false, error: 'No API key is stored for this module.' };

    try {
      // Only forward known-safe headers, and only substitute the key into
      // header VALUES (never into the URL, body or header names).
      const incoming = init && typeof init === 'object' ? init.headers ?? {} : {};
      const headers: Record<string, string> = {};
      for (const [h, v] of Object.entries(incoming)) {
        if (typeof v !== 'string') continue;
        if (!ALLOWED_REQUEST_HEADERS.has(h.toLowerCase())) continue;
        headers[h] = v.replace('{{KEY}}', key);
      }

      const method = typeof init?.method === 'string' && /^(GET|POST)$/i.test(init.method) ? init.method.toUpperCase() : 'POST';
      const body = typeof init?.body === 'string' ? init.body : undefined;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 180_000);
      try {
        const res = await fetch(dest.url, { method, headers, body, redirect: 'error', signal: controller.signal });
        const text = await res.text();
        return { ok: res.ok, status: res.status, body: text };
      } finally {
        clearTimeout(timer);
      }
    } catch (err: any) {
      // Never echo the raw error: it can contain the request URL and headers.
      const aborted = err?.name === 'AbortError';
      return { ok: false, error: aborted ? 'The AI request timed out.' : 'Could not reach the AI provider.' };
    }
  });
}

function initIpc() {
  store = new SqliteKV();
  initSecretsIpc();

  // Every kv:* handler validates its inputs before touching the database.
  // The renderer can be compromised by injected script; the main process is
  // the trust boundary (Phase 8 §4, §8).
  ipcMain.handle('kv:list', async (_e, module: string) => {
    if (!isValidModule(module)) throw new Error('Invalid module.');
    return store!.list(module);
  });
  ipcMain.handle('kv:get', async (_e, module: string, id: string) => {
    if (!isValidModule(module) || !isValidId(id)) throw new Error('Invalid request.');
    return store!.get(module, id);
  });
  ipcMain.handle('kv:put', async (_e, module: string, id: string, data: unknown, createdAt: number, updatedAt: number) => {
    if (!isValidModule(module) || !isValidId(id)) throw new Error('Invalid request.');
    if (!isValidTimestamp(createdAt) || !isValidTimestamp(updatedAt)) throw new Error('Invalid timestamps.');
    const clean = sanitizeForStorage(data);
    const serialized = JSON.stringify(clean ?? null);
    if (serialized.length > MAX_RECORD_BYTES) throw new Error('Record is too large to save.');
    await store!.put(module, id, clean, createdAt, updatedAt);
    return { ok: true };
  });
  ipcMain.handle('kv:remove', async (_e, module: string, id: string) => {
    if (!isValidModule(module) || !isValidId(id)) throw new Error('Invalid request.');
    await store!.remove(module, id);
    return { ok: true };
  });
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('notify', (_e, payload: any) => {
    // Clamp notification text so the renderer cannot spawn giant OS toasts.
    const title = typeof payload?.title === 'string' ? payload.title.slice(0, 200) : undefined;
    const body = typeof payload?.body === 'string' ? payload.body.slice(0, 500) : undefined;
    // Desktop system notification (Windows toast / Linux notify-osd).
    if (Notification.isSupported()) {
      new Notification({ title: title || 'CLINICAL Rx', body: body || '' }).show();
    }
    return { ok: true };
  });
  ipcMain.handle('app:installType', () => {
    // 'deb' installs can't auto-update (electron-updater only supports
    // AppImage on Linux); expose it so the UI can offer a download instead.
    if (process.platform !== 'linux') return 'nsis';
    try {
      const { readFileSync, existsSync } = require('node:fs');
      const p = path.join(process.resourcesPath, 'package-type');
      if (existsSync(p)) return readFileSync(p, 'utf8').trim(); // 'deb' or 'AppImage'
    } catch { /* ignore */ }
    return 'AppImage';
  });

  // ---- Updater IPC ----
  ipcMain.handle('update:getVersion', () => ({
    appVersion: app.getVersion(),
    enabled: app.isPackaged,
    owner: UPDATE_OWNER,
    repo: UPDATE_REPO,
  }));
  ipcMain.handle('update:check', async () => {
    if (!app.isPackaged) {
      return { ok: false, reason: 'dev' };
    }
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, updateInfo: result?.updateInfo ?? null };
    } catch (e: any) {
      return { ok: false, reason: 'error', message: e?.message || 'Update check failed' };
    }
  });
  ipcMain.handle('update:download', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: 'error', message: e?.message || 'Download failed' };
    }
  });
  ipcMain.handle('update:getState', () => {
    // Reflect the installed version so the renderer can confirm it's current
    // after a restart (electron-updater exposes no reliable "staged" flag).
    return { appVersion: app.getVersion() };
  });
  ipcMain.handle('update:install', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'dev' };
    try {
      // Quit & install. quitAndInstall(isSilent=false, isForceRunAfter=true)
      // is the DOCUMENTED way to relaunch after install:
      //  - NSIS on Windows: runs the installer, then re-opens the app
      //  - AppImage on Linux: swaps the binary and re-runs
      // (The previous app.relaunch()+quitAndInstall(false,false) combo can
      //  race with the installer on Windows and doesn't work on .deb.)
      // We set allowQuit FIRST so the hide-on-close handler lets it quit,
      // then quitAndInstall handles the relaunch itself.
      setTimeout(() => {
        allowQuit = true;
        installing = true;
        // quitAndInstall(false, true) closes windows, quits the app, runs the
        // installer, then relaunches the new version. Setting allowQuit +
        // installing stops our hide-on-close handler from intercepting, so the
        // process exits cleanly and the single-instance lock is released for
        // the relaunched instance.
        autoUpdater.quitAndInstall(false, true);
      }, 1000);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: 'error', message: e?.message || 'Install failed' };
    }
  });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    // User launched again while a hidden instance is running — show it.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    initIpc();
    initUpdater();
    mainWindow = createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });
}

// Keep the app running in the background when the window is closed, so
// long-running AI tasks (quiz generation, bundle enrichment, chat replies)
// finish even if the user closes the window. A single window is re-shown on
// relaunch.
app.on('before-quit', () => { allowQuit = true; });
app.on('window-all-closed', () => {
  // On Linux/Windows, close = hide (keep working). Real quit only via the app
  // menu / update install / allowQuit.
  if (process.platform === 'darwin') return;
  if (installing) {
    // quitAndInstall manages the quit + relaunch — do nothing here so the
    // installer can take over and re-open the app.
    return;
  }
  if (!allowQuit) {
    // keep process alive; the window can be re-opened via the dock/taskbar
    return;
  }
  if (store) store.close();
  app.quit();
});
