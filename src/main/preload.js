// The only bridge between the window and the database code. Errors come back as plain messages.
const { contextBridge, ipcRenderer, webFrame } = require('electron');
const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (r && r.error) throw new Error(r.error);
  return r.value;
};
contextBridge.exposeInMainWorld('sqlens', {
  connect: cfg => call('db:connect', cfg),
  disconnect: () => call('db:disconnect'),
  query: (sql, max) => call('db:query', sql, max),
  run: sql => call('db:run', sql),
  tables: () => call('db:tables'),
  columns: t => call('db:columns', t),
  primaryKey: t => call('db:primaryKey', t),
  foreignKeys: t => call('db:foreignKeys', t),
  uniques: t => call('db:uniques', t),
  reset: () => call('db:reset'),
  saveFile: (name, filters, data) => call('app:saveFile', name, filters, data),
  openSql: () => call('app:openSql'),
  pickFile: () => call('app:pickFile'),
  readGuide: () => call('app:readGuide'),
  version: () => call('app:version'),
  setTheme: t => call('app:setTheme', t),
  // text size from Settings: zooms the whole window, like Ctrl and + in a browser
  setZoom: f => webFrame.setZoomFactor(Math.min(2, Math.max(0.75, Number(f) || 1)))
});
