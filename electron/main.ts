import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { SqliteKV } from './db/database';

let store: SqliteKV | null = null;

function isDev() {
  return !app.isPackaged;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: 'Clinical Rx',
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
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
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
}

app.whenReady().then(() => {
  initIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (store) store.close();
  if (process.platform !== 'darwin') app.quit();
});
