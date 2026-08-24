import { app, BrowserWindow, ipcMain, Notification, safeStorage } from 'electron';
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
    if (!account || typeof value !== 'string') return { ok: false };
    const map = readSecrets();
    if (value.trim()) map[account] = value;
    else delete map[account];
    return { ok: writeSecrets(map) };
  });

  // Existence + a masked hint only. The plaintext never crosses the bridge.
  ipcMain.handle('secret:status', (_e, account: string) => {
    const map = readSecrets();
    const v = map[account];
    if (!v) return { present: false };
    return { present: true, hint: `••••${v.slice(-4)}`, length: v.length };
  });

  ipcMain.handle('secret:delete', (_e, account: string) => {
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
    const map = readSecrets();
    const key = map[account];
    if (!key) return { ok: false, error: 'No API key is stored for this module.' };
    try {
      const headers: Record<string, string> = { ...(init?.headers ?? {}) };
      for (const [h, v] of Object.entries(headers)) {
        if (typeof v === 'string') headers[h] = v.replace('{{KEY}}', key);
      }
      const res = await fetch(url, { method: init?.method ?? 'POST', headers, body: init?.body });
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? 'Network error.' };
    }
  });
}

function initIpc() {
  store = new SqliteKV();
  initSecretsIpc();

  ipcMain.handle('kv:list', async (_e, module: string) => {
    return store!.list(module);
  });
  ipcMain.handle('kv:get', async (_e, module: string, id: string) => {
    return store!.get(module, id);
  });
  ipcMain.handle('kv:put', async (_e, module: string, id: string, data: unknown, createdAt: number, updatedAt: number) => {
    await store!.put(module, id, data, createdAt, updatedAt);
    return { ok: true };
  });
  ipcMain.handle('kv:remove', async (_e, module: string, id: string) => {
    await store!.remove(module, id);
    return { ok: true };
  });
  ipcMain.handle('app:platform', () => process.platform);
  ipcMain.handle('notify', (_e, { title, body }) => {
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
