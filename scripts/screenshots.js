// Regenerates the pictures in docs/images from the real window and the sample database.
//   node scripts/screenshots.js
const path = require('path');
const { openApp, runExample, idle } = require('../test/harness');
const OUT = path.join(__dirname, '..', 'docs', 'images');

(async () => {
  const app = await openApp({ engine: 'sqlite' }, { viewport: { width: 1440, height: 1200 } });
  const { page } = app;
  await app.open(null);
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(OUT, 'start.png') });
  await page.click('[data-sample="company"]');
  await idle(page);
  const shot = async (name, sel) => {
    let clip;
    if (sel) { const b = await page.locator(sel).boundingBox(); const m = 18; clip = { x: Math.max(0, b.x - m), y: Math.max(0, b.y - m), width: b.width + 2 * m, height: b.height + 2 * m }; }
    await page.screenshot({ path: path.join(OUT, name + '.png'), clip });
  };
  const step = async i => { await page.click('#tabSteps'); await page.click(`#strip button[data-i="${i}"]`); await page.waitForTimeout(1300); };

  await runExample(page, 0);
  await page.waitForTimeout(400);
  await shot('overview');
  await shot('live-tables', '.pane-data');
  await step(1); await shot('step-where', '.pane-out');
  await step(3); await shot('step-order', '.pane-out');

  await runExample(page, 1);
  await step(1); await shot('step-join', '.pane-out');

  await runExample(page, 8);
  await step(1); await shot('step-null', '.pane-out');

  await runExample(page, 3);
  await step(2); await shot('step-group', '.pane-out');
  await step(3); await shot('step-having', '.pane-out');

  await runExample(page, 4);
  await step(4); await shot('step-limit', '.pane-out');

  await page.click('#tabResult');
  await page.fill('#sql', "UPDATE employees\nSET salary = salary + 2000\nWHERE city = 'Leeds';");
  await page.waitForFunction(() => /UPDATE will change/.test(document.querySelector('#dataBody').innerText));
  await shot('update-preview', '.pane-data');

  // typed queries: WITH, UNION and a window function
  const typed = async sql => {
    await page.click('#tabResult');
    await page.evaluate(() => { document.querySelector('#outResult').innerHTML = ''; });
    await page.fill('#sql', sql); await page.click('#runBtn');
    await page.waitForFunction(() => document.querySelector('#outResult .result-meta, #outResult .err'));
  };
  await typed("SELECT name, dept_id, salary,\n  RANK() OVER (PARTITION BY dept_id ORDER BY salary DESC) AS place\nFROM employees\nWHERE dept_id IS NOT NULL;");
  await step(2); await shot('step-window', '.pane-out');
  await typed("WITH well_paid AS (\n  SELECT * FROM employees WHERE salary > 58000\n)\nSELECT city, COUNT(*) AS people\nFROM well_paid\nGROUP BY city;");
  await step(0); await shot('step-with', '.pane-out');
  await typed("SELECT city FROM employees\nUNION\nSELECT name FROM departments;");
  await step(2); await shot('step-union', '.pane-out');
  await page.click('#tabResult');
  await page.click('#exportBtn'); await page.waitForTimeout(200);
  await shot('export', '.pane-out');
  await page.click('#exportBtn');

  // suggestions while typing
  await page.fill('#sql', ''); await page.click('#sql');
  await page.keyboard.type('SELECT name, sal', { delay: 20 });
  await page.waitForSelector('#ac:not([hidden])'); await page.waitForTimeout(200);
  await shot('suggest', '.pane-code');
  await page.keyboard.press('Escape');

  // the schema map, with a join in the query
  await page.fill('#sql', 'SELECT e.name, d.name AS department\nFROM employees e\nJOIN departments d ON e.dept_id = d.id;');
  await page.waitForTimeout(700);
  await page.click('#viewMap'); await page.waitForSelector('.map-lines g'); await page.waitForTimeout(300);
  await page.hover('.rel-list li'); await page.waitForTimeout(150);
  await shot('schema-map', '.pane-data');
  await page.click('#viewDetails'); await page.click('#tabs [data-t="employees"]');
  await page.waitForSelector('#dataBody .fact'); await page.waitForTimeout(300);
  await shot('details', '.pane-data');
  await page.check('#follow');
  await page.click('#viewRows');

  await page.click('#settingsBtn');
  await shot('settings', '#setForm');
  await page.click('#setForm button[type=submit]');

  await runExample(page, 0);
  await page.click('[data-theme-pick="dark"]');
  await page.waitForTimeout(500);
  await shot('overview-dark');
  await page.click('[data-theme-pick=""]');

  // a lesson, with a first try that is not quite right
  await page.click('#homeBtn');
  await page.click('[data-track="beginner"]');
  await page.waitForSelector('#lesson:not([hidden])');
  await page.selectOption('#lsPick', 'b-where');
  await page.waitForFunction(() => !document.body.dataset.loading);
  await page.fill('#sql', 'SELECT name, salary\nFROM employees\nWHERE salary > 50000;');
  await page.waitForTimeout(700);
  await page.click('#lsCheck');
  await page.waitForFunction(() => document.querySelector('#lsMsg').textContent.trim());
  await page.waitForTimeout(400);
  await shot('lesson');
  await page.click('#lsClose');

  await page.click('#connectBtn');
  await page.selectOption('#cEngine', 'postgres');
  await shot('connect', '#connForm');
  await app.close();
  console.log('Saved pictures to docs/images');
})().catch(e => { console.error(e); process.exit(1); });
