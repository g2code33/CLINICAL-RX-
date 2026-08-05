import { app, BrowserWindow, ipcMain, Notification } from 'electron';
import path from 'node:path';
import { autoUpdater } from 'electron-updater';
import { SqliteKV } from './db/database';

let store: SqliteKV | null = null;
let mainWindow: BrowserWindow | null = null;

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

function initIpc() {
  store = new SqliteKV();

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
      // Wait a beat for the IPC response to flush, then quit & install.
      // isForceRunAfter=true relaunches the app automatically after the
      // installer finishes — the user shouldn't have to open it manually.
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 1000);
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
let allowQuit = false;
app.on('before-quit', () => { allowQuit = true; });
app.on('window-all-closed', () => {
  // On Linux/Windows, close = hide (keep working). Real quit only via the app
  // menu / update install / allowQuit.
  if (process.platform === 'darwin') return;
  if (!allowQuit) {
    // keep process alive; the window can be re-opened via the dock/taskbar
    return;
  }
  if (store) store.close();
  app.quit();
});
