const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const path = require('path');
const { createSession } = require('./session');

const session = createSession();
const wrap = fn => async (_e, ...args) => {
  try { return { value: await fn(...args) }; }
  catch (e) { return { error: e && e.message ? e.message : String(e) }; }
};
ipcMain.handle('db:connect', wrap(cfg => session.connect(cfg)));
ipcMain.handle('db:disconnect', wrap(() => session.disconnect()));
ipcMain.handle('db:query', wrap((sql, max) => session.query(sql, max)));
ipcMain.handle('db:run', wrap(sql => session.run(sql)));
ipcMain.handle('db:tables', wrap(() => session.tables()));
ipcMain.handle('db:columns', wrap(t => session.columns(t)));
ipcMain.handle('db:primaryKey', wrap(t => session.primaryKey(t)));
ipcMain.handle('db:foreignKeys', wrap(t => session.foreignKeys(t)));
ipcMain.handle('db:uniques', wrap(t => session.uniques(t)));
ipcMain.handle('db:reset', wrap(() => session.reset()));
ipcMain.handle('app:pickFile', wrap(async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile', 'promptToCreate'], filters: [{ name: 'SQLite database', extensions: ['sqlite', 'sqlite3', 'db'] }, { name: 'All files', extensions: ['*'] }] });
  return r.canceled ? null : r.filePaths[0];
}));
// Save an export or a query. data is text or bytes (Uint8Array) made in the window.
ipcMain.handle('app:saveFile', wrap(async (name, filters, data) => {
  const r = await dialog.showSaveDialog({ defaultPath: name, filters: [...filters, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled || !r.filePath) return null;
  await require('fs').promises.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
}));
ipcMain.handle('app:openSql', wrap(async () => {
  const r = await dialog.showOpenDialog({ properties: ['openFile'], filters: [{ name: 'SQL', extensions: ['sql', 'txt'] }, { name: 'All files', extensions: ['*'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return { path: r.filePaths[0], text: await require('fs').promises.readFile(r.filePaths[0], 'utf8') };
}));
ipcMain.handle('app:version', wrap(() => app.getVersion()));
// light, dark or system: also sets the colour of the Windows title bar and menus
ipcMain.handle('app:setTheme', wrap(t => { nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system'; }));
ipcMain.handle('app:readGuide', wrap(() => require('fs').promises.readFile(path.join(__dirname, '..', '..', 'docs', 'user-guide.md'), 'utf8')));
// links in the guide open in the user's browser, never inside the app window
app.on('web-contents-created', (_e, wc) => {
  wc.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  wc.on('will-navigate', (e, url) => { if (!url.startsWith('file:')) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 900, minHeight: 600, title: 'SQLens', backgroundColor: nativeTheme.shouldUseDarkColors ? '#111418' : '#E9ECEF',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}
app.whenReady().then(createWindow);
app.on('window-all-closed', async () => { try { await session.disconnect(); } catch {} app.quit(); });
