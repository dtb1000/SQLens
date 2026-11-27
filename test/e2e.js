// End-to-end check: loads the real window (src/renderer) in Chromium, wires window.sqlens
// to the real database drivers in Node, then runs every example and checks the result and the steps.
//
//   node test/e2e.js                      SQLite sample only
//   PG_URL=postgres://u:p@host:5432/db node test/e2e.js    also PostgreSQL (the sample tables are created there)
const path = require('path');
const { openApp, runExample, idle } = require('./harness');
const SEED = require('../src/main/seed');

const EXPECT = [ // [example index, result rows, step titles that must appear]
  [0, 2, ['Read the table', 'Filter rows (WHERE)', 'Choose columns (SELECT)', 'Sort rows (ORDER BY)', 'Result']],
  [1, 8, ['Read the tables', 'Join departments', 'Choose columns (SELECT)', 'Result']],
  [2, 9, ['Join employees']],
  [3, 2, ['Join departments', 'Make groups (GROUP BY)', 'Filter groups (HAVING)', 'Sort rows (ORDER BY)']],
  [4, 3, ['Make groups (GROUP BY)', 'Sort rows (ORDER BY)', 'Keep the first rows (LIMIT)']],
  [5, 3, ['Make dept_pay (WITH)', 'Join dept_pay']],
  [6, 3, ['Make sales (WITH)', 'Make named (WITH)']],
  [7, 4, ['Read the table']],
  [8, 5, ['Filter rows (WHERE)']],
  [9, null, ['Open employees', 'Find the rows (WHERE)', 'Change the values (SET)']],
  [10, 4, ['Sort rows (ORDER BY)']]
];

// queries typed into the editor: [sql, result rows, step titles that must appear]
const TYPED = [
  ["WITH big AS (SELECT * FROM employees WHERE salary > 55000) SELECT d.name, COUNT(*) AS n FROM big b JOIN departments d ON d.id = b.dept_id GROUP BY d.name", 3, ['Make big (WITH)', 'Read the tables', 'Join departments', 'Make groups (GROUP BY)']],
  ["WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM n WHERE x < 5) SELECT x FROM n", 5, ['Make n (WITH)', 'Read the table']],
  ["SELECT city FROM employees UNION SELECT name FROM departments ORDER BY 1", 7, ['Run part 1', 'Run part 2', 'Combine with UNION', 'Sort or trim the combined rows']],
  ["SELECT city FROM employees EXCEPT SELECT city FROM employees WHERE dept_id = 3", 1, ['Combine with EXCEPT']],
  ["SELECT city FROM employees INTERSECT SELECT city FROM employees WHERE dept_id = 2", 3, ['Combine with INTERSECT']],
  ["SELECT name, dept_id, ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS place FROM employees WHERE dept_id IS NOT NULL", 8, ['Filter rows (WHERE)', 'Window: place', 'Choose columns (SELECT)']],
  ["SELECT name, salary, SUM(salary) OVER (ORDER BY salary) AS running FROM employees", 9, ['Window: running']]
];
// the formatter may only change spaces, line breaks and keyword case
const sameTokens = (a, b) => {
  const t = s => s.replace(/--[^\n]*/g, m => m.trim()).match(/'(?:[^']|'')*'|"[^"]*"|[A-Za-z_][A-Za-z0-9_$]*|\d+(?:\.\d+)?|<=|>=|<>|!=|\|\||--[^\n]*|\S/g).map(x => /^[A-Za-z_]/.test(x) ? x.toUpperCase() : x).join(' ');
  return t(a) === t(b);
};

async function check(name, cfg, prepare) {
  const app = await openApp(cfg);
  const { page, errors } = app;
  if (prepare) await prepare(app.session);
  await app.open();
  let failed = 0;
  for (const [i, rows, titles] of EXPECT) {
    if (name !== 'SQLite' && i === 10) continue; // the INSERT example changes a shared table; skip on servers
    await runExample(page, i);
    const got = await page.evaluate(() => ({
      meta: document.querySelector('#outResult').innerText.split('\n')[0],
      err: document.querySelector('#outResult .err')?.innerText || null,
      steps: [...document.querySelectorAll('#strip button')].map(b => b.textContent.replace(/^\d+/, '').trim()),
      stepErr: document.querySelector('#stage .say')?.innerText.includes('could not break') || false
    }));
    const ok = !got.err && (rows === null || got.meta.startsWith(rows + ' row')) && titles.every(t => got.steps.includes(t)) && !got.stepErr;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} example ${i}: ${got.meta} | ${got.steps.join(' > ')}${got.err ? ' | ' + got.err : ''}`);
  }
  for (const [sql, rows, titles] of TYPED) {
    await page.evaluate(() => { document.querySelector('#outResult').innerHTML = ''; });
    await page.fill('#sql', sql); await page.click('#runBtn');
    await page.waitForFunction(() => document.querySelector('#outResult .result-meta, #outResult .err'), null, { timeout: 15000 });
    const got = await page.evaluate(() => ({
      meta: document.querySelector('#outResult').innerText.split('\n')[0],
      err: document.querySelector('#outResult .err')?.innerText || null,
      steps: [...document.querySelectorAll('#strip button')].map(b => b.textContent.replace(/^\d+/, '').trim()),
      leak: /sw_s|ORA\$PTT|#sw_/i.test(document.querySelector('#outSteps').innerText)
    }));
    const ok = !got.err && got.meta.startsWith(rows + ' row') && titles.every(t => got.steps.includes(t)) && !got.leak;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${sql.slice(0, 40)}…: ${got.meta} | ${got.steps.join(' > ')}${got.err ? ' | ' + got.err : ''}${got.leak ? ' | temporary table name shown' : ''}`);
  }
  // suggestions: a misspelt table is offered, and Enter puts it in
  await page.fill('#sql', ''); await page.click('#sql');
  await page.keyboard.type('SELECT * FROM emploees', { delay: 10 });
  const sug = await page.waitForFunction(() => { const i = document.querySelector('#ac:not([hidden]) .ac-item.on'); return i && i.innerText; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  await page.keyboard.press('Enter');
  const fixed = await page.inputValue('#sql');
  await page.keyboard.type(' e WHERE e.sa', { delay: 10 });
  const col = await page.waitForFunction(() => { const i = document.querySelector('#ac:not([hidden]) .ac-item.on'); return i && i.innerText; }, null, { timeout: 5000 }).then(h => h.jsonValue(), () => null);
  await page.keyboard.press('Escape');
  const sOk = /employees/.test(sug || '') && fixed === 'SELECT * FROM employees' && /^salary/.test(col || '');
  if (!sOk) failed++;
  console.log(`${sOk ? 'ok  ' : 'FAIL'} ${name} suggestions: ${JSON.stringify([sug, fixed, col])}`);
  // formatting keeps the meaning
  const messy = "select d.name as dept, count(*) n from employees e join departments d on d.id=e.dept_id where e.salary between 40000 and 90000 and e.city in ('Leeds','London') -- note\ngroup by d.name having count(*)>1 order by n desc;\nselect 1;";
  await page.fill('#sql', messy); await page.click('#formatBtn');
  const pretty = await page.inputValue('#sql');
  const fOk = sameTokens(messy, pretty) && pretty.split('\n').length > 8;
  if (!fOk) { failed++; console.log(pretty); }
  console.log(`${fOk ? 'ok  ' : 'FAIL'} ${name} format`);
  // export and history
  await runExample(page, 0);
  await page.evaluate(() => { window.__saved = []; });
  for (const f of ['csv', 'xlsx', 'json', 'md', 'sql']) { await page.click('#exportBtn'); await page.click(`[data-f="${f}"]`); await page.waitForTimeout(150); }
  const saved = await page.evaluate(() => window.__saved.map(x => ({ name: x.name, data: x.data })));
  const csv = saved.find(x => x.name.endsWith('.csv')), xl = saved.find(x => x.name.endsWith('.xlsx'));
  const eOk = saved.length === 5 && csv && /\r\nAmara Okafor,\d+,/.test(csv.data) && xl && xl.data[0] === 0x50 && xl.data[1] === 0x4B;
  if (!eOk) { failed++; console.log(JSON.stringify(saved.map(x => [x.name, typeof x.data === 'string' ? x.data.slice(0, 120) : x.data.slice(0, 4)]))); }
  console.log(`${eOk ? 'ok  ' : 'FAIL'} ${name} export: ${saved.map(x => x.name).join(', ')}`);
  await page.click('#tabHistory');
  const hist = await page.evaluate(() => document.querySelectorAll('#histList > li:not(.empty)').length);
  const hOk = hist >= TYPED.length;
  if (!hOk) failed++;
  console.log(`${hOk ? 'ok  ' : 'FAIL'} ${name} history: ${hist} entries`);
  await page.click('#tabResult');
  // schema map draws the links between tables
  await page.click('#viewMap');
  const links = await page.waitForFunction(() => document.querySelectorAll('.map-lines g[data-i]').length, null, { timeout: 10000 }).then(h => h.jsonValue(), () => 0);
  const mOk = links === 2;
  if (!mOk) failed++;
  console.log(`${mOk ? 'ok  ' : 'FAIL'} ${name} schema map: ${links} links`);
  const words = await page.$$eval('.rel-list li b', l => l.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
  const wOk = words.includes('departments 1 to many employees') && words.includes('employees 1 to many orders');
  if (!wOk) failed++;
  console.log(`${wOk ? 'ok  ' : 'FAIL'} ${name} one and many sides: ${JSON.stringify(words)}`);
  // details: types, sizes, empty or not, keys and real counts
  await page.click('#viewDetails');
  await page.click('#tabs [data-t="employees"]');
  const det = await page.waitForFunction(() => {
    const t = document.querySelector('#dataBody .dt.meta'); if (!t || !document.querySelector('#dataBody .fact')) return null;
    return { rows: [...t.querySelectorAll('tbody tr')].map(r => [...r.cells].map(c => c.textContent.trim())), fact: document.querySelector('#dataBody .fact').textContent };
  }, null, { timeout: 10000 }).then(h => h.jsonValue(), () => null);
  const nameRow = det && det.rows.find(r => r[0] === 'name');
  const dOk = !!(nameRow && /60 characters/.test(nameRow[2]) && nameRow[3] === '60' && nameRow[4] === 'no' && /3 of 4 rows/.test(det.fact));
  if (!dOk) failed++;
  console.log(`${dOk ? 'ok  ' : 'FAIL'} ${name} table details: ${JSON.stringify(nameRow)} ${det ? det.fact : ''}`);
  await page.check('#follow');
  await page.click('#viewRows');
  // the System / Light / Dark switch
  await page.click('[data-theme-pick="dark"]');
  const tDark = await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor, JSON.parse(localStorage.getItem('sqlens-settings')).theme]);
  await page.click('[data-theme-pick=""]');
  const tSys = await page.evaluate(() => [document.documentElement.dataset.theme || '', document.querySelector('[data-theme-pick=""]').getAttribute('aria-pressed')]);
  const tOk = tDark[0] === 'dark' && tDark[2] === 'dark' && tSys[0] === '' && tSys[1] === 'true';
  if (!tOk) failed++;
  console.log(`${tOk ? 'ok  ' : 'FAIL'} ${name} light / dark switch: ${tDark.join(', ')} then ${tSys.join(', ')}`);
  // live highlighting while typing
  await page.fill('#sql', "SELECT name, salary / 12 AS monthly FROM employees WHERE city = 'London'");
  await page.waitForFunction(() => /WHERE keeps 3 of 9 rows/.test(document.querySelector('#dataBody').innerText), null, { timeout: 10000 })
    .then(() => console.log(`ok   ${name} live highlighting`), () => { failed++; console.log(`FAIL ${name} live highlighting`); });
  // the user guide opens and renders
  await page.click('#guideBtn');
  await page.waitForFunction(() => document.querySelectorAll('#guideToc a').length > 5, null, { timeout: 10000 })
    .then(() => console.log(`ok   ${name} user guide opens`), () => { failed++; console.log(`FAIL ${name} user guide opens`); });
  await page.screenshot({ path: path.join(__dirname, `screenshot-${name.toLowerCase()}-guide.png`) });
  await page.click('#guideClose');
  await page.screenshot({ path: path.join(__dirname, `screenshot-${name.toLowerCase()}.png`) });
  const real = errors.filter(e => !/ERR_|Failed to load resource/.test(e));
  if (real.length) { failed++; console.log('Page errors:', real); }
  await app.close();
  return failed;
}

// the start page: connection choices first, and the three example datasets
async function startPage() {
  const app = await openApp({ engine: 'sqlite' });
  const { page, errors } = app;
  let failed = 0;
  const ok = (cond, msg) => { if (!cond) failed++; console.log(`${cond ? 'ok  ' : 'FAIL'} start page: ${msg}`); };
  await app.open(null);
  ok(await page.isHidden('#grid') && await page.isVisible('[data-engine="postgres"]'), 'opens on the start page, not on a database');
  await page.click('[data-engine="mysql"]');
  ok(await page.isVisible('#connForm') && await page.inputValue('#cEngine') === 'mysql', 'a database tile opens Connect with that database chosen');
  await page.click('#cCancel');
  const sample = async (name, rows, viewIdx, viewRows) => {
    await page.click(`[data-sample="${name}"]`); await idle(page);
    const meta = await page.evaluate(() => document.querySelector('#outResult').innerText.split('\n')[0]);
    ok(await page.isVisible('#grid') && meta.startsWith(rows + ' row'), `${name} example opens and runs: ${meta}`);
    const shown = await page.evaluate(() => { const s = document.querySelector('#examples'); return s.options[s.selectedIndex].text; });
    ok(shown !== 'Pick an example…', `${name}: the Examples menu names the example that opened: ${shown}`);
    await runExample(page, viewIdx);
    const shown2 = await page.evaluate(() => { const s = document.querySelector('#examples'); return s.options[s.selectedIndex].text; });
    ok(/view/i.test(shown2), `${name}: the Examples menu names the picked example: ${shown2}`);
    // the table list refreshes a moment after the run, so wait for the new view to appear in it
    await page.waitForFunction(() => document.querySelectorAll('#tabs .tab').length === 4, null, { timeout: 10000 }).catch(() => {});
    const v = await page.evaluate(() => [document.querySelector('#outResult').innerText.split('\n')[0], [...document.querySelectorAll('#tabs .tab span')].map(x => x.textContent)]);
    ok(v[0].startsWith(viewRows + ' row') && v[1].length === 4, `${name} view example: ${v[0]}, tables ${v[1].join(', ')}`);
    await page.click('#sql'); await page.keyboard.press('End'); await page.keyboard.type(' ');
    ok(await page.inputValue('#examples') === '', `${name}: editing the query clears the name`);
    await page.click('#homeBtn');
    ok(await page.isVisible('#welcome'), 'Start page goes back');
  };
  await sample('school', 16, 4, 3);
  await sample('library', 8, 4, 4);
  const real = errors.filter(e => !/ERR_|Failed to load resource/.test(e));
  if (real.length) { failed++; console.log('Page errors:', real); }
  await app.close();
  return failed;
}

// every lesson: its own answer passes Check, and a wrong answer gets a helpful message
async function lessons() {
  const { LESSONS } = await import('data:text/javascript,' + encodeURIComponent(require('fs').readFileSync(require('path').join(__dirname, '../src/renderer/lessons.js'), 'utf8')));
  const app = await openApp({ engine: 'sqlite' });
  const { page, errors } = app;
  let failed = 0;
  await app.open(null);
  await page.click('[data-track="beginner"]'); await idle(page).catch(() => {});
  await page.waitForSelector('#lesson:not([hidden])');
  const check = async sql => {
    await page.fill('#sql', sql);
    await page.evaluate(() => { const t = document.querySelector('#sql'); t.setSelectionRange(t.value.length, t.value.length); document.querySelector('#lsMsg').innerHTML = ''; });
    await page.click('#lsCheck');
    await page.waitForFunction(() => !document.body.dataset.loading && document.querySelector('#lsMsg').innerHTML.trim(), null, { timeout: 15000 });
    return page.evaluate(() => ({ cls: document.querySelector('#lsMsg').className, text: document.querySelector('#lsMsg').innerText.replace(/\s+/g, ' ').trim() }));
  };
  for (const L of LESSONS) {
    await page.selectOption('#lsPick', L.id);
    await page.waitForFunction(id => !document.body.dataset.loading && document.querySelector('#lsPick').value === id, L.id, { timeout: 15000 });
    const r = await check(L.answer);
    const ok = /ls-yes/.test(r.cls);
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} lesson ${L.id}: ${r.text.slice(0, 90)}`);
  }
  // a wrong answer, a missing keyword, and a statement that would change data
  await page.selectOption('#lsPick', 'b-where'); await page.waitForFunction(() => !document.body.dataset.loading);
  let r = await check('SELECT name, salary FROM employees;');
  let ok = /ls-no/.test(r.cls) && /9 rows/.test(r.text); if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} lesson wrong answer: ${r.text}`);
  await page.selectOption('#lsPick', 'b-in-between-like'); await page.waitForFunction(() => !document.body.dataset.loading);
  r = await check('SELECT name, salary FROM employees WHERE salary >= 50000 AND salary <= 60000;');
  ok = /ls-almost/.test(r.cls); if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} lesson right result without the lesson's keyword: ${r.text}`);
  r = await check('DELETE FROM employees;');
  ok = /ls-no/.test(r.cls) && /reads data/.test(r.text); if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} lesson refuses to run a change in a query lesson: ${r.text.slice(0, 80)}`);
  const done = await page.evaluate(() => JSON.parse(localStorage.getItem('sqlens-lessons')).done.length);
  ok = done === LESSONS.length; if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} lesson progress saved: ${done} of ${LESSONS.length}`);
  const real = errors.filter(e => !/ERR_|Failed to load resource/.test(e));
  if (real.length) { failed++; console.log('Page errors:', real); }
  await app.close();
  return failed;
}

(async () => {
  let failed = await startPage();
  failed += await lessons();
  failed += await check('SQLite', { engine: 'sqlite' });
  if (process.env.PG_URL) {
    const u = new URL(process.env.PG_URL);
    const cfg = { engine: 'postgres', host: u.hostname, port: u.port, user: decodeURIComponent(u.username), password: decodeURIComponent(u.password), database: u.pathname.slice(1) };
    failed += await check('PostgreSQL', cfg, async s => {
      await s.connect(cfg);
      await s.run('DROP TABLE IF EXISTS orders, employees, departments CASCADE');
      await s.run(SEED);
    });
  }
  console.log(failed ? `${failed} check(s) failed` : 'All checks passed');
  process.exit(failed ? 1 : 0);
})();
