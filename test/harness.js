// Opens the real window (src/renderer) in Chromium and wires window.sqlens to the real
// database drivers in Node, the same calls the desktop app makes through its preload script.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createSession } = require('../src/main/session');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const CALLS = ['connect', 'disconnect', 'query', 'run', 'tables', 'columns', 'primaryKey', 'foreignKeys', 'uniques', 'reset'];

async function openApp(cfg, { viewport = { width: 1440, height: 900 }, colorScheme = 'light', deviceScaleFactor = 1 } = {}) {
  const session = createSession();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport, colorScheme, deviceScaleFactor });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  // Chromium will not load ES modules from file://, so serve the project over a made-up origin
  await page.route('http://app.test/**', r => {
    const f = path.join(ROOT, decodeURIComponent(new URL(r.request().url()).pathname));
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ body: fs.readFileSync(f), contentType: TYPES[path.extname(f)] || 'application/octet-stream' });
  });
  for (const fn of CALLS) await page.exposeFunction('__sw_' + fn, (...a) => fn === 'connect' ? session.connect(cfg.engine === 'sqlite' ? { ...cfg, ...a[0] } : cfg) : session[fn](...a));
  await page.exposeFunction('__sw_readGuide', () => fs.promises.readFile(path.join(ROOT, 'docs', 'user-guide.md'), 'utf8'));
  await page.addInitScript(calls => {
    window.sqlens = {};
    for (const fn of [...calls, 'readGuide']) window.sqlens[fn] = (...a) => window['__sw_' + fn](...a);
    window.sqlens.pickFile = async () => null;
    window.__saved = [];
    window.sqlens.saveFile = async (name, filters, data) => { window.__saved.push({ name, data: typeof data === 'string' ? data : Array.from(data) }); return '/tmp/' + name; };
    window.sqlens.openSql = async () => null;
    try { localStorage.clear(); } catch {}
  }, CALLS);
  return { session, browser, page, errors, async open(sample = 'company') {
    await page.goto('http://app.test/src/renderer/index.html');
    await page.waitForSelector('#welcome:not([hidden])');
    if (!sample) return;
    // from the start page, open an example dataset
    await page.click(`[data-sample="${sample}"]`);
    await idle(page);
  }, async close() { await browser.close(); await session.disconnect(); } };
}

// wait until an example has finished loading and shows a result
async function idle(page) {
  await page.waitForFunction(() => !document.body.dataset.loading && document.querySelector('#outResult .result-meta, #outResult .err'), null, { timeout: 15000 });
}
// pick an example the way the menu does
async function runExample(page, i) {
  await page.evaluate(() => { document.querySelector('#outResult').innerHTML = ''; });
  await page.evaluate(i => { const s = document.querySelector('#examples'); s.value = String(i); s.dispatchEvent(new Event('change')); }, i);
  await idle(page);
}

module.exports = { openApp, runExample, idle };
