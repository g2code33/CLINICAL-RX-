import { app, BrowserWindow, ipcMain } from 'electron';
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
    },
  });

  if (isDev() && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    // Load the packaged renderer. force reload on first paint failure.
    const load = (attempt: number) =>
      win.loadFile(path.join(__dirname, '../dist/index.html'), { query: { t: String(Date.now()) } }).catch(() => {
        if (attempt < 2) {
          setTimeout(() => load(attempt + 1), 300);
        } else {
          const { dialog } = require('electron');
          dialog.showErrorBox('CLINICAL Rx could not load', 'The app data may be damaged. Reinstall or contact support.');
        }
      });
    load(0);
  }
  // If the renderer fails to paint even after load, retry once (the classic
  // "blank until forced reload" is usually a first-paint race).
  win.webContents.on('did-fail-load', (_e, code, desc) => {
    if (code === -3) return; // ERR_ABORTED (navigation) — ignore
    if (!win.isDestroyed()) win.reload();
  });
  win.once('ready-to-show', () => win.show());
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
      setTimeout(() => autoUpdater.quitAndInstall(false, true), 500);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, reason: 'error', message: e?.message || 'Install failed' };
    }
  });
}

app.whenReady().then(() => {
  initIpc();
  initUpdater();
  mainWindow = createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

app.on('window-all-closed', () => {
  if (store) store.close();
  if (process.platform !== 'darwin') app.quit();
});
