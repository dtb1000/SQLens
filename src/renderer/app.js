// SQLens: the window.
// Three areas, like RStudio: the query editor, the live tables, and the output (result + "How it ran" steps).
import { tokenize, setDepth, isName, isDot, nameVal, splitTop, textOf, HL_KW, statements, statementAt, parseQuery, containsAgg, columnRefs } from './sql-parse.js';
import { DIALECTS, isHelperCol, colIndex } from './dialects.js';
import { Adapter } from './adapter.js';
import { renderMarkdown } from './markdown.js';
import { formatSql } from './format.js';
import { suggest } from './complete.js';
import { FORMATS, encode } from './export.js';
import { loadSchema, renderSchemaMap } from './schema-map.js';
import { renderDetails } from './details.js';
import { TRACKS, LESSONS, lessonsIn, compareResults } from './lessons.js';

/* ============================== Examples (for the built-in samples) ============================== */
// [title, sql, run every statement in turn]
const EXAMPLES = {
  company: [
    ["Filter and sort", "SELECT name, salary, salary * 1.1 AS with_raise\nFROM employees\nWHERE salary > 55000 AND city = 'Leeds'\nORDER BY salary DESC;"],
    ["Join two tables", "SELECT e.name, d.name AS department\nFROM employees e\nJOIN departments d ON e.dept_id = d.id;"],
    ["LEFT JOIN keeps unmatched rows", "SELECT d.name AS department, e.name\nFROM departments d\nLEFT JOIN employees e ON e.dept_id = d.id;"],
    ["Group and count", "SELECT d.name AS department, COUNT(*) AS people, AVG(e.salary) AS avg_salary\nFROM employees e\nJOIN departments d ON e.dept_id = d.id\nGROUP BY d.name\nHAVING COUNT(*) >= 3\nORDER BY avg_salary DESC;"],
    ["Top 3 sellers", "SELECT e.name, SUM(o.amount) AS total_sales\nFROM orders o\nJOIN employees e ON o.employee_id = e.id\nGROUP BY e.name\nORDER BY total_sales DESC\nLIMIT 3;"],
    ["WITH: name a step first (CTE)", "-- WITH makes a small named result, dept_pay,\n-- that the main query can then use like a table.\nWITH dept_pay AS (\n  SELECT dept_id, AVG(salary) AS avg_pay\n  FROM employees\n  GROUP BY dept_id\n)\nSELECT e.name, e.salary, p.avg_pay\nFROM employees e\nJOIN dept_pay p ON p.dept_id = e.dept_id\nWHERE e.salary > p.avg_pay;"],
    ["WITH: two steps in a row", "-- Each named step can use the ones before it.\nWITH sales AS (\n  SELECT employee_id, SUM(amount) AS total\n  FROM orders\n  GROUP BY employee_id\n),\nnamed AS (\n  SELECT e.name, s.total\n  FROM sales s\n  JOIN employees e ON e.id = s.employee_id\n)\nSELECT name, total\nFROM named\nWHERE total > 2000\nORDER BY total DESC;"],
    ["Make a view", "-- A view is a query saved in the database under a name.\n-- After CREATE VIEW, use it like a table.\nDROP VIEW IF EXISTS leeds_staff;\n\nCREATE VIEW leeds_staff AS\nSELECT id, name, salary\nFROM employees\nWHERE city = 'Leeds';\n\nSELECT name, salary\nFROM leeds_staff\nORDER BY salary DESC;", true],
    ["The NULL trap", "-- Hugo has no department (NULL).\n-- Does he count as 'not in Sales'?\nSELECT name, dept_id\nFROM employees\nWHERE dept_id <> 2;"],
    ["Give Leeds a raise (UPDATE)", "UPDATE employees\nSET salary = salary + 2000\nWHERE city = 'Leeds';"],
    ["Several statements", "-- Put the cursor on a statement and press Ctrl+Enter.\nINSERT INTO departments VALUES (5, 'Support', 1);\n\nSELECT id, name FROM departments ORDER BY name;"]
  ],
  school: [
    ["Who takes what (many to many)", "-- enrolments links students and courses:\n-- a student takes many courses, a course has many students.\nSELECT s.name, c.title, e.grade\nFROM enrolments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c ON c.id = e.course_id\nORDER BY s.name;"],
    ["Average grade per course", "SELECT c.title, COUNT(*) AS students, AVG(e.grade) AS avg_grade\nFROM courses c\nJOIN enrolments e ON e.course_id = c.id\nGROUP BY c.title\nORDER BY avg_grade DESC;"],
    ["Courses nobody takes", "SELECT c.title, e.student_id\nFROM courses c\nLEFT JOIN enrolments e ON e.course_id = c.id\nWHERE e.student_id IS NULL;"],
    ["WITH: each student's average (CTE)", "WITH per_student AS (\n  SELECT student_id, AVG(grade) AS avg_grade\n  FROM enrolments\n  GROUP BY student_id\n)\nSELECT s.name, s.year, p.avg_grade\nFROM students s\nJOIN per_student p ON p.student_id = s.id\nWHERE p.avg_grade >= 70\nORDER BY p.avg_grade DESC;"],
    ["Make a view: report card", "-- Save the three-table join as a view, then ask it simple questions.\nDROP VIEW IF EXISTS report;\n\nCREATE VIEW report AS\nSELECT s.name, c.title, e.grade\nFROM enrolments e\nJOIN students s ON s.id = e.student_id\nJOIN courses c ON c.id = e.course_id;\n\nSELECT name, title, grade\nFROM report\nWHERE grade < 60;", true],
    ["Grades not given yet (NULL)", "SELECT student_id, course_id, grade\nFROM enrolments\nWHERE grade < 60 OR grade IS NULL;"]
  ],
  library: [
    ["Books and their authors", "SELECT b.title, a.name AS author, b.published\nFROM books b\nLEFT JOIN authors a ON a.id = b.author_id\nORDER BY b.published;"],
    ["Books still out", "SELECT b.title, l.borrower, l.out_on\nFROM loans l\nJOIN books b ON b.id = l.book_id\nWHERE l.back_on IS NULL\nORDER BY l.out_on;"],
    ["Most borrowed", "SELECT b.title, COUNT(*) AS times\nFROM loans l\nJOIN books b ON b.id = l.book_id\nGROUP BY b.title\nORDER BY times DESC\nLIMIT 3;"],
    ["WITH: busy borrowers (CTE)", "WITH per_person AS (\n  SELECT borrower, COUNT(*) AS loans\n  FROM loans\n  GROUP BY borrower\n)\nSELECT borrower, loans\nFROM per_person\nWHERE loans >= 3;"],
    ["Make a view: on the shelf", "-- on_loan lists the books that are out. Books with no match are on the shelf.\nDROP VIEW IF EXISTS on_loan;\n\nCREATE VIEW on_loan AS\nSELECT book_id, borrower\nFROM loans\nWHERE back_on IS NULL;\n\nSELECT b.title, o.borrower\nFROM books b\nLEFT JOIN on_loan o ON o.book_id = b.id\nWHERE o.book_id IS NULL;", true],
    ["Return a book (UPDATE)", "UPDATE loans\nSET back_on = '2026-11-27'\nWHERE id = 4;"]
  ]
};

/* ============================== Helpers ============================== */
const $ = s => document.querySelector(s);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let MAXROWS = 100; // rows shown in the previews; Settings can raise it to 1000
function fmt(v) {
  if (v === null || v === undefined) return '<span class="nul">NULL</span>';
  if (typeof v === 'number') return esc(Number.isInteger(v) ? v : +v.toFixed(4));
  if (typeof v === 'object' && 'binary' in v) return `<span class="nul">[${v.binary} bytes]</span>`;
  return esc(v);
}
const isNum = v => typeof v === 'number';
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const keyOf = arr => JSON.stringify(arr);
const code = s => `<code>${esc(s)}</code>`;
const tagStyle = i => i < 0 ? '' : `style="background:var(--t${i % 8})"`;
const tag = (p, i) => i < 0 ? `<span class="tag t-none">none</span>` : `<span class="tag" ${tagStyle(i)}>${p}${i + 1}</span>`;
const tri = v => v === 1 ? '<span class="yes">✓ yes</span>' : v === 0 ? '<span class="no">✗ no</span>' : '<span class="unk">? unknown</span>';
const asTri = v => v === null || v === undefined ? null : Number(v);

let A = null; // the open database (Adapter)

/* ============================== Table rendering ============================== */
function renderTable(cols, rows, o = {}) {
  const show = cols.map((c, i) => i).filter(i => !isHelperCol(cols[i]));
  const lead = o.lead || null, trail = o.trail || null;
  let h = `<div class="tbl-wrap"${o.maxh ? ` style="max-height:${o.maxh}px"` : ''}><table class="dt"><thead><tr>`;
  if (o.index !== false) h += `<th class="idx">#</th>`;
  if (lead) h += lead.head.map(x => `<th>${x}</th>`).join('');
  for (const i of show) h += `<th class="${o.colClass ? o.colClass(i) : ''}">${o.head ? o.head(i) : esc(cols[i])}</th>`;
  if (trail) h += trail.head.map(x => `<th class="${x.cls || ''}">${x.html}</th>`).join('');
  h += `</tr></thead><tbody>`;
  const lim = Math.min(rows.length, o.max || MAXROWS);
  for (let r = 0; r < lim; r++) {
    const row = rows[r];
    h += `<tr class="${o.rowClass ? o.rowClass(r) : ''}"${o.rowAttr ? ' ' + o.rowAttr(r) : ''}>`;
    if (o.index !== false) h += `<td class="idx">${r + 1}</td>`;
    if (lead) h += lead.cells(row, r).map(x => `<td>${x}</td>`).join('');
    for (const i of show) h += `<td class="${isNum(row[i]) ? 'n ' : ''}${o.cellClass ? o.cellClass(r, i) : ''}">${fmt(row[i])}</td>`;
    if (trail) h += trail.cells(row, r).map(x => `<td class="${x.cls || ''}">${x.html}</td>`).join('');
    h += `</tr>`;
  }
  h += `</tbody></table></div>`;
  if (rows.length > lim) h += `<p class="hint" style="padding:6px 10px">Showing the first ${lim} of ${rows.length} rows.</p>`;
  return h;
}

/* ============================== Live table highlighting ============================== */
let pinnedTab = null;
const boolExpr = c => `CASE WHEN (${c}) THEN 1 WHEN NOT (${c}) THEN 0 END`;

async function liveAnalyze(stmt) {
  const res = { sources: [] };
  if (!stmt) return res;
  const q = parseQuery(stmt.text);
  const add = async (table, refName, refSql) => {
    const t = await A.findTable(table); if (!t) return;
    res.sources.push({ table: t, refName, refSql, roles: new Map(), keep: null, planned: [], chips: [], marks: null });
  };
  if (q.kind === 'SELECT' && q.from) for (const f of q.from) { if (f && f.table) await add(f.table, f.refName, f.alias ? f.ref : null); }
  if (['UPDATE', 'DELETE', 'INSERT', 'REPLACE'].includes(q.kind) && q.target) await add(q.target, q.targetAlias || q.target, q.targetAliasSql || null);
  if (!res.sources.length) return res;
  for (const s of res.sources) {
    s.cols = await A.tableInfo(s.table); s.colNames = s.cols.map(c => c.name);
    s.data = await A.query(A.top('*', A.qi(s.table), MAXROWS));
    s.total = await A.count(A.qi(s.table));
  }
  const fromOf = s => `${A.qi(s.table)}${s.refSql ? ' ' + s.refSql : ''}`;
  const addRole = (s, c, role) => { if (!s.roles.has(c)) s.roles.set(c, new Set()); s.roles.get(c).add(role); };
  const mark = (refs, role) => {
    for (const r of refs) for (const s of res.sources) {
      if (r.qual && r.qual.toLowerCase() !== String(s.refName).toLowerCase() && r.qual.toLowerCase() !== s.table.toLowerCase()) continue;
      if (r.name === '*') { s.colNames.forEach(c => addRole(s, c, role)); continue; }
      const c = s.colNames.find(c => c.toLowerCase() === r.name.toLowerCase());
      if (c) addRole(s, c, role);
    }
  };
  const evalOn = async (s, expr) => { try { return (await A.query(A.top(`${expr} AS sw_v`, fromOf(s), MAXROWS))).rows.map(r => r[0]); } catch { return null; } };
  const boolOn = async (s, cond) => { const v = await evalOn(s, boolExpr(cond)); return v && v.map(asTri); };

  if (q.kind === 'SELECT') {
    for (const it of q.items || []) {
      if (!it.toks.length) continue;
      if (it.star) { res.sources.forEach(s => s.colNames.forEach(c => addRole(s, c, 'select'))); continue; }
      if (it.qualStar) { mark([{ qual: it.qualStar, name: '*' }], 'select'); continue; }
      if (it.plain) { mark(columnRefs(it.toks), 'select'); continue; }
      mark(columnRefs(it.toks), 'input');
      const label = it.alias || it.expr;
      if (containsAgg(it.toks)) { res.sources[0].planned.push({ label, note: q.cl['GROUP BY'] ? 'one value per group' : 'one value for all rows' }); continue; }
      let placed = false;
      for (const s of res.sources) { const v = await evalOn(s, it.expr); if (v) { s.planned.push({ label, values: v }); placed = true; break; } }
      if (!placed && res.sources.length > 1) res.sources[res.sources.length - 1].planned.push({ label, note: 'needs the join first' });
    }
    for (const f of q.from || []) if (f && f.onToks) mark(columnRefs(f.onToks), 'join');
    if (q.cl.WHERE) {
      mark(columnRefs(q.cl.WHERE.toks), 'filter');
      for (const s of res.sources) {
        let keep = await boolOn(s, q.cl.WHERE.text), partial = false;
        if (!keep && q.whereParts.length > 1) {
          const lists = (await Promise.all(q.whereParts.map(p => boolOn(s, p)))).filter(Boolean);
          if (lists.length) { partial = true; keep = lists[0].map((_, r) => lists.some(l => l[r] === 0) ? 0 : lists.some(l => l[r] === null) ? null : 1); }
        }
        if (keep) {
          s.keep = keep;
          const k = keep.filter(v => v === 1).length, u = keep.filter(v => v === null).length;
          s.chips.push({ cls: 'keep', text: `WHERE keeps ${k} of ${keep.length} rows${partial ? ' (from the parts about this table)' : ''}` });
          if (u) s.chips.push({ cls: 'drop', text: `${plural(u, 'row')} ${u === 1 ? 'gives' : 'give'} UNKNOWN because of NULL, so ${u === 1 ? 'it is' : 'they are'} removed` });
        }
      }
    }
    if (q.cl['GROUP BY']) mark(columnRefs(q.cl['GROUP BY'].toks), 'group');
    if (q.cl.HAVING) mark(columnRefs(q.cl.HAVING.toks), 'filter');
    if (q.cl['ORDER BY']) mark(columnRefs(q.cl['ORDER BY'].toks), 'sort');
    for (const s of res.sources) {
      const sel = [...s.roles.values()].filter(r => r.has('select')).length;
      if (sel) s.chips.unshift({ cls: 'sel', text: `SELECT picks ${plural(sel, 'column')}` });
      if (s.planned.length) s.chips.push({ cls: 'plan', text: `${plural(s.planned.length, 'new column')} planned` });
    }
  } else {
    const s = res.sources[0];
    const cond = q.cl.WHERE ? q.cl.WHERE.text : null;
    if (q.cl.WHERE) mark(columnRefs(q.cl.WHERE.toks), 'filter');
    const hit = cond ? await boolOn(s, cond) : (q.kind === 'INSERT' || q.kind === 'REPLACE' ? null : s.data.rows.map(() => 1));
    if (q.kind === 'UPDATE') {
      for (const st of q.sets || []) {
        const c = s.colNames.find(c => c.toLowerCase() === st.colName.toLowerCase());
        if (c) addRole(s, c, 'set');
        mark(columnRefs(st.toks), 'input');
        const vals = await evalOn(s, `CASE WHEN ${cond ? `(${cond})` : '1=1'} THEN (${st.expr}) END`);
        if (vals) s.planned.push({ label: `${st.colName} → new`, values: vals, only: hit, setCol: c });
      }
      if (hit) { s.marks = hit.map(v => v === 1 ? 'chg' : ''); s.chips.push({ cls: 'plan', text: `UPDATE will change ${plural(hit.filter(v => v === 1).length, 'row')}` }); }
    } else if (q.kind === 'DELETE') {
      if (hit) { s.marks = hit.map(v => v === 1 ? 'del' : ''); s.chips.push({ cls: 'drop', text: `DELETE will remove ${plural(hit.filter(v => v === 1).length, 'row')}` }); }
    } else {
      s.chips.push({ cls: 'plan', text: 'INSERT will add new rows' });
    }
  }
  return res;
}

async function renderData(live) {
  const tables = await A.tables();
  const used = new Set(live.sources.map(s => s.table));
  const follow = $('#follow').checked && live.sources.length;
  if (!pinnedTab || !tables.includes(pinnedTab)) pinnedTab = tables[0];
  const tabsHtml = () => tables.map(t => {
    const sel = follow ? used.has(t) : t === pinnedTab;
    return `<button class="tab" role="tab" type="button" data-t="${esc(t)}" aria-selected="${sel}"><span>${esc(t)}</span>${used.has(t) ? '<small class="used">in query</small>' : ''}</button>`;
  }).join('');
  if (view === 'details') {
    $('#tabs').innerHTML = tabsHtml();
    const names = follow ? [...new Set(live.sources.map(s => s.table))] : pinnedTab ? [pinnedTab] : [];
    if (!schemaCache) schemaCache = await loadSchema(A);
    const counted = new Map();
    const rowCount = async t => { if (!counted.has(t)) counted.set(t, await A.count(A.qi(t))); return counted.get(t); };
    const body = $('#dataBody'), top = body.scrollTop;
    await renderDetails(body, A, schemaCache, names, rowCount);
    body.scrollTop = top;
    return;
  }
  let blocks = follow ? live.sources : [];
  if (!follow && pinnedTab) {
    const t = pinnedTab, info = await A.tableInfo(t);
    blocks = [{ table: t, cols: info, colNames: info.map(c => c.name), data: await A.query(A.top('*', A.qi(t), MAXROWS)), total: await A.count(A.qi(t)), roles: new Map(), planned: [], chips: [], keep: null, marks: null }];
  }
  $('#tabs').innerHTML = tabsHtml();
  const body = $('#dataBody'); const top = body.scrollTop;
  const ROLE = { select: 'select', filter: 'where', join: 'join', group: 'group by', sort: 'order by', input: 'used', set: 'set' };
  body.innerHTML = blocks.map(s => {
    const cols = s.data.cols, rows = s.data.rows;
    const roleOf = c => s.roles.get(s.colNames.find(n => n.toLowerCase() === String(c).toLowerCase())) || new Set();
    const head = i => {
      const c = cols[i], info = s.cols.find(x => x.name.toLowerCase() === String(c).toLowerCase());
      const rl = [...roleOf(c)].map(r => `<span class="role r-${r}">${ROLE[r]}</span>`).join('');
      return `<span class="colhead"><span>${esc(c)}</span><span class="coltype">${esc(info ? String(info.type).toLowerCase() : '')}</span>${rl ? `<span class="roles">${rl}</span>` : ''}</span>`;
    };
    const selected = i => roleOf(cols[i]).has('select');
    const trail = s.planned.length ? {
      head: s.planned.map(p => ({ cls: 'plan', html: `<span class="colhead"><span>${esc(p.label)}</span><span class="coltype">${p.note ? esc(p.note) : 'new column'}</span></span>` })),
      cells: (row, r) => s.planned.map(p => ({ cls: 'plan', html: p.values ? (p.only && p.only[r] !== 1 ? '<span class="arrow">no change</span>' : fmt(p.values[r])) : '<span class="arrow">…</span>' }))
    } : null;
    const setCols = new Set(s.planned.filter(p => p.setCol).map(p => p.setCol.toLowerCase()));
    const rowClass = r => s.marks ? (s.marks[r] === 'del' ? 'del' : '') : s.keep ? (s.keep[r] === 1 ? 'keep' : 'drop') : '';
    const cellClass = (r, i) => (s.marks && s.marks[r] === 'chg' && setCols.has(String(cols[i]).toLowerCase())) ? 'chg' : selected(i) ? 'sel' : '';
    const ref = s.refName && s.refName.toLowerCase() !== s.table.toLowerCase() ? `<span class="alias">as ${esc(s.refName)}</span>` : '';
    return `<div class="tblock"><div class="tblock-head"><h3>${esc(s.table)}</h3>${ref}<span class="notice">${plural(s.total, 'row')}${s.total > MAXROWS ? `, showing the first ${MAXROWS}` : ''}</span></div>
      ${s.chips.length ? `<p class="summary">${s.chips.map(c => `<span class="${c.cls}">${esc(c.text)}.</span>`).join(' ')}</p>` : ''}
      ${renderTable(cols, rows, { head, colClass: i => selected(i) ? 'sel' : '', rowClass, cellClass, trail })}</div>`;
  }).join('') || '<p class="empty">This database has no tables yet. Start typing a query, or create a table and press Run.</p>';
  body.scrollTop = top;
}

/* ============================== Steps for SELECT ============================== */
async function selectSteps(q, finalRes) {
  const steps = [];
  const unsupported = q.compound ? 'UNION, INTERSECT or EXCEPT' : q.hasWith ? 'WITH (common table expressions)' : q.window && (q.groupExprs || q.hasAgg) ? 'window functions together with GROUP BY' : null;
  const srcs = q.from || [];
  if (unsupported || srcs.some(s => !s || s.weird)) {
    return [{ key: 'result', title: 'Result', clause: '', say: `This query uses ${unsupported || 'a FROM clause shape'} that this early version cannot draw step by step yet. Here is the result.`, html: renderTable(finalRes.cols, finalRes.rows) }];
  }
  const d = A.d, qi = x => A.qi(x);
  const multi = srcs.length > 1;
  const temps = [];
  const W = q.cl.WHERE ? q.cl.WHERE.text : null;
  try {
    for (let k = 0; k < srcs.length; k++) {
      const s = srcs[k];
      const tmp = d.temp(k); temps.push(tmp);
      try { await A.runQuiet(d.dropTemp(tmp)); } catch {}
      await A.runQuiet(d.createTemp(tmp, `SELECT ${d.rowNumber} AS sw_rid${k}, sw_src.* FROM ${s.sql} sw_src`));
      s.tmp = tmp;
      const probe = await A.query(A.top('*', tmp, 0));
      s.cols = probe.cols.filter(c => c.toLowerCase() !== `sw_rid${k}`);
      s.refSql = s.ref || tmp; s.show = s.refName || (s.subquery ? 'subquery' : s.table);
      s.label = s.subquery ? 'a subquery' : s.table;
    }
    const qcols = k => srcs[k].cols.map(c => `${srcs[k].refSql}.${qi(c)} AS ${qi(multi ? srcs[k].show + '.' + c : c)}`);
    const rid = k => `${srcs[k].refSql}.sw_rid${k} AS sw_rid${k}`;
    const fromSql = upto => srcs.slice(0, upto + 1).map((s, k) => (k ? (s.join === ',' ? ', ' : ` ${s.join} `) : '') + s.tmp + (s.ref ? ' ' + s.ref : '') + (s.on ? ' ON ' + s.on : '') + (s.using ? ' USING ' + s.using : '')).join('');
    const allCols = upto => { const a = []; for (let k = 0; k <= upto; k++) a.push(...qcols(k), rid(k)); return a.join(', '); };
    const last = srcs.length - 1;
    const baseFW = srcs.length ? ` FROM ${fromSql(last)}${W ? ' WHERE ' + W : ''}` : '';
    const ridIdxIn = (cols, k) => colIndex(cols, `sw_rid${k}`);

    // 1. read the tables
    if (srcs.length) {
      for (const s of srcs) s.rows = await A.query(`SELECT * FROM ${s.tmp} ORDER BY 1`, MAXROWS);
      const say = srcs.map(s => `<b>${plural(s.rows.total, 'row')}</b> from <b>${esc(s.label)}</b>${s.alias ? ` (called ${code(s.alias)} in this query)` : ''}`).join(' and ');
      steps.push({
        key: 'from', title: multi ? 'Read the tables' : 'Read the table', clause: 'FROM ' + srcs[0].sql + (srcs[0].alias ? ' ' + srcs[0].alias : ''),
        say: `The database starts with the table${multi ? 's' : ''} in FROM. It reads ${say}.${multi ? ' Each row gets a label (L1, L2… or R1, R2…) so you can follow it through the join.' : ''}`,
        html: `<div class="cols2">${srcs.map((s, k) => `<div class="mini"><h4>${esc(s.label)}${s.alias ? ' as ' + esc(s.alias) : ''}</h4>${renderTable(s.rows.cols, s.rows.rows, multi ? { lead: { head: ['label'], cells: (row, r) => [tag(k === 0 ? 'L' : 'R', r)] } } : {})}</div>`).join('')}</div>`
      });
    }

    // 2. joins, one at a time
    let prev = null;
    for (let j = 1; j < srcs.length; j++) {
      const s = srcs[j];
      const res = await A.query(`SELECT ${allCols(j)} FROM ${fromSql(j)}`);
      const leftKey = row => { const a = []; for (let k = 0; k < j; k++) a.push(row[ridIdxIn(res.cols, k)]); return keyOf(a); };
      if (!prev) {
        const m = new Map(); srcs[0].rows.rows.forEach((row, i) => m.set(keyOf([row[ridIdxIn(srcs[0].rows.cols, 0)]]), i));
        prev = { map: m, count: srcs[0].rows.total };
      }
      const rI = ridIdxIn(s.rows.cols, j);
      const rightMap = new Map(); s.rows.rows.forEach((row, i) => rightMap.set(row[rI], i));
      const usedL = new Set(), usedR = new Set(); let pairs = 0, leftOnly = 0, rightOnly = 0;
      const tags = res.rows.map(row => {
        const lk = leftKey(row);
        const li = JSON.parse(lk).every(v => v === null) ? -1 : (prev.map.has(lk) ? prev.map.get(lk) : -1);
        const rv = row[ridIdxIn(res.cols, j)]; const ri = rv === null ? -1 : (rightMap.has(rv) ? rightMap.get(rv) : -1);
        if (li >= 0) usedL.add(li); if (ri >= 0) usedR.add(ri);
        if (li >= 0 && ri >= 0) pairs++; else if (li >= 0) leftOnly++; else rightOnly++;
        return [li, ri];
      });
      const jt = (s.join || '').toUpperCase();
      const lName = j === 1 ? srcs[0].label : 'the rows joined so far';
      const lostL = prev.count - usedL.size, lostR = s.rows.total - usedR.size;
      let say;
      if (jt === ',' || jt.includes('CROSS')) {
        say = `${jt === ',' ? 'A comma between tables' : 'CROSS JOIN'} pairs <b>every</b> row of ${esc(lName)} with <b>every</b> row of ${esc(s.label)}: ${prev.count} × ${s.rows.total} = <b>${plural(res.total, 'row')}</b>.${W ? ' The WHERE step will then throw away the pairs that do not fit.' : ''}`;
      } else {
        const how = s.on ? `using the rule ${code(s.on)}` : s.using ? `on the shared column${s.using.includes(',') ? 's' : ''} ${code(s.using)}` : 'on columns with the same name';
        say = `Each row of ${esc(lName)} is compared with each row of ${esc(s.label)} ${how}. <b>${plural(pairs, 'pair')}</b> matched.`;
        if (jt.includes('LEFT') || jt.includes('FULL')) say += lostL === 0 ? ' Every left row found a match.' : ` ${jt.includes('FULL') ? 'FULL' : 'LEFT'} JOIN keeps the ${plural(leftOnly, 'left row')} with no match anyway, and fills the ${esc(s.label)} columns with NULL.`;
        else if (!jt.includes('RIGHT')) say += lostL ? ` ${plural(lostL, 'left row')} found no match and ${lostL === 1 ? 'is' : 'are'} dropped, because a plain JOIN only keeps matches.` : ' Every left row found at least one match.';
        if (jt.includes('RIGHT') || jt.includes('FULL')) say += rightOnly ? ` ${plural(rightOnly, 'right row')} with no match ${rightOnly === 1 ? 'is' : 'are'} kept with NULL on the left.` : '';
        else if (lostR) say += ` ${plural(lostR, 'row')} of ${esc(s.label)} never matched anything, so ${lostR === 1 ? 'it does' : 'they do'} not appear.`;
        const multiMatch = [...usedL].filter(li => tags.filter(t => t[0] === li).length > 1).length;
        if (multiMatch) say += ` ${plural(multiMatch, 'left row')} matched more than once, so ${multiMatch === 1 ? 'it appears' : 'they appear'} on several lines.`;
      }
      steps.push({
        key: 'join' + j, title: `Join ${esc(s.label)}`, clause: `${s.join} ${s.sql}${s.alias ? ' ' + s.alias : ''}${s.on ? ' ON ' + s.on : s.using ? ' USING ' + s.using : ''}`, say,
        html: `<div class="cols2"><div class="mini"><h4>Left side: ${esc(lName)}</h4>${j === 1 ? renderTable(srcs[0].rows.cols, srcs[0].rows.rows, { lead: { head: ['label'], cells: (row, r) => [tag('L', r) + (usedL.has(r) ? '' : ' <span class="no">no match</span>')] } }) : `<p class="hint">${plural(prev.count, 'row')} from the previous join.</p>`}</div>
          <div class="mini"><h4>Right side: ${esc(s.label)}</h4>${renderTable(s.rows.cols, s.rows.rows, { lead: { head: ['label'], cells: (row, r) => [tag('R', r) + (usedR.has(r) ? '' : ' <span class="no">not used</span>')] } })}</div></div>
          <div class="mini"><h4>Joined rows (${res.total})</h4>${renderTable(res.cols, res.rows, { lead: { head: ['left', 'right'], cells: (row, r) => [tag('L', tags[r][0]), tag('R', tags[r][1])] }, maxh: 340 })}</div>`
      });
      const m = new Map(); res.rows.forEach((row, i) => { const a = []; for (let k = 0; k <= j; k++) a.push(row[ridIdxIn(res.cols, k)]); m.set(keyOf(a), i); });
      prev = { map: m, count: res.total };
    }

    // 3. WHERE
    if (W && srcs.length) {
      const parts = q.whereParts.length > 1 ? q.whereParts : [];
      const extra = parts.map((p, i) => `${boolExpr(p)} AS sw_c${i}`);
      extra.push(`${boolExpr(W)} AS sw_keep`);
      const res = await A.query(`SELECT ${allCols(last)}, ${extra.join(', ')} FROM ${fromSql(last)}`);
      const keepI = colIndex(res.cols, 'sw_keep');
      const kv = r => asTri(r[keepI]);
      const kept = res.rows.filter(r => kv(r) === 1).length, unk = res.rows.filter(r => kv(r) === null).length;
      const dropped = res.rows.length - kept;
      let say = `Every row is checked against ${code(W)}. <b>${plural(kept, 'row')} pass</b> and move on. <b>${plural(dropped, 'row')}</b> ${dropped === 1 ? 'is' : 'are'} removed.`;
      if (parts.length) say += ` The conditions are joined with AND, so a row must pass <b>all ${parts.length}</b> checks.`;
      if (unk) say += ` ${plural(unk, 'row')} came out UNKNOWN because a value was NULL. WHERE only keeps rows that are definitely true, so ${unk === 1 ? 'it is' : 'they are'} removed too.`;
      const checkCols = parts.map((p, i) => ({ p, i: colIndex(res.cols, 'sw_c' + i) }));
      steps.push({
        key: 'where', title: 'Filter rows (WHERE)', clause: 'WHERE ' + W, say, animate: true,
        html: renderTable(res.cols, res.rows, {
          rowClass: r => kv(res.rows[r]) === 1 ? 'keep' : 'drop',
          trail: {
            head: [...checkCols.map(c => ({ html: esc(c.p) })), { html: parts.length ? 'all pass?' : esc(W) }],
            cells: row => [...checkCols.map(c => ({ cls: 'why', html: tri(asTri(row[c.i])) })), { cls: 'why', html: tri(kv(row)) }]
          }
        })
      });
    }

    // 4. GROUP BY / aggregates
    const grouped = !!q.groupExprs || q.hasAgg;
    if (grouped && srcs.length) {
      const G = q.groupExprs || [];
      const gsel = G.map((g, i) => `${g} AS sw_g${i}`);
      const rowsRes = await A.query(`SELECT ${allCols(last)}${gsel.length ? ', ' + gsel.join(', ') : ''}${baseFW}`);
      const gI = G.map((_, i) => colIndex(rowsRes.cols, 'sw_g' + i));
      const buckets = new Map();
      rowsRes.rows.forEach(row => { const k = keyOf(gI.map(i => row[i])); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(row); });
      const H = q.cl.HAVING ? q.cl.HAVING.text : null;
      const aggRes = await A.query(`SELECT ${[...gsel, q.itemsText, H ? `${boolExpr(H)} AS sw_have` : null].filter(Boolean).join(', ')}${baseFW}${G.length ? ' GROUP BY ' + G.join(', ') : ''}`);
      const outCols = aggRes.cols.map((c, i) => i).filter(i => !isHelperCol(aggRes.cols[i]));
      const haveI = colIndex(aggRes.cols, 'sw_have');
      const have = r => asTri(r[haveI]);
      const aggByKey = new Map(); aggRes.rows.forEach(r => aggByKey.set(keyOf(G.map((_, i) => r[i])), r));
      if (!G.length && !buckets.size) buckets.set(keyOf([]), []);
      const aggNames = (q.items || []).filter(it => containsAgg(it.toks)).map(it => code(it.expr));
      const say = G.length
        ? `GROUP BY ${code(G.join(', '))} sorts the ${plural(rowsRes.total, 'row')} into <b>${plural(buckets.size, 'bucket')}</b>, one for each different value. Each bucket then shrinks to a <b>single row</b>${aggNames.length ? `, and ${aggNames.join(', ')} ${aggNames.length === 1 ? 'is' : 'are'} worked out from the rows inside it` : ''}.`
        : `There is no GROUP BY, but ${aggNames.join(', ') || 'an aggregate'} ${aggNames.length === 1 ? 'is' : 'are'} used, so all ${plural(rowsRes.total, 'row')} go into <b>one bucket</b> and come out as <b>one row</b>.`;
      let i = 0;
      const cards = [...buckets.entries()].map(([k, rows]) => {
        const vals = JSON.parse(k), agg = aggByKey.get(k);
        const out = H && agg && have(agg) !== 1;
        const name = G.length ? G.map((g, gi) => `${esc(g)} = ${fmt(vals[gi])}`).join(', ') : 'all rows';
        const color = i++ % 8;
        return `<div class="bucket${out ? ' out' : ''}"><div class="bucket-head" style="background:var(--t${color})"><b>${name}</b><span>${plural(rows.length, 'row')}</span></div>
          ${renderTable(rowsRes.cols, rows, { max: 20, maxh: 180 })}
          <div class="bucket-foot"><span class="arrow">becomes one row ↓</span>${agg ? renderTable(outCols.map(i => aggRes.cols[i]), [outCols.map(i => agg[i])], { index: false }) : ''}${out ? `<span class="no">Removed later by HAVING</span>` : ''}</div></div>`;
      }).join('');
      steps.push({ key: 'group', title: G.length ? 'Make groups (GROUP BY)' : 'Summarise all rows', clause: G.length ? 'GROUP BY ' + G.join(', ') : (q.items || []).filter(it => containsAgg(it.toks)).map(it => it.expr).join(', '), say, html: `<div class="buckets">${cards}</div>` });

      if (H) {
        const kept = aggRes.rows.filter(r => have(r) === 1).length;
        steps.push({
          key: 'having', title: 'Filter groups (HAVING)', clause: 'HAVING ' + H, animate: true,
          say: `HAVING is like WHERE, but it checks whole groups after they are counted. ${code(H)} keeps <b>${plural(kept, 'group')}</b> and removes ${plural(aggRes.rows.length - kept, 'group')}.`,
          html: renderTable(aggRes.cols, aggRes.rows, { rowClass: r => have(aggRes.rows[r]) === 1 ? 'keep' : 'drop', trail: { head: [{ html: esc(H) }], cells: row => [{ cls: 'why', html: tri(have(row)) }] } })
        });
      }
    }

    // 5. window functions: one stage each, before SELECT picks the columns
    if (q.window && !grouped && srcs.length) {
      for (const it of (q.items || []).filter(it => it.toks.some(t => t.k === 'word' && t.u === 'OVER'))) {
        const st = await windowStep(it, { text: q.text, allCols: allCols(last), from: fromSql(last), where: W });
        if (st) steps.push(st);
      }
    }

    // 6. SELECT columns (when not grouped)
    if (!grouped) {
      const projSql = srcs.length ? `SELECT ${q.distinct ? 'DISTINCT ' : ''}${q.itemsText}${baseFW}` : d.scalar(q.itemsText);
      const res = await A.query(projSql, MAXROWS);
      const items = q.items || [];
      const picked = items.filter(it => it.plain || it.star || it.qualStar).map(it => code(it.star ? '*' : it.expr));
      const made = items.filter(it => !(it.plain || it.star || it.qualStar));
      let say = srcs.length ? `Now SELECT decides which columns to keep. ` : `There is no table here, so SELECT just works out each value. `;
      if (items.some(it => it.star)) say += `${code('*')} means keep every column. `;
      else if (picked.length) say += `It keeps ${picked.join(', ')}. `;
      if (made.length) say += `It also builds ${plural(made.length, 'new column')}: ${made.map(it => `${code(it.label)} from ${code(it.expr)}`).join(', ')}. `;
      const renamed = items.filter(it => it.plain && it.alias);
      if (renamed.length) say += `It renames ${renamed.map(it => `${code(it.expr)} to ${code(it.alias)}`).join(', ')}. `;
      if (q.distinct) {
        const all = await A.count(`(SELECT ${q.itemsText}${baseFW}) sw_c`);
        say += `DISTINCT then removes repeated rows: ${all} rows become <b>${res.total}</b>. `;
      }
      if (srcs.length) say += `Everything else is left behind.`;
      const head = i => { const it = items[i] && !items.some(x => x.star || x.qualStar) ? items[i] : null; return it && !it.plain ? `<span class="colhead"><span>${esc(res.cols[i])}</span><span class="coltype">= ${esc(it.expr)}</span></span>` : esc(res.cols[i]); };
      steps.push({ key: 'select', title: 'Choose columns (SELECT)', clause: 'SELECT ' + (q.distinct ? 'DISTINCT ' : '') + q.itemsText, say, html: renderTable(res.cols, res.rows, { head }) });
    }

    // 7. ORDER BY
    const textNoLimit = q.cl.LIMIT ? q.text.slice(0, q.cl.LIMIT.kwStart) : q.text;
    if (q.cl['ORDER BY'] && !q.top) {
      const before = await A.query(q.text.slice(0, q.cl['ORDER BY'].kwStart));
      const after = await A.query(textNoLimit);
      const pool = new Map(); before.rows.forEach((r, i) => { const k = keyOf(r); if (!pool.has(k)) pool.set(k, []); pool.get(k).push(i); });
      const from = after.rows.map(r => { const l = pool.get(keyOf(r)); return l && l.length ? l.shift() : -1; });
      const norm = s => s.replace(/["`\[\]\s]/g, '').toLowerCase();
      const sortCols = new Map();
      q.orderTerms.forEach(t => {
        let ci = after.cols.findIndex(c => norm(c) === norm(t.expr));
        if (ci < 0) ci = after.cols.findIndex(c => norm(c) === norm(t.expr).split('.').pop());
        if (ci < 0 && /^\d+$/.test(t.expr.trim())) ci = +t.expr.trim() - 1;
        if (ci >= 0 && !sortCols.has(ci)) sortCols.set(ci, { dir: t.dir });
      });
      const words = q.orderTerms.map((t, n) => `${n ? 'then by ' : ''}${code(t.expr)} ${t.dir === 'desc' ? '(largest first)' : '(smallest first)'}`).join(', ');
      const moved = from.filter((f, i) => f !== i).length;
      steps.push({
        key: 'order', title: 'Sort rows (ORDER BY)', clause: 'ORDER BY ' + q.cl['ORDER BY'].text, flip: true,
        say: `The rows are sorted by ${words}. ${moved ? `${plural(moved, 'row')} changed position. The "moved" column shows where each row came from.` : 'They were already in this order.'}${q.orderTerms.length > 1 ? ' The second rule only matters when the first one is tied.' : ''}`,
        html: renderTable(after.cols, after.rows, {
          head: i => sortCols.has(i) ? `${esc(after.cols[i])} ${sortCols.get(i).dir === 'desc' ? '↓' : '↑'}` : esc(after.cols[i]),
          colClass: i => sortCols.has(i) ? 'sel' : '', cellClass: (r, i) => sortCols.has(i) ? 'sel' : '',
          rowAttr: r => `data-from="${from[r]}"`,
          trail: { head: [{ html: 'moved' }], cells: (row, r) => [{ cls: 'moved', html: from[r] < 0 ? '' : from[r] === r ? 'same' : `#${from[r] + 1} → #${r + 1}` }] }
        })
      });
    }

    // 8. LIMIT / OFFSET
    if (q.cl.LIMIT) {
      const all = await A.query(textNoLimit);
      let lim, off = 0;
      const lt = q.cl.LIMIT.toks; const comma = lt.findIndex(t => t.k === ',' && t.d === lt[0].d);
      if (comma >= 0) { off = Number(await A.scalar(textOf(q.text, lt.slice(0, comma)))); lim = Number(await A.scalar(textOf(q.text, lt.slice(comma + 1)))); }
      else { lim = Number(await A.scalar(q.cl.LIMIT.text)); if (q.cl.OFFSET) off = Number(await A.scalar(q.cl.OFFSET.text)); }
      const end = lim < 0 ? Infinity : off + lim;
      const keptN = Math.max(0, Math.min(all.rows.length, end) - Math.min(off, all.rows.length));
      const cut = all.rows.length - keptN;
      steps.push({
        key: 'limit', title: off ? 'Skip and keep (LIMIT / OFFSET)' : 'Keep the first rows (LIMIT)', clause: 'LIMIT ' + q.cl.LIMIT.text + (q.cl.OFFSET ? ' OFFSET ' + q.cl.OFFSET.text : ''), animate: true,
        say: `${off ? `OFFSET skips the first <b>${off}</b> rows. ` : ''}LIMIT keeps <b>${lim < 0 ? 'all remaining' : 'at most ' + lim}</b> row${lim === 1 ? '' : 's'}${off ? '' : ' from the top'}. ${plural(cut, 'row')} ${cut === 1 ? 'is' : 'are'} cut off.`,
        html: renderTable(all.cols, all.rows, { rowClass: r => r >= off && r < end ? 'keep' : 'drop' })
      });
    }
  } finally {
    for (const t of temps) { try { await A.runQuiet(d.dropTemp(t)); } catch {} }
  }
  steps.push({ key: 'result', title: 'Result', clause: '', say: `The finished result has <b>${plural(finalRes.total, 'row')}</b> and <b>${plural(finalRes.cols.length, 'column')}</b>. It is also shown in the Result tab.`, html: renderTable(finalRes.cols, finalRes.rows) });
  return steps;
}

/* ============================== Steps for WITH ============================== */
// WITH a AS (...), b AS (...) SELECT ...: one stage per named query, then the main query as usual,
// reading each named query from a temporary copy of its rows.
function parseWith(text) {
  const T = setDepth(tokenize(text, false));
  if (!T.length || T[0].u !== 'WITH') return null;
  let i = 1; const recursive = T[i] && T[i].u === 'RECURSIVE'; if (recursive) i++;
  const ctes = [];
  while (i < T.length) {
    if (!isName(T[i])) return null;
    const name = nameVal(T[i]), raw = text.slice(T[i].s, T[i].e); i++;
    let cols = '';
    if (T[i] && T[i].k === '(') { const d = T[i].d, s = T[i].s; while (i < T.length && !(T[i].k === ')' && T[i].d === d)) i++; cols = text.slice(s, T[i] ? T[i].e : text.length); i++; }
    if (!T[i] || T[i].u !== 'AS') return null; i++;
    if (T[i] && T[i].u === 'NOT') i++;
    if (T[i] && T[i].u === 'MATERIALIZED') i++;
    if (!T[i] || T[i].k !== '(') return null;
    const d = T[i].d, open = T[i]; i++;
    while (i < T.length && !(T[i].k === ')' && T[i].d === d)) i++;
    if (i >= T.length) return null;
    ctes.push({ name, raw, cols, body: text.slice(open.e, T[i].s).trim(), end: T[i].e });
    i++;
    if (T[i] && T[i].k === ',') { i++; continue; }
    break;
  }
  if (!T[i]) return null;
  return { recursive, ctes, main: text.slice(T[i].s), withStart: T[0].s };
}
const NOT_ALIAS = new Set(['WHERE', 'JOIN', 'ON', 'USING', 'LEFT', 'RIGHT', 'INNER', 'FULL', 'CROSS', 'NATURAL', 'OUTER', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'WINDOW', 'FETCH', 'SELECT', 'FROM']);
// put temporary table names in place of the WITH names, wherever a table is read
function swapSources(text, map) {
  const T = setDepth(tokenize(text, false));
  const clause = [];
  let out = '', p = 0;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.k === 'word' && ['SELECT', 'FROM', 'WHERE', 'GROUP', 'ORDER', 'HAVING', 'LIMIT', 'UNION', 'INTERSECT', 'EXCEPT', 'JOIN'].includes(t.u)) clause[t.d] = t.u === 'JOIN' ? 'FROM' : t.u;
    if (!isName(t) || !map.has(nameVal(t).toLowerCase()) || isDot(T[i + 1]) || isDot(T[i - 1])) continue;
    const prev = T[i - 1];
    const src = prev && ((prev.k === 'word' && (prev.u === 'FROM' || prev.u === 'JOIN')) || (prev.k === ',' && clause[t.d] === 'FROM'));
    if (!src) continue;
    const nx = T[i + 1];
    const hasAlias = nx && isName(nx) && (nx.u === 'AS' || !(nx.k === 'word' && NOT_ALIAS.has(nx.u)));
    const tmp = map.get(nameVal(t).toLowerCase());
    out += text.slice(p, t.s) + (hasAlias ? tmp : `${tmp} ${text.slice(t.s, t.e)}`);
    p = t.e;
  }
  return out + text.slice(p);
}
async function withSteps(text, finalRes) {
  const w = parseWith(text);
  if (!w) return null;
  const d = A.d, steps = [], temps = [], map = new Map();
  try {
    for (let k = 0; k < w.ctes.length; k++) {
      const c = w.ctes[k], tmp = d.temp('w' + k);
      try { await A.runQuiet(d.dropTemp(tmp)); } catch {}
      const prefix = text.slice(w.withStart, c.end);
      await A.runQuiet(d.createTempWith ? d.createTempWith(tmp, prefix, c.raw) : d.createTemp(tmp, `${prefix} SELECT * FROM ${c.raw}`));
      temps.push(tmp); map.set(c.name.toLowerCase(), tmp);
      const rows = await A.query(`SELECT * FROM ${tmp}`, MAXROWS);
      const selfRef = new RegExp(`\\b${c.name.replace(/[^A-Za-z0-9_]/g, '')}\\b`, 'i').test(c.body);
      const uses = w.ctes.slice(0, k).filter(o => new RegExp(`\\b${o.name.replace(/[^A-Za-z0-9_]/g, '')}\\b`, 'i').test(c.body)).map(o => code(o.name));
      let say = `WITH gives a name to a query, so the rest of the statement can read it like a table. <b>${esc(c.name)}</b> has <b>${plural(rows.total, 'row')}</b>. It only exists while this statement runs.`;
      if (uses.length) say += ` It reads from ${uses.join(' and ')}, made in the stage before.`;
      if (w.recursive && selfRef) say += ` It is RECURSIVE: the part before UNION makes the first rows, then the part after UNION runs again and again on the rows it just made, until no new rows appear.`;
      steps.push({ key: 'with' + k, title: `Make ${esc(c.name)} (WITH)`, clause: `${c.name}${c.cols ? ' ' + c.cols : ''} AS (${c.body})`, say, html: renderTable(rows.cols, rows.rows) });
    }
    const main = swapSources(w.main, map);
    const inner = splitCompound(main).parts.length > 1 ? await compoundSteps(main, finalRes) : await selectSteps(parseQuery(main), finalRes);
    const back = s => {
      let v = String(s ?? '');
      for (const c of w.ctes) {
        const tmp = map.get(c.name.toLowerCase()), n = esc(c.name);
        v = v.split(`${tmp} ${c.raw}`).join(c.raw).split(tmp).join(c.name);
        v = v.split(`<b>${n}</b> (called <code>${n}</code> in this query)`).join(`<b>${n}</b>`).split(`${n} as ${n}</h4>`).join(`${n}</h4>`);
      }
      return v;
    };
    for (const s of inner) { s.title = back(s.title); s.clause = back(s.clause); s.say = back(s.say); s.html = back(s.html); }
    if (inner[0] && inner[0].key === 'from') inner[0].say += ` Here the database reads ${plural(w.ctes.length, 'named query', 'named queries')} from the stages before, just like tables.`;
    return [...steps, ...inner];
  } finally {
    for (const t of temps) { try { await A.runQuiet(d.dropTemp(t)); } catch {} }
  }
}

/* ============================== Steps for UNION, INTERSECT and EXCEPT ============================== */
function splitCompound(text) {
  const T = setDepth(tokenize(text, false));
  const parts = [], ops = []; let start = 0;
  for (let i = 0; i < T.length; i++) {
    const t = T[i];
    if (t.d !== 0 || t.k !== 'word' || !['UNION', 'INTERSECT', 'EXCEPT', 'MINUS'].includes(t.u)) continue;
    let op = t.u === 'MINUS' ? 'EXCEPT' : t.u, end = t.e;
    if (T[i + 1] && T[i + 1].k === 'word' && (T[i + 1].u === 'ALL' || T[i + 1].u === 'DISTINCT')) { if (T[i + 1].u === 'ALL') op += ' ALL'; end = T[i + 1].e; i++; }
    parts.push(text.slice(start, t.s).trim()); ops.push(op); start = end;
  }
  let last = text.slice(start).trim(), tail = '';
  if (parts.length) {
    const L = setDepth(tokenize(last, false));
    const cut = L.find((t, i) => t.d === 0 && t.k === 'word' && ((t.u === 'ORDER' && L[i + 1]?.u === 'BY') || t.u === 'LIMIT' || t.u === 'OFFSET' || t.u === 'FETCH'));
    if (cut) { tail = last.slice(cut.s).trim(); last = last.slice(0, cut.s).trim(); }
  }
  parts.push(last);
  const unwrap = s => { const P = setDepth(tokenize(s, false)); return P.length > 1 && P[0].k === '(' && P[P.length - 1].k === ')' && P.slice(1, -1).every(t => t.d > 0) ? s.slice(P[0].e, P[P.length - 1].s).trim() : s; };
  return { parts: parts.map(unwrap), ops, tail };
}
async function compoundSteps(text, finalRes) {
  const { parts, ops, tail } = splitCompound(text);
  const steps = [];
  const res = [];
  for (let k = 0; k < parts.length; k++) {
    const r = await A.query(parts[k], 5000);
    res.push(r);
    steps.push({
      key: 'part' + k, title: `Run part ${k + 1}`, clause: parts[k],
      say: `Part ${k + 1} is a complete SELECT on its own. It gives <b>${plural(r.total, 'row')}</b>.${k === 0 ? ' Its column names are the ones the combined result will use.' : ` It must have the same number of columns as part 1 (${res[0].cols.length}).`}`,
      html: renderTable(r.cols, r.rows)
    });
  }
  const cols = res[0].cols;
  const label = k => `<span class="tag" style="background:var(--t${(k + 1) % 8})">part ${k + 1}</span>`;
  let acc = res[0].rows.map(row => ({ row, k: 0 }));
  for (let j = 0; j < ops.length; j++) {
    const op = ops[j], right = res[j + 1].rows.map(row => ({ row, k: j + 1 }));
    const rightKeys = new Set(right.map(x => keyOf(x.row)));
    let list, keep, why, say;
    const before = acc.length;
    if (op === 'UNION ALL') {
      list = [...acc, ...right]; keep = list.map(() => 1); why = list.map(() => 'kept');
      say = `UNION ALL puts the ${plural(right.length, 'row')} of part ${j + 2} under the ${plural(before, 'row')} so far. Nothing is removed, so there are <b>${plural(list.length, 'row')}</b>.`;
    } else if (op === 'UNION') {
      list = [...acc, ...right]; const seen = new Set();
      keep = list.map(x => { const k = keyOf(x.row); if (seen.has(k)) return 0; seen.add(k); return 1; });
      why = keep.map(v => v ? 'kept' : 'already there');
      const n = keep.filter(Boolean).length;
      say = `UNION puts the ${plural(right.length, 'row')} of part ${j + 2} under the ${plural(before, 'row')} so far, then removes any row that is an exact copy of one above it. <b>${plural(list.length - n, 'repeated row')}</b> ${list.length - n === 1 ? 'is' : 'are'} removed, leaving <b>${plural(n, 'row')}</b>. Use UNION ALL to keep repeats.`;
    } else {
      const seen = new Set();
      list = acc.filter(x => { const k = keyOf(x.row); if (seen.has(k)) return false; seen.add(k); return true; });
      const inter = op.startsWith('INTERSECT');
      keep = list.map(x => (rightKeys.has(keyOf(x.row)) === inter) ? 1 : 0);
      why = list.map(x => rightKeys.has(keyOf(x.row)) ? `also in part ${j + 2}` : `not in part ${j + 2}`);
      const n = keep.filter(Boolean).length;
      say = inter
        ? `INTERSECT keeps only the rows that appear in <b>both</b>: the rows so far and part ${j + 2}. <b>${plural(n, 'row')}</b> ${n === 1 ? 'is' : 'are'} in both.`
        : `EXCEPT starts with the rows so far and removes every row that also appears in part ${j + 2}. <b>${plural(list.length - n, 'row')}</b> ${list.length - n === 1 ? 'is' : 'are'} taken away, leaving <b>${plural(n, 'row')}</b>.`;
      if (list.length < before) say += ` Repeated rows are counted once.`;
    }
    steps.push({
      key: 'set' + j, title: `Combine with ${op}`, clause: op, say, animate: true,
      html: renderTable(cols, list.map(x => x.row), {
        lead: { head: ['from'], cells: (row, r) => [label(list[r].k)] },
        rowClass: r => keep[r] ? 'keep' : 'drop',
        trail: { head: [{ html: 'why' }], cells: (row, r) => [{ cls: 'why', html: keep[r] ? `<span class="yes">✓ ${why[r]}</span>` : `<span class="no">✗ ${why[r]}</span>` }] }
      })
    });
    acc = list.filter((_, r) => keep[r]);
  }
  if (ops.some(o => o.startsWith('INTERSECT')) && ops.some(o => !o.startsWith('INTERSECT'))) {
    steps[steps.length - 1].say += ' These stages combine from left to right. Some databases do INTERSECT before UNION or EXCEPT; the Result tab always shows what your database returned.';
  }
  if (tail) {
    steps.push({ key: 'tail', title: 'Sort or trim the combined rows', clause: tail, say: `${code(tail)} comes after the last part, so it applies to the <b>whole</b> combined result, not just part ${parts.length}.`, html: renderTable(finalRes.cols, finalRes.rows) });
  }
  steps.push({ key: 'result', title: 'Result', clause: '', say: `The finished result has <b>${plural(finalRes.total, 'row')}</b> and <b>${plural(finalRes.cols.length, 'column')}</b>. It is also shown in the Result tab.`, html: renderTable(finalRes.cols, finalRes.rows) });
  return steps;
}

/* ============================== Window functions ============================== */
function parseOver(toks, text) {
  const o = toks.findIndex(t => t.k === 'word' && t.u === 'OVER');
  if (o < 0) return null;
  const fn = textOf(text, toks.slice(0, o));
  const p = toks[o + 1];
  if (!p || p.k !== '(') return { fn, named: true };
  let e = o + 2; while (e < toks.length && !(toks[e].k === ')' && toks[e].d === p.d)) e++;
  const inside = toks.slice(o + 2, e);
  const base = inside[0]?.d;
  const marks = [];
  inside.forEach((t, i) => {
    if (t.d !== base || t.k !== 'word') return;
    if ((t.u === 'PARTITION' || t.u === 'ORDER') && inside[i + 1]?.u === 'BY') marks.push({ u: t.u, i, b: i + 2 });
    if (t.u === 'ROWS' || t.u === 'RANGE' || t.u === 'GROUPS') marks.push({ u: 'FRAME', i, b: i });
  });
  const part = {};
  marks.forEach((m, j) => { part[m.u] = inside.slice(m.b, j + 1 < marks.length ? marks[j + 1].i : inside.length); });
  const named = inside.length && !marks.length;
  const split = ts => ts ? splitTop(ts, t => t.k === ',').map(x => textOf(text, x)) : [];
  return { fn, fnName: (toks[0]?.u || '').toUpperCase(), named, partition: split(part.PARTITION), order: part.ORDER ? textOf(text, part.ORDER) : '', frame: part.FRAME ? textOf(text, part.FRAME) : '' };
}
function windowSay(w) {
  const f = w.fnName;
  const by = w.order ? ` in the order ${code(w.order)}` : '';
  let what;
  if (f === 'ROW_NUMBER') what = `numbers the rows 1, 2, 3 and so on${by}, starting again at 1 in each partition`;
  else if (f === 'RANK') what = `gives each row its place${by}. Rows that tie share a place, and the next place is skipped (1, 2, 2, 4)`;
  else if (f === 'DENSE_RANK') what = `gives each row its place${by}. Rows that tie share a place, and no place is skipped (1, 2, 2, 3)`;
  else if (f === 'NTILE') what = `splits each partition${by} into nearly equal groups and gives each row its group number`;
  else if (f === 'LAG') what = `copies a value from the row <b>before</b> this one${by}. The first row of each partition has no row before it, so it gets NULL`;
  else if (f === 'LEAD') what = `copies a value from the row <b>after</b> this one${by}. The last row of each partition gets NULL`;
  else if (f === 'FIRST_VALUE') what = `copies the value from the first row of the partition${by}`;
  else if (f === 'LAST_VALUE') what = `copies the value from the last row seen so far${by}`;
  else if (['SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'TOTAL'].includes(f)) what = w.order
    ? `is a running ${f === 'SUM' || f === 'TOTAL' ? 'total' : f === 'AVG' ? 'average' : f === 'COUNT' ? 'count' : f === 'MIN' ? 'minimum' : 'maximum'}: each row uses the rows from the start of its partition up to itself${by}`
    : `uses every row in the partition, so all rows in a partition get the same ${f === 'SUM' || f === 'TOTAL' ? 'total' : 'value'}`;
  else what = `works out a value for each row from the rows in its partition${by}`;
  return what;
}
async function windowStep(it, ctx) {
  const w = parseOver(it.toks, ctx.text);
  if (!w || w.named) return null;
  const psel = w.partition.map((p, i) => `${p} AS sw_p${i}`);
  const order = [...w.partition, ...(w.order ? [w.order] : [])].join(', ');
  const res = await A.query(`SELECT ${ctx.allCols}${psel.length ? ', ' + psel.join(', ') : ''}, ${it.expr} AS sw_wv FROM ${ctx.from}${ctx.where ? ' WHERE ' + ctx.where : ''}${order ? ' ORDER BY ' + order : ''}`, 5000);
  const pI = w.partition.map((_, i) => colIndex(res.cols, 'sw_p' + i)), vI = colIndex(res.cols, 'sw_wv');
  const buckets = new Map();
  res.rows.forEach(row => { const k = keyOf(pI.map(i => row[i])); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(row); });
  const label = it.alias || it.expr;
  let say = `${code(it.expr)} is a window function. It works like GROUP BY without squashing the rows: <b>every row stays</b>, and gets a new value worked out from the rows around it. `;
  say += w.partition.length ? `PARTITION BY ${code(w.partition.join(', '))} splits the rows into <b>${plural(buckets.size, 'partition')}</b>. ` : `There is no PARTITION BY, so all ${plural(res.total, 'row')} form one partition. `;
  say += `Then ${code(w.fn)} ${windowSay(w)}.`;
  if (w.frame) say += ` The frame ${code(w.frame)} says exactly which rows around each row are used.`;
  let i = 0;
  const trail = { head: [{ cls: 'plan', html: `<span class="colhead"><span>${esc(label)}</span><span class="coltype">new column</span></span>` }], cells: row => [{ cls: 'plan', html: fmt(row[vI]) }] };
  const html = `<div class="buckets wide">${[...buckets.entries()].map(([k, rows]) => {
    const vals = JSON.parse(k);
    const name = w.partition.length ? w.partition.map((g, gi) => `${esc(g)} = ${fmt(vals[gi])}`).join(', ') : 'all rows';
    return `<div class="bucket"><div class="bucket-head" style="background:var(--t${i++ % 8})"><b>${name}</b><span>${plural(rows.length, 'row')}</span></div>${renderTable(res.cols, rows, { trail, maxh: 260 })}</div>`;
  }).join('')}</div>`;
  return { key: 'window', title: `Window: ${esc(label)}`, clause: it.expr, say, html };
}

/* ============================== Steps for INSERT / UPDATE / DELETE and others ============================== */
async function changeSteps(q, stmtText) {
  const steps = [];
  const t = q.target ? await A.findTable(q.target) : null;
  if (!t) {
    const before = [...await A.tables()];
    const n = await A.run(stmtText);
    const after = await A.tables();
    const added = after.filter(x => !before.includes(x)), gone = before.filter(x => !after.includes(x));
    let say = 'The statement ran.';
    const isView = /^\s*create\s+(or\s+replace\s+)?(temp\w*\s+)?view\b/i.test(stmtText.replace(/--[^\n]*\n/g, ''));
    if (added.length) say += ` New ${isView ? 'view' : 'table'}${added.length > 1 ? 's' : ''}: ${added.map(code).join(', ')}.${isView ? ' A view is a saved query. Use it in FROM like a table, and it runs again each time.' : ''}`;
    if (gone.length) say += ` Removed: ${gone.map(code).join(', ')}.`;
    if (n) say += ` ${plural(n, 'row')} changed.`;
    let html = '';
    for (const x of added) html += `<div class="mini"><h4>${esc(x)}</h4>${renderTable(['column', 'type'], (await A.tableInfo(x)).map(c => [c.name, c.type]), { index: false })}</div>`;
    steps.push({ key: 'done', title: 'Done', clause: '', say, html });
    return { steps, result: { msg: say } };
  }
  const before = await A.snapshot(t);
  const W = q.cl.WHERE ? q.cl.WHERE.text : null;
  const from = `${A.qi(t)}${q.targetAliasSql ? ' ' + q.targetAliasSql : ''}`;
  let hits = null;
  if (q.kind === 'UPDATE' || q.kind === 'DELETE') {
    hits = W ? (await A.query(`SELECT ${boolExpr(W)} AS sw_hit FROM ${from}${before.order}`)).rows.map(r => asTri(r[0])) : before.rows.map(() => 1);
  }
  steps.push({ key: 'read', title: `Open ${esc(t)}`, clause: `${q.kind} ${q.targetSql}`, say: `This statement changes the table <b>${esc(t)}</b>, which has ${plural(before.total, 'row')} right now.`, html: renderTable(before.cols, before.rows) });
  if (hits) {
    const k = hits.filter(v => v === 1).length, unk = hits.filter(v => v === null).length;
    steps.push({
      key: 'where', title: 'Find the rows (WHERE)', clause: W ? 'WHERE ' + W : '(no WHERE)', animate: true,
      say: W ? `Each row is checked against ${code(W)}. <b>${plural(k, 'row')}</b> will be ${q.kind === 'DELETE' ? 'deleted' : 'changed'}. The others are left alone.${unk ? ` ${plural(unk, 'row')} came out UNKNOWN because of NULL, so ${unk === 1 ? 'it is' : 'they are'} not touched.` : ''}` : `There is no WHERE, so <b>every row</b> (${before.total}) will be ${q.kind === 'DELETE' ? 'deleted' : 'changed'}.`,
      html: renderTable(before.cols, before.rows, { rowClass: r => hits[r] === 1 ? 'keep' : 'drop', trail: { head: [{ html: W ? esc(W) : 'affected' }], cells: (row, r) => [{ cls: 'why', html: tri(hits[r]) }] } })
    });
  }
  const t0 = performance.now();
  const n = await A.run(stmtText);
  const ms = performance.now() - t0;
  const after = await A.snapshot(t);
  let say, html;
  if (!before.keyed) {
    say = `${plural(n, 'row')} ${n === 1 ? 'was' : 'were'} affected. This table has no primary key, so the app cannot tell exactly which rows changed. Here is the table now.`;
    html = renderTable(after.cols, after.rows);
  } else {
    const bMap = new Map(); before.rows.forEach((r, i) => bMap.set(before.keyOf(r, i), r));
    const aKeys = new Set(after.rows.map((r, i) => after.keyOf(r, i)));
    if (q.kind === 'DELETE') {
      const removed = before.rows.filter((r, i) => !aKeys.has(before.keyOf(r, i)));
      say = `<b>${plural(removed.length, 'row')}</b> ${removed.length === 1 ? 'was' : 'were'} deleted. ${esc(t)} now has ${plural(after.total, 'row')}.`;
      html = renderTable(before.cols, before.rows, { rowClass: r => aKeys.has(before.keyOf(before.rows[r], r)) ? '' : 'del' });
    } else {
      const changedCells = new Set(); let changedRows = 0, added = 0;
      after.rows.forEach((r, ri) => {
        const b = bMap.get(after.keyOf(r, ri));
        if (!b) { added++; return; }
        let ch = false; r.forEach((v, ci) => { if (!isHelperCol(after.cols[ci]) && keyOf([v]) !== keyOf([b[ci]])) { changedCells.add(ri + ':' + ci); ch = true; } }); if (ch) changedRows++;
      });
      if (q.kind === 'UPDATE') say = `${q.sets ? `SET ${q.sets.map(s => `${code(s.colName)} = ${code(s.expr)}`).join(', ')} was applied. ` : ''}<b>${plural(changedRows, 'row')}</b> now ${changedRows === 1 ? 'has' : 'have'} new values (highlighted).${n !== changedRows ? ` (${n} rows were written; some ended up with the same value.)` : ''}`;
      else say = `<b>${plural(added, 'new row')}</b> ${added === 1 ? 'was' : 'were'} added (highlighted). ${esc(t)} now has ${plural(after.total, 'row')}.`;
      html = renderTable(after.cols, after.rows, { rowClass: r => bMap.has(after.keyOf(after.rows[r], r)) ? '' : 'add', cellClass: (r, c) => changedCells.has(r + ':' + c) ? 'chg' : '' });
    }
  }
  steps.push({ key: 'apply', title: q.kind === 'DELETE' ? 'Delete them' : q.kind === 'UPDATE' ? 'Change the values (SET)' : 'Add the rows', clause: q.kind === 'UPDATE' && q.cl.SET ? 'SET ' + q.cl.SET.text : '', say, html });
  return { steps, result: { msg: `${q.kind} finished: ${plural(n, 'row')} affected in ${esc(t)}.`, table: after, tableName: t, ms } };
}

/* ============================== Run ============================== */
const genericSteps = r => [{ key: 'result', title: 'Result', clause: '', say: 'The app could not split this statement into stages. Here is the result.', html: renderTable(r.cols, r.rows) }];
const READ_KINDS = new Set(['SELECT', 'WITH', 'VALUES', 'PRAGMA', 'EXPLAIN', 'SHOW', 'DESCRIBE', 'DESC', 'TABLE']);
let steps = [], stepIdx = 0, playTimer = null, running = false;
async function runCurrent() {
  if (!A || running) return;
  stopPlay();
  const ta = $('#sql');
  const stmt = statementAt(ta.value, ta.selectionStart);
  const out = $('#outResult');
  if (!stmt) { out.innerHTML = '<p class="empty">Nothing to run yet. Type a query in the box above.</p>'; return; }
  const text = stmt.text.trim();
  const q = parseQuery(text);
  running = true; $('#runBtn').classList.add('busy'); $('#runInfo').textContent = 'Running…';
  try {
    if (READ_KINDS.has(q.kind)) {
      const t0 = performance.now();
      const finalRes = await A.query(text, 1000);
      const ms = performance.now() - t0;
      try { steps = q.kind === 'WITH' ? (await withSteps(text, finalRes)) || genericSteps(finalRes) : q.kind === 'SELECT' && splitCompound(text).parts.length > 1 ? await compoundSteps(text, finalRes) : q.kind === 'SELECT' ? await selectSteps(q, finalRes) : [{ key: 'result', title: 'Result', clause: '', say: 'Steps are drawn for SELECT, INSERT, UPDATE and DELETE. Here is the result.', html: renderTable(finalRes.cols, finalRes.rows) }]; }
      catch (e) { steps = [{ key: 'result', title: 'Result', clause: '', say: `The query ran, but this early version could not break it into steps (${esc(e.message)}).`, html: renderTable(finalRes.cols, finalRes.rows) }]; }
      setExportable(finalRes.cols.length ? { sql: text, name: (q.from && q.from[0] && q.from[0].table) || 'result' } : null);
      addHistory({ sql: text, at: Date.now(), db: A.label, ok: true, out: plural(finalRes.total, 'row'), ms });
      out.innerHTML = `<div class="result-meta"><strong>${plural(finalRes.total, 'row')}</strong><span>${plural(finalRes.cols.length, 'column')}</span><span>${ms.toFixed(1)} ms</span>${finalRes.total > MAXROWS ? `<span>showing the first ${MAXROWS}</span>` : ''}</div>` + (finalRes.cols.length ? renderTable(finalRes.cols, finalRes.rows) : '');
    } else {
      const r = await changeSteps(q, text);
      steps = r.steps;
      schemaCache = null;
      setExportable(r.result.table ? { sql: `SELECT * FROM ${A.qi(r.result.tableName)}`, name: r.result.tableName } : null);
      addHistory({ sql: text, at: Date.now(), db: A.label, ok: true, out: r.result.msg.replace(/<[^>]+>/g, ''), ms: r.result.ms });
      out.innerHTML = `<div class="result-meta"><strong>${r.result.msg}</strong>${r.result.ms !== undefined ? `<span>${r.result.ms.toFixed(1)} ms</span>` : ''}</div>` + (r.result.table ? `<p class="hint" style="padding:0 12px 8px">${esc(r.result.tableName)} after the change:</p>` + renderTable(r.result.table.cols, r.result.table.rows) : '');
    }
    $('#runInfo').textContent = `Ran statement ${stmt.index + 1} at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch (e) {
    steps = [];
    setExportable(null);
    addHistory({ sql: text, at: Date.now(), db: A.label, ok: false, out: e.message });
    out.innerHTML = `<div class="err"><b>The database could not run this.</b><br>${await friendlyError(e.message)}<br><code>${esc(e.message)}</code></div>`;
    $('#runInfo').textContent = '';
  } finally {
    running = false; $('#runBtn').classList.remove('busy');
  }
  stepIdx = 0;
  renderSteps();
  showOut('result');
  scheduleLive(0);
}
async function friendlyError(m) {
  if (/no such table|does not exist|doesn't exist|invalid object name|table or view does not exist/i.test(m) && /table|relation|object/i.test(m)) {
    let list = ''; try { list = (await A.tables()).map(code).join(', '); } catch {}
    return `A table name is not recognised.${list ? ` The tables are: ${list}.` : ''}`;
  }
  if (/no such column|column .* does not exist|unknown column|invalid column name|invalid identifier/i.test(m)) return 'A column name is not recognised. Check the spelling, and whether it needs its table name in front, like <code>e.name</code>.';
  if (/ambiguous/i.test(m)) return 'Two tables have a column with this name. Put the table name or alias in front, like <code>e.name</code>.';
  if (/syntax/i.test(m)) return 'Something near the word mentioned below is in the wrong place, or a comma or bracket is missing.';
  if (/incomplete input/i.test(m)) return 'The statement stops before it is finished.';
  if (/misuse of aggregate|aggregate functions are not allowed in where|invalid use of group function/i.test(m)) return 'COUNT, SUM, AVG and similar can not go in WHERE. Use HAVING to filter on them after GROUP BY.';
  if (/must appear in the GROUP BY|not an aggregate|not a GROUP BY expression|only_full_group_by|not contained in either an aggregate/i.test(m)) return 'Every selected column must either be in GROUP BY or be inside COUNT, SUM, AVG, MIN or MAX.';
  return 'Here is the message from the database:';
}

/* ============================== Steps UI ============================== */
function renderSteps() {
  $('#stepCount').textContent = steps.length;
  const strip = $('#strip'), stage = $('#stage');
  if (!steps.length) { strip.innerHTML = ''; stage.innerHTML = '<p class="empty">Run a query to see how the database works through it, one stage at a time.</p>'; return; }
  const all = $('#showAll').checked;
  strip.innerHTML = steps.map((s, i) => `<li><button type="button" data-i="${i}" ${!all && i === stepIdx ? 'aria-current="step"' : ''}><span class="num">${i + 1}</span>${s.title}</button></li>`).join('');
  const card = (s, i) => `<article class="step-card${s.animate ? ' animate' : ''}" data-i="${i}"><div class="step-title"><h3>${i + 1}. ${s.title}</h3>${s.clause ? `<span class="clause">${esc(s.clause)}</span>` : ''}</div><p class="say">${s.say}</p>${s.html || ''}</article>`;
  stage.innerHTML = all ? steps.map(card).join('') : card(steps[stepIdx], stepIdx);
  $('#prevBtn').disabled = all || stepIdx === 0; $('#nextBtn').disabled = all || stepIdx >= steps.length - 1;
  if (!all && steps[stepIdx].flip) requestAnimationFrame(() => flip(stage));
}
function flip(root) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || settings.motion === 'off') return;
  const rows = [...root.querySelectorAll('tr[data-from]')];
  if (!rows.length) return;
  const h = rows[0].getBoundingClientRect().height;
  rows.forEach((tr, i) => {
    const f = +tr.dataset.from; if (f < 0 || f === i) return;
    tr.animate([{ transform: `translateY(${(f - i) * h}px)`, background: 'var(--accent-soft)' }, { transform: 'none' }], { duration: 900, delay: 250, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'backwards' });
  });
}
function go(i) { stepIdx = Math.max(0, Math.min(steps.length - 1, i)); renderSteps(); }
function stopPlay() { if (playTimer) { clearInterval(playTimer); playTimer = null; $('#playBtn span').textContent = 'Play all'; } }
function showOut(which) {
  for (const [t, id] of [['result', 'Result'], ['steps', 'Steps'], ['history', 'History']]) {
    $('#tab' + id).setAttribute('aria-selected', which === t); $('#out' + id).hidden = which !== t;
  }
  $('#exportMenu').hidden = which !== 'result' || !lastResult;
  if (which === 'history') renderHistory();
}

/* ============================== Editor ============================== */
function highlight() {
  const ta = $('#sql'), src = ta.value;
  const stmt = statementAt(src, ta.selectionStart);
  const toks = tokenize(src, true);
  const cs = stmt ? stmt.s + (stmt.text.length - stmt.text.trimStart().length) : -1, ce = stmt ? stmt.e : -1;
  const pieces = []; let p = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.s > p) pieces.push({ s: p, e: t.s, cls: '' });
    let cls = '';
    if (t.k === 'comment') cls = 'hl-cmt';
    else if (t.k === 'str') cls = 'hl-str';
    else if (t.k === 'num') cls = 'hl-num';
    else if (t.k === 'word' && toks[i + 1]?.k === '(' && !HL_KW.has(t.u)) cls = 'hl-fn';
    else if (t.k === 'word' && HL_KW.has(t.u)) cls = 'hl-kw';
    pieces.push({ s: t.s, e: t.e, cls }); p = t.e;
  }
  if (p < src.length) pieces.push({ s: p, e: src.length, cls: '' });
  let h = '';
  for (const pc of pieces) {
    const bounds = [pc.s, pc.e];
    [cs, ce].forEach(b => { if (b > pc.s && b < pc.e) bounds.splice(bounds.length - 1, 0, b); });
    bounds.sort((a, b) => a - b);
    for (let i = 0; i < bounds.length - 1; i++) {
      const a = bounds[i], b = bounds[i + 1]; const inCur = stmt && stmt.count > 1 && a >= cs && b <= ce;
      const cl = [pc.cls, inCur ? 'hl-cur' : ''].filter(Boolean).join(' ');
      const txt = esc(src.slice(a, b));
      h += cl ? `<span class="${cl}">${txt}</span>` : txt;
    }
  }
  $('#hl').innerHTML = h + '\n';
  const lines = src.split('\n').length;
  const g = $('#gutter'); if (+g.dataset.n !== lines) { g.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n') + '\n'; g.dataset.n = lines; }
  $('#curInfo').textContent = stmt && stmt.count > 1 ? `Statement ${stmt.index + 1} of ${stmt.count} is under the cursor. Ctrl+Enter runs it.` : 'Ctrl+Enter runs the statement under the cursor.';
}
let liveTimer = null, liveSeq = 0, lastStmtStart = null;
function scheduleLive(ms = 200) { clearTimeout(liveTimer); liveTimer = setTimeout(live, ms); }
async function live() {
  if (!A) return;
  const seq = ++liveSeq;
  const ta = $('#sql');
  const stmt = statementAt(ta.value, ta.selectionStart);
  let res;
  try { res = await liveAnalyze(stmt); } catch { res = { sources: [] }; }
  if (seq !== liveSeq) return; // a newer keystroke has taken over
  lastLive = res;
  if (view === 'map') { renderMap(); return; }
  try { await renderData(res); } catch (e) { $('#dataBody').innerHTML = `<div class="err">Could not read the tables.<br><code>${esc(e.message)}</code></div>`; }
}
function syncScroll() { const ta = $('#sql'), hl = $('#hl'); hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; $('#gutter').scrollTop = ta.scrollTop; }

/* ============================== Connections ============================== */
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const describe = cfg => cfg.engine === 'sqlite' ? (cfg.file ? cfg.file.split(/[\\/]/).pop() : 'Built-in sample') : `${cfg.user ? cfg.user + '@' : ''}${cfg.host || 'localhost'}${cfg.database ? '/' + cfg.database : ''}`;
let current = null;

async function connect(cfg) {
  const info = await window.sqlens.connect(cfg);
  cfg = { ...cfg, engine: info.engine || cfg.engine };
  A = new Adapter(window.sqlens, cfg.engine, info.label);
  current = cfg;
  const isSample = cfg.engine === 'sqlite' && !cfg.file;
  const ex = cfg.sample ? EXAMPLES[cfg.sample] || [] : isSample ? EXAMPLES.company : [];
  $('#examples').innerHTML = `<option value="">Pick an example…</option>` + ex.map((e, i) => `<option value="${i}">${esc(e[0])}</option>`).join('');
  $('#conn').innerHTML = `<b title="${esc(info.label)}">${esc(info.label)}</b><span class="eng">${esc(DIALECTS[cfg.engine].label)}</span>`;
  $('#resetBtn').hidden = !isSample;
  $('#examplesLabel').hidden = !isSample;
  const recent = store.get('sqlens-recent', []).filter(r => JSON.stringify({ ...r, password: '' }) !== JSON.stringify({ ...cfg, password: '' }));
  if (!isSample) store.set('sqlens-recent', [{ ...cfg, password: '' }, ...recent].slice(0, 6));
  pinnedTab = null; steps = []; renderSteps(); schemaCache = null; setExportable(null);
  $('#outResult').innerHTML = `<p class="empty">Connected to ${esc(info.label)}. Write a query and press Run.</p>`;
  showWelcome(false);
  if (lesson && !(isSample && (cfg.sample || 'company') === lesson.data)) { lesson = null; $('#lesson').hidden = true; $('#grid').classList.remove('lesson-on'); }
  scheduleLive(0);
}

/* ============================== Start page ============================== */
function showWelcome(on) {
  $('#welcome').hidden = !on; $('#grid').hidden = on; document.body.classList.toggle('on-welcome', on);
  for (const id of ['#openBtn', '#saveBtn', '#homeBtn']) $(id).hidden = on;
  if (on) $('#resetBtn').hidden = true;
  if (on) { renderRecent(); renderTracks(); }
  else if (A) { const isSample = current && current.engine === 'sqlite' && !current.file; $('#resetBtn').hidden = !isSample; }
}
function renderRecent() {
  const recent = store.get('sqlens-recent', []);
  $('#wlRecent').innerHTML = recent.length ? `<h3>Recent</h3><ul>${recent.map((r, i) => `<li><button type="button" class="linkbtn" data-r="${i}">${esc(DIALECTS[r.engine]?.label || r.engine)} <span>${esc(describe(r))}</span></button></li>`).join('')}</ul>` : '';
}
async function openSample(name) {
  const tile = document.querySelector(`[data-sample="${name}"]`);
  if (tile) tile.classList.add('busy');
  try {
    await connect({ engine: 'sqlite', sample: name });
    const ex = EXAMPLES[name] || EXAMPLES.company;
    await loadExample(ex[0]);
  } catch (e) { $('#wlRecent').innerHTML = `<div class="err">The example did not open.<br><code>${esc(e.message)}</code></div>`; }
  finally { if (tile) tile.classList.remove('busy'); }
}
// put an example in the Query area and run it; a "run all" example runs each statement in turn
// the example now in the Query area, so the Examples menu can show its name until the text is edited
let loadedExample = null;
async function loadExample(ex) {
  const list = EXAMPLES[current && current.sample] || EXAMPLES.company;
  const i = list.indexOf(ex);
  $('#examples').value = i >= 0 ? String(i) : '';
  loadedExample = i >= 0 ? ex[1] : null;
  document.body.dataset.loading = '1';
  try { await loadExampleNow(ex); } finally { delete document.body.dataset.loading; }
}
async function loadExampleNow(ex) {
  const ta = $('#sql');
  ta.value = ex[1]; store.set('sqlens-draft', ta.value);
  highlight();
  if (ex[2]) {
    const list = statements(ta.value).filter(o => tokenize(o.text, false).length);
    for (const o of list) { ta.setSelectionRange(o.e, o.e); await runCurrent(); }
  } else { ta.setSelectionRange(ta.value.length, ta.value.length); await runCurrent(); }
  ta.focus();
  scheduleLive(0);
}

/* ============================== Lessons ============================== */
const LKEY = 'sqlens-lessons';
let lesson = null, hintsShown = 0;
const progress = () => { const p = store.get(LKEY, {}) || {}; return { done: Array.isArray(p.done) ? p.done : [], last: p.last || null }; };
const saveProgress = p => store.set(LKEY, p);
const codeOnly = t => t.replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
function renderTracks() {
  const done = new Set(progress().done);
  $('#wlTracks').innerHTML = TRACKS.map(t => {
    const ls = lessonsIn(t.id), n = ls.filter(l => done.has(l.id)).length;
    return `<button type="button" class="wl-tile" data-track="${t.id}"><b>${esc(t.title)}</b><span>${esc(t.blurb)}</span><small>${n ? `${n} of ${ls.length} done, continue` : `${ls.length} lessons`}</small></button>`;
  }).join('');
}
// the next lesson to do in a track: the first one not done yet
function nextInTrack(track) {
  const done = new Set(progress().done), ls = lessonsIn(track);
  return (ls.find(l => !done.has(l.id)) || ls[0]).id;
}
async function openLesson(id) {
  const L = LESSONS.find(l => l.id === id); if (!L) return;
  document.body.dataset.loading = '1';
  try {
    const here = current && current.engine === 'sqlite' && !current.file && (current.sample || 'company') === L.data;
    if (!here) await connect({ engine: 'sqlite', sample: L.data });
    else showWelcome(false);
    lesson = L; hintsShown = 0;
    const p = progress(); p.last = id; saveProgress(p);
    renderLesson();
    const ta = $('#sql');
    ta.value = L.start || ''; store.set('sqlens-draft', ta.value);
    loadedExample = null; $('#examples').value = '';
    highlight(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    $('#outResult').innerHTML = '<p class="empty">Write your query in the Query area. Press Run to try it as often as you like, then Check my answer.</p>';
    steps = []; renderSteps(); showOut('result');
    scheduleLive(0);
  } finally { delete document.body.dataset.loading; }
}
function renderLesson() {
  const L = lesson; if (!L) { $('#lesson').hidden = true; return; }
  const done = new Set(progress().done);
  const list = lessonsIn(L.track), i = list.indexOf(L);
  const track = TRACKS.find(t => t.id === L.track);
  $('#lsPick').innerHTML = TRACKS.map(t => `<optgroup label="${esc(t.title)}">${lessonsIn(t.id).map((l, k) => `<option value="${l.id}"${l === L ? ' selected' : ''}>${done.has(l.id) ? '✓ ' : ''}${k + 1}. ${esc(l.title)}</option>`).join('')}</optgroup>`).join('');
  const data = { company: 'Company', school: 'School', library: 'Library' }[L.data];
  $('#lsBody').innerHTML = `<p class="ls-where">${esc(track.title)} · lesson ${i + 1} of ${list.length} · ${data} example data${done.has(L.id) ? ' · <b class="ls-done">done</b>' : ''}</p>
    <h3 id="lsTitle">${esc(L.title)}</h3>${L.intro}`;
  $('#lsTask').innerHTML = `<b>Your task</b><p>${L.task}</p>`;
  $('#lsMsg').innerHTML = ''; $('#lsMsg').className = 'ls-msg';
  $('#lsPrev').disabled = i <= 0 && L.track === TRACKS[0].id;
  const all = LESSONS.indexOf(L);
  $('#lsNext').disabled = all >= LESSONS.length - 1;
  $('#lesson').hidden = false; $('#grid').classList.add('lesson-on');
  setFold(false);
}
function setFold(folded) {
  $('#lesson').classList.toggle('folded', folded);
  $('#lsFold').textContent = folded ? 'Show lesson' : 'Hide lesson';
  $('#lsFold').setAttribute('aria-expanded', String(!folded));
}
function lessonSay(kind, html) { const m = $('#lsMsg'); m.className = 'ls-msg ls-' + kind; m.innerHTML = html; }
async function freshData() { await window.sqlens.reset(); A.invalidate(); schemaCache = null; }
async function runAllIn(text) {
  const list = statements(text).filter(o => tokenize(o.text, false).length);
  for (let k = 0; k < list.length; k++) {
    try { await A.run(list[k].text.trim()); }
    catch (e) { const err = new Error(e.message); err.stmt = k + 1; err.count = list.length; throw err; }
  }
  return list.length;
}
async function checkLesson() {
  const L = lesson; if (!L || !A) return;
  const ta = $('#sql');
  const text = ta.value;
  if (!tokenize(codeOnly(text), false).length) { lessonSay('no', 'Write a query in the Query area first.'); return; }
  $('#lsCheck').classList.add('busy');
  document.body.dataset.loading = '1';
  try {
    let mine, want;
    if (L.change) {
      await freshData(); await runAllIn(L.answer); want = await A.query(L.verify, 5000);
      await freshData();
      try { await runAllIn(text); }
      catch (e) { lessonSay('no', `${e.count > 1 ? `Statement ${e.stmt} of ${e.count}` : 'Your statement'} did not run. The database said: <code>${esc(e.message)}</code>`); return; }
      mine = await A.query(L.verify, 5000);
      scheduleLive(0);
    } else {
      const stmt = statementAt(text, ta.selectionStart);
      if (!stmt) { lessonSay('no', 'Write a query in the Query area first.'); return; }
      if (!READ_KINDS.has(parseQuery(stmt.text.trim()).kind)) { lessonSay('no', 'This task asks for a query that reads data, starting with SELECT (or WITH). Check my answer only runs queries that read, so your data stays as it is.'); return; }
      try { mine = await A.query(stmt.text.trim(), 5000); }
      catch (e) { lessonSay('no', `Your query did not run. The database said: <code>${esc(e.message)}</code><br>${await friendlyError(e.message)}`); return; }
      want = await A.query(L.answer, 5000);
      await runCurrent();
    }
    const r = compareResults(L, mine, want);
    if (r.ok) {
      const miss = (L.must || []).find(([re]) => !new RegExp(re, 'i').test(codeOnly(L.change ? text : statementAt(text, ta.selectionStart).text)));
      if (miss) { lessonSay('almost', `The result is right. ${esc(miss[1])}`); return; }
      const p = progress(); if (!p.done.includes(L.id)) p.done.push(L.id); saveProgress(p);
      const next = LESSONS[LESSONS.indexOf(L) + 1];
      renderLesson();
      lessonSay('yes', `<b>${esc(r.say)}</b> ${next ? `<button type="button" class="ctl primary" data-go="${next.id}">Next lesson: ${esc(next.title)} &rarr;</button>` : 'That was the last lesson. Well done: you have covered what most entry-level SQL roles ask for.'}`);
    } else lessonSay('no', esc(r.say));
  } finally { $('#lsCheck').classList.remove('busy'); delete document.body.dataset.loading; }
}
function wireLessons() {
  renderTracks();
  $('#wlTracks').addEventListener('click', e => { const b = e.target.closest('[data-track]'); if (b) openLesson(nextInTrack(b.dataset.track)); });
  $('#lessonsBtn').addEventListener('click', () => { const p = progress(); openLesson(lesson ? lesson.id : p.last || nextInTrack('beginner')); });
  $('#lsPick').addEventListener('change', e => openLesson(e.target.value));
  $('#lsCheck').addEventListener('click', checkLesson);
  $('#lsHint').addEventListener('click', () => {
    const h = lesson.hints || []; if (!h.length) return;
    hintsShown = Math.min(h.length, hintsShown + 1);
    lessonSay('hint', h.slice(0, hintsShown).map((x, k) => `<p><b>Hint ${k + 1}.</b> ${esc(x)}</p>`).join('') + (hintsShown < h.length ? '' : '<p class="muted">No more hints. Show the answer if you are stuck.</p>'));
  });
  $('#lsShow').addEventListener('click', () => {
    lessonSay('hint', `<p><b>One answer</b> (others can be right too):</p><pre>${esc(formatSql(lesson.answer))}</pre><button type="button" class="ctl" id="lsUse">Put it in the Query area</button>`);
  });
  $('#lsMsg').addEventListener('click', e => {
    if (e.target.id === 'lsUse') { const ta = $('#sql'); ta.value = formatSql(lesson.answer); ta.dispatchEvent(new Event('input')); ta.focus(); }
    const go = e.target.closest('[data-go]'); if (go) openLesson(go.dataset.go);
  });
  $('#lsPrev').addEventListener('click', () => { const k = LESSONS.indexOf(lesson); if (k > 0) openLesson(LESSONS[k - 1].id); });
  $('#lsNext').addEventListener('click', () => { const k = LESSONS.indexOf(lesson); if (k < LESSONS.length - 1) openLesson(LESSONS[k + 1].id); });
  $('#lsFold').addEventListener('click', () => setFold(!$('#lesson').classList.contains('folded')));
  $('#lsClose').addEventListener('click', () => { lesson = null; $('#lesson').hidden = true; $('#grid').classList.remove('lesson-on'); });
}

function openConnect(engine) {
  const m = $('#connModal');
  const fill = cfg => {
    $('#cEngine').value = cfg.engine || 'postgres';
    $('#cFile').value = cfg.file || ''; $('#cHost').value = cfg.host || ''; $('#cPort').value = cfg.port || '';
    $('#cDb').value = cfg.database || ''; $('#cUser').value = cfg.user || ''; $('#cPass').value = ''; $('#cSsl').checked = !!cfg.ssl;
    syncForm();
  };
  const recent = store.get('sqlens-recent', []);
  $('#recent').innerHTML = recent.length ? `<span class="hint">Recent:</span>` + recent.map((r, i) => `<button type="button" class="ctl" data-r="${i}">${esc(DIALECTS[r.engine]?.label || r.engine)} · ${esc(describe(r))}</button>`).join('') + `<button type="button" class="ctl" data-r="sample">Built-in sample</button>` : `<button type="button" class="ctl" data-r="sample">Use the built-in sample</button>`;
  $('#recent').onclick = e => { const b = e.target.closest('[data-r]'); if (!b) return; fill(b.dataset.r === 'sample' ? { engine: 'sqlite' } : recent[+b.dataset.r]); };
  fill(typeof engine === 'string' ? (current && current.engine === engine && !(engine === 'sqlite' && !current.file) ? current : { engine })
    : typeof engine === 'object' && engine ? engine
    : current && !(current.engine === 'sqlite' && !current.file) ? current : { engine: 'postgres' });
  $('#cErr').hidden = true;
  m.hidden = false; $('#cEngine').focus();
}
function syncForm() {
  const eng = $('#cEngine').value, server = eng !== 'sqlite';
  document.querySelectorAll('#connForm [data-for]').forEach(el => { el.hidden = el.dataset.for === 'server' ? !server : server; });
  const dflt = DIALECTS[eng].defaults || {};
  $('#cPort').placeholder = dflt.port || ''; $('#cDb').placeholder = dflt.database || ''; $('#cUser').placeholder = dflt.user || '';
  $('#cHint').textContent = {
    sqlite: 'Pick a .sqlite or .db file, or leave it empty to use the built-in sample. A new file name creates an empty database.',
    postgres: 'Works with PostgreSQL and compatible servers such as Supabase, Neon and CockroachDB.',
    mysql: 'The step views need MySQL 8 or MariaDB 10.2 or newer.',
    sqlserver: 'Works with SQL Server 2016 or newer and Azure SQL.',
    oracle: 'The step views need Oracle 18c or newer. Database here means the service name.'
  }[eng];
}

/* ============================== Settings ============================== */
const SETTINGS_DEFAULT = { size: '1', theme: '', font: 'normal', lines: '1', motion: 'on', play: '3500', suggest: 'on', preview: '100' };
let settings = { ...SETTINGS_DEFAULT, ...(store.get('sqlens-settings', {}) || {}) };
if (settings.font !== 'wide') settings.font = 'normal';
function applySettings() {
  const r = document.documentElement;
  r.style.setProperty('--zoom', settings.size);
  if (settings.theme) r.dataset.theme = settings.theme; else delete r.dataset.theme;
  // the System / Light / Dark buttons; the high-contrast choices count as light or dark
  const base = { contrast: 'light', 'contrast-dark': 'dark' }[settings.theme] || settings.theme || '';
  document.querySelectorAll('[data-theme-pick]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themePick === settings.theme)));
  if (window.sqlens && window.sqlens.setTheme) window.sqlens.setTheme(base || 'system');
  r.dataset.font = settings.font;
  r.style.setProperty('--lh', settings.lines);
  r.dataset.motion = settings.motion;
  if (window.sqlens && window.sqlens.setZoom) window.sqlens.setZoom(+settings.size);
  MAXROWS = +settings.preview || 100;
  $('#previewRows').value = String(MAXROWS);
}
function saveSettings() { store.set('sqlens-settings', settings); applySettings(); }
const SET_FIELDS = { sSize: 'size', sTheme: 'theme', sFont: 'font', sLines: 'lines', sMotion: 'motion', sPlay: 'play', sSuggest: 'suggest' };
function openSettings() {
  for (const [id, k] of Object.entries(SET_FIELDS)) $('#' + id).value = settings[k];
  $('#setModal').hidden = false; $('#sSize').focus();
}
function wireSettings() {
  for (const [id, k] of Object.entries(SET_FIELDS)) $('#' + id).addEventListener('change', e => { settings[k] = e.target.value; saveSettings(); if (k === 'size') requestAnimationFrame(() => mapDraw && mapDraw()); });
  $('#setForm').addEventListener('submit', e => { e.preventDefault(); $('#setModal').hidden = true; });
  $('#setModal').addEventListener('keydown', e => { if (e.key === 'Escape') $('#setModal').hidden = true; });
  $('#setReset').addEventListener('click', () => { settings = { ...SETTINGS_DEFAULT, preview: settings.preview }; saveSettings(); openSettings(); });
  $('#settingsBtn').addEventListener('click', openSettings);
  document.querySelectorAll('[data-theme-pick]').forEach(b => b.addEventListener('click', () => {
    settings.theme = b.dataset.themePick; saveSettings();
    if (!$('#setModal').hidden) $('#sTheme').value = settings.theme;
  }));
  $('#previewRows').addEventListener('change', e => { settings.preview = e.target.value; saveSettings(); scheduleLive(0); });
}

/* ============================== History ============================== */
const HKEY = 'sqlens-history';
function addHistory(entry) {
  const h = store.get(HKEY, []);
  if (h[0] && h[0].sql === entry.sql && h[0].db === entry.db) h.shift();
  h.unshift(entry);
  store.set(HKEY, h.slice(0, 300));
  if (!$('#outHistory').hidden) renderHistory();
}
function renderHistory() {
  const f = $('#histFilter').value.trim().toLowerCase();
  const h = store.get(HKEY, []);
  const shown = h.map((x, i) => ({ ...x, i })).filter(x => !f || x.sql.toLowerCase().includes(f) || String(x.db).toLowerCase().includes(f));
  const when = t => { const d = new Date(t), today = new Date().toDateString() === d.toDateString(); return (today ? '' : d.toLocaleDateString([], { day: 'numeric', month: 'short' }) + ' ') + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); };
  $('#histList').innerHTML = shown.length ? shown.map(x => `<li>
      <div class="hmeta"><time>${esc(when(x.at))}</time><span>${esc(x.db)}</span><span class="${x.ok ? 'yes' : 'no'}">${x.ok ? esc(x.out) : 'error'}</span>${x.ms !== undefined ? `<span>${x.ms.toFixed(1)} ms</span>` : ''}</div>
      <pre class="hsql">${esc(x.sql)}</pre>
      ${x.ok ? '' : `<p class="herr">${esc(x.out)}</p>`}
      <div class="hact"><button class="ctl" type="button" data-act="put" data-i="${x.i}">Put in the editor</button><button class="ctl" type="button" data-act="run" data-i="${x.i}">Run again</button></div>
    </li>`).join('') : `<li class="empty">${h.length ? 'Nothing in the history matches.' : 'Queries you run appear here, newest first. They are kept on this computer.'}</li>`;
}
// add a statement at the end of the editor and put the cursor in it, keeping the rest
function putInEditor(sql) {
  const ta = $('#sql');
  let cur = ta.value.replace(/\s+$/, '');
  let add = '';
  if (cur && !/;$/.test(cur)) add += ';';
  if (cur) add += '\n\n';
  const at = cur.length + add.length;
  ta.focus();
  ta.setSelectionRange(cur.length, ta.value.length);
  insertText(ta, add + sql.replace(/;?\s*$/, ';'));
  ta.setSelectionRange(at, at);
  ta.scrollTop = ta.scrollHeight;
  highlight(); scheduleLive(0);
}
// replace the selection in a way that Ctrl+Z can undo
function insertText(ta, text) {
  if (!document.execCommand('insertText', false, text)) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
  ta.dispatchEvent(new Event('input'));
}
function wireHistory() {
  $('#histFilter').addEventListener('input', renderHistory);
  $('#histClear').addEventListener('click', () => { store.set(HKEY, []); renderHistory(); });
  $('#histList').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const x = store.get(HKEY, [])[+b.dataset.i]; if (!x) return;
    putInEditor(x.sql);
    if (b.dataset.act === 'run') runCurrent();
  });
}

/* ============================== Export and query files ============================== */
let lastResult = null; // { sql, name, rows }
function setExportable(r) { lastResult = r; $('#exportMenu').hidden = !r || $('#outResult').hidden; }
function wireExport() {
  $('#exportList').innerHTML = FORMATS.map(f => `<button type="button" class="mitem" role="menuitem" data-f="${f.id}">${esc(f.label)} <small>.${f.ext}</small></button>`).join('');
  $('#exportList').addEventListener('click', async e => {
    const b = e.target.closest('[data-f]'); if (!b || !lastResult) return;
    $('#exportMenu').open = false;
    const f = FORMATS.find(x => x.id === b.dataset.f);
    try {
      const all = await A.query(lastResult.sql);   // every row, not just the ones on screen
      const data = encode(f.id, all.cols.filter(c => !isHelperCol(c)), all.rows.map(r => r.filter((_, i) => !isHelperCol(all.cols[i]))), { name: lastResult.name, qi: x => A.qi(x) });
      const path = await window.sqlens.saveFile(`${lastResult.name}.${f.ext}`, [{ name: f.filter, extensions: [f.ext] }], data);
      if (path) $('#runInfo').textContent = `Saved ${plural(all.rows.length, 'row')} to ${path.split(/[\\/]/).pop()}`;
    } catch (err) { $('#runInfo').textContent = `Export failed: ${err.message}`; }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#exportMenu')) $('#exportMenu').open = false; });
  $('#saveBtn').addEventListener('click', async () => {
    try { const p = await window.sqlens.saveFile('query.sql', [{ name: 'SQL file', extensions: ['sql'] }], $('#sql').value); if (p) $('#runInfo').textContent = `Saved the query to ${p.split(/[\\/]/).pop()}`; }
    catch (err) { $('#runInfo').textContent = `Could not save: ${err.message}`; }
  });
  $('#openBtn').addEventListener('click', async () => {
    try {
      const f = await window.sqlens.openSql(); if (!f) return;
      const ta = $('#sql'); ta.focus(); ta.select(); insertText(ta, f.text); ta.setSelectionRange(0, 0); ta.scrollTop = 0;
      $('#runInfo').textContent = `Opened ${f.path.split(/[\\/]/).pop()}`; highlight(); scheduleLive(0);
    } catch (err) { $('#runInfo').textContent = `Could not open: ${err.message}`; }
  });
}

/* ============================== Format ============================== */
function formatEditor() {
  const ta = $('#sql');
  const src = ta.value, out = formatSql(src);
  if (out === src) return;
  // keep the cursor in the same statement
  const stmt = statementAt(src, ta.selectionStart);
  ta.focus(); ta.select(); insertText(ta, out);
  const idx = stmt ? stmt.index : 0;
  let pos = 0, n = 0;
  for (const m of out.matchAll(/;/g)) { if (n === idx) break; pos = m.index + 1; n++; }
  const p2 = pos + (out.slice(pos).match(/^\s*/)[0].length);
  ta.setSelectionRange(p2, p2);
  highlight();
}

/* ============================== Suggestions while typing ============================== */
const ac = { items: [], idx: 0, range: null, open: false };
let charW = 0;
function measureChar() {
  const ta = $('#sql'), cs = getComputedStyle(ta);
  const c = document.createElement('canvas').getContext('2d');
  c.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  charW = c.measureText('MMMMMMMMMM').width / 10 + (parseFloat(cs.letterSpacing) || 0);
}
function acClose() { ac.open = false; $('#ac').hidden = true; $('#sql').removeAttribute('aria-activedescendant'); $('#sql').setAttribute('aria-expanded', 'false'); }
function acUpdate(manual = false) {
  const ta = $('#sql');
  if (!A || (settings.suggest === 'manual' && !manual && !ac.open)) return acClose();
  if (ta.selectionStart !== ta.selectionEnd) return acClose();
  const ctx = {
    tables: A._tables || [],
    columns: t => { const c = A._cols.get(t); if (!c) A.tableInfo(t).then(() => { if (ac.open || manual) acUpdate(manual); }).catch(() => {}); return c; },
    qi: x => A.qi(x)
  };
  if (!A._tables) { A.tables().then(() => acUpdate(manual)).catch(() => {}); return; }
  const r = suggest(ta.value, ta.selectionStart, ctx, { manual });
  if (!r) return acClose();
  ac.items = r.items; ac.range = r; ac.idx = 0; ac.open = true;
  acRender();
}
function acRender() {
  const ta = $('#sql'), el = $('#ac'), cs = getComputedStyle(ta);
  if (!charW) measureChar();
  const lp = ac.items.length ? ac.range.prefix.length : 0;
  el.innerHTML = ac.items.map((it, i) => `<div class="ac-item${i === ac.idx ? ' on' : ''}" role="option" id="ac-${i}" aria-selected="${i === ac.idx}" data-i="${i}"><span class="ac-t">${it.fix ? esc(it.text) : `<b>${esc(it.text.slice(0, lp))}</b>${esc(it.text.slice(lp))}`}</span><span class="ac-k">${it.fix ? 'did you mean?' : esc(it.detail || it.kind)}</span></div>`).join('');
  const before = ta.value.slice(0, ac.range.from);
  const line = before.split('\n').length - 1, col = before.length - before.lastIndexOf('\n') - 1;
  const lh = parseFloat(cs.lineHeight), pt = parseFloat(cs.paddingTop), pl = parseFloat(cs.paddingLeft);
  el.hidden = false;
  const w = el.offsetWidth, boxW = ta.clientWidth, boxH = ta.clientHeight;
  let top = pt + (line + 1) * lh - ta.scrollTop + 2, left = pl + col * charW - ta.scrollLeft - 4;
  left = Math.max(4, Math.min(left, boxW - w - 4));
  if (top + el.offsetHeight > boxH && top - lh - el.offsetHeight > 0) top = top - lh - el.offsetHeight - 4;
  el.style.top = top + 'px'; el.style.left = left + 'px';
  ta.setAttribute('aria-activedescendant', 'ac-' + ac.idx); ta.setAttribute('aria-expanded', 'true');
}
function acAccept(i = ac.idx) {
  const it = ac.items[i]; if (!it) return;
  const ta = $('#sql');
  ta.setSelectionRange(ac.range.from, ac.range.to);
  acClose();
  insertText(ta, it.insert + (it.call ? '(' : ''));
  acClose();
}
function wireSuggest() {
  const ta = $('#sql');
  ta.setAttribute('aria-expanded', 'false');
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'Space') { e.preventDefault(); acUpdate(true); return; }
    if (!ac.open) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); ac.idx = (ac.idx + (e.key === 'ArrowDown' ? 1 : -1) + ac.items.length) % ac.items.length; acRender(); $('#ac-' + ac.idx)?.scrollIntoView({ block: 'nearest' }); return; }
    if ((e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); e.stopImmediatePropagation(); acAccept(); return; }
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); acClose(); }
  }, true);
  ta.addEventListener('input', e => { if (e.isTrusted || e.inputType) acUpdate(false); });
  ta.addEventListener('keyup', e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) acClose(); });
  ta.addEventListener('click', acClose);
  ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) acClose(); }, 120));
  ta.addEventListener('scroll', () => { if (ac.open) acRender(); });
  $('#ac').addEventListener('mousedown', e => { const d = e.target.closest('[data-i]'); if (!d) return; e.preventDefault(); acAccept(+d.dataset.i); });
}

/* ============================== Schema map ============================== */
let view = 'rows', schemaCache = null, mapDraw = null, lastLive = { sources: [] };
async function renderMap() {
  const el = $('#mapBody');
  if (!A) return;
  try {
    if (!schemaCache) { el.innerHTML = '<p class="empty">Reading the tables and how they link…</p>'; schemaCache = await loadSchema(A); }
    const used = new Set(lastLive.sources.map(s => s.table));
    const joins = new Set();
    for (const s of lastLive.sources) for (const [c, r] of s.roles) if (r.has('join')) joins.add((s.table + '.' + c).toLowerCase());
    mapDraw = renderSchemaMap(el, schemaCache, { used, joins, onPick: t => { pinnedTab = t; $('#follow').checked = false; setView('rows'); } });
  } catch (e) { el.innerHTML = `<div class="err">Could not read the tables.<br><code>${esc(e.message)}</code></div>`; }
}
function setView(v) {
  view = v;
  for (const [id, k] of [['#viewRows', 'rows'], ['#viewDetails', 'details'], ['#viewMap', 'map']]) $(id).setAttribute('aria-selected', v === k);
  $('.data-wrap').hidden = v === 'map'; $('#mapBody').hidden = v !== 'map';
  $('.legend').hidden = v !== 'rows';
  $('#previewRows').closest('label').hidden = v !== 'rows'; $('#follow').closest('label').hidden = v === 'map';
  if (v === 'map') renderMap(); else scheduleLive(0);
}
function wireMap() {
  $('#viewRows').addEventListener('click', () => setView('rows'));
  $('#viewMap').addEventListener('click', () => setView('map'));
  $('#viewDetails').addEventListener('click', () => setView('details'));
  if (window.ResizeObserver) new ResizeObserver(() => { if (view === 'map' && mapDraw) mapDraw(); }).observe($('#mapBody'));
}

/* ============================== User guide ============================== */
let guideLoaded = false;
async function openGuide() {
  $('#guideModal').hidden = false;
  if (!guideLoaded) {
    try {
      const md = await window.sqlens.readGuide();
      const { html, toc } = renderMarkdown(md, '../../docs/');
      $('#guideBody').innerHTML = html;
      $('#guideToc').innerHTML = toc.filter(t => t.level <= 3 && t.level >= 2).map(t => `<a href="#${t.id}" class="l${t.level}">${esc(t.text)}</a>`).join('');
      $('#guideToc').onclick = e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); document.getElementById(a.getAttribute('href').slice(1))?.scrollIntoView(); };
      guideLoaded = true;
    } catch (e) { $('#guideBody').innerHTML = `<div class="err">The guide could not be opened.<br><code>${esc(e.message)}</code></div>`; }
  }
  $('#guideClose').focus();
}

/* ============================== Boot ============================== */
async function boot() {
  applySettings();
  // the version, so it is easy to tell which build is running
  if (window.sqlens && window.sqlens.version) window.sqlens.version().then(v => { document.title = `SQLens ${v}`; $('#appVersion').textContent = `Version ${v}`; $('#wlVersion').textContent = `· Version ${v}`; $('#aboutVersion').textContent = v; }).catch(() => {});
  if (!window.sqlens) { $('#welcome .wl-sub').innerHTML = '<span class="err">This page needs the SQLens desktop app. Start it with <code>npm start</code>.</span>'; return; }
  const ta = $('#sql');
  ta.value = store.get('sqlens-draft', null) || EXAMPLES.company[0][1];
  showWelcome(true);
  $('#wlEngines').addEventListener('click', e => { const b = e.target.closest('[data-engine]'); if (b) openConnect(b.dataset.engine); });
  $('#welcome .wl-samples').addEventListener('click', e => { const b = e.target.closest('[data-sample]'); if (b) openSample(b.dataset.sample); });
  $('#wlRecent').addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) openConnect(store.get('sqlens-recent', [])[+b.dataset.r]); });
  $('#wlGuide').addEventListener('click', openGuide);
  $('#homeBtn').addEventListener('click', () => showWelcome(true));

  ta.addEventListener('input', () => {
    highlight(); scheduleLive(); store.set('sqlens-draft', ta.value);
    if (loadedExample !== null && ta.value !== loadedExample) { loadedExample = null; $('#examples').value = ''; }
  });
  ['keyup', 'click', 'select'].forEach(ev => ta.addEventListener(ev, () => { highlight(); const k = statementAt(ta.value, ta.selectionStart)?.s; if (k !== lastStmtStart) { lastStmtStart = k; scheduleLive(); } }));
  ta.addEventListener('scroll', syncScroll);
  ta.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runCurrent(); }
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); ta.dispatchEvent(new Event('input')); }
  });
  $('#runBtn').addEventListener('click', runCurrent);
  $('#formatBtn').addEventListener('click', formatEditor);
  document.addEventListener('keydown', e => { if (e.shiftKey && e.altKey && e.code === 'KeyF') { e.preventDefault(); formatEditor(); } });
  wireSettings(); wireHistory(); wireExport(); wireSuggest(); wireMap(); wireLessons();
  $('#tabHistory').addEventListener('click', () => showOut('history'));
  $('#examples').addEventListener('change', e => { const i = e.target.value; if (i === '') return; loadExample((EXAMPLES[current.sample] || EXAMPLES.company)[+i]); });
  $('#resetBtn').addEventListener('click', async () => { await window.sqlens.reset(); A.invalidate(); schemaCache = null; scheduleLive(0); $('#outResult').innerHTML = '<p class="empty">Sample data reset. Press Run to run your query again.</p>'; steps = []; renderSteps(); });
  $('#connectBtn').addEventListener('click', () => openConnect());
  $('#guideBtn').addEventListener('click', openGuide);
  $('#guideClose').addEventListener('click', () => { $('#guideModal').hidden = true; });
  $('#guideModal').addEventListener('keydown', e => { if (e.key === 'Escape') $('#guideModal').hidden = true; });
  $('#guideModal').addEventListener('click', e => { if (e.target.id === 'guideModal') $('#guideModal').hidden = true; });
  $('#cEngine').addEventListener('change', syncForm);
  $('#cCancel').addEventListener('click', () => { $('#connModal').hidden = true; });
  $('#connModal').addEventListener('keydown', e => { if (e.key === 'Escape') $('#connModal').hidden = true; });
  $('#cBrowse').addEventListener('click', async () => { try { const f = await window.sqlens.pickFile(); if (f) $('#cFile').value = f; } catch {} });
  $('#connForm').addEventListener('submit', async e => {
    e.preventDefault();
    const eng = $('#cEngine').value;
    const cfg = eng === 'sqlite' ? { engine: eng, file: $('#cFile').value.trim() } : {
      engine: eng, host: $('#cHost').value.trim() || 'localhost', port: $('#cPort').value.trim() || DIALECTS[eng].defaults.port,
      database: $('#cDb').value.trim() || DIALECTS[eng].defaults.database || '', user: $('#cUser').value.trim() || DIALECTS[eng].defaults.user || '',
      password: $('#cPass').value, ssl: $('#cSsl').checked
    };
    $('#connForm').classList.add('busy'); $('#cErr').hidden = true;
    try { await connect(cfg); $('#connModal').hidden = true; }
    catch (err) { $('#cErr').hidden = false; $('#cErr').innerHTML = `<b>Could not connect.</b><br><code>${esc(err.message)}</code>`; }
    finally { $('#connForm').classList.remove('busy'); }
  });
  $('#follow').addEventListener('change', () => scheduleLive(0));
  $('#tabs').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; pinnedTab = b.dataset.t; $('#follow').checked = false; scheduleLive(0); });
  $('#tabResult').addEventListener('click', () => showOut('result'));
  $('#tabSteps').addEventListener('click', () => showOut('steps'));
  $('#strip').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; stopPlay(); $('#showAll').checked = false; go(+b.dataset.i); });
  $('#prevBtn').addEventListener('click', () => { stopPlay(); go(stepIdx - 1); });
  $('#nextBtn').addEventListener('click', () => { stopPlay(); go(stepIdx + 1); });
  $('#showAll').addEventListener('change', () => { stopPlay(); renderSteps(); });
  $('#playBtn').addEventListener('click', () => {
    if (playTimer) { stopPlay(); return; }
    if (!steps.length) return;
    $('#showAll').checked = false; showOut('steps'); go(0);
    $('#playBtn span').textContent = 'Pause';
    playTimer = setInterval(() => { if (stepIdx >= steps.length - 1) stopPlay(); else go(stepIdx + 1); }, +settings.play || 3500);
  });
  document.addEventListener('keydown', e => {
    if (e.target === ta || e.target.closest('input, select, textarea') || !$('#connModal').hidden || !$('#setModal').hidden || $('#outSteps').hidden || $('#showAll').checked) return;
    if (e.key === 'ArrowRight') { stopPlay(); go(stepIdx + 1); }
    if (e.key === 'ArrowLeft') { stopPlay(); go(stepIdx - 1); }
  });
  highlight();
}
boot();

/* ============================== Splitters ============================== */
// Drag the bars between the areas to resize them, like RStudio. Double-click puts them back.
function splitters() {
  const grid = $('#grid');
  const apply = sz => {
    if (sz.left) grid.style.setProperty('--left', sz.left);
    else grid.style.removeProperty('--left');
    if (sz.top) grid.style.setProperty('--top', sz.top);
    else grid.style.removeProperty('--top');
  };
  let sz = store.get('sqlens-split', {}) || {};
  apply(sz);
  const drag = (bar, onMove) => {
    bar.addEventListener('pointerdown', e => {
      e.preventDefault(); bar.setPointerCapture(e.pointerId); bar.classList.add('dragging');
      const move = ev => onMove(ev, grid.getBoundingClientRect());
      const up = () => { bar.removeEventListener('pointermove', move); bar.classList.remove('dragging'); store.set('sqlens-split', sz); };
      bar.addEventListener('pointermove', move);
      bar.addEventListener('pointerup', up, { once: true });
    });
    bar.addEventListener('dblclick', () => { sz = {}; apply(sz); store.set('sqlens-split', sz); });
  };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const setLeft = f => { sz = { ...sz, left: (clamp(f, .2, .8) * 100).toFixed(1) + '%' }; apply(sz); };
  const setTop = f => { sz = { ...sz, top: (clamp(f, .15, .85) * 100).toFixed(1) + '%' }; apply(sz); };
  drag($('#splitV'), (e, r) => setLeft((e.clientX - r.left) / r.width));
  drag($('#splitH'), (e, r) => setTop((e.clientY - r.top) / r.height));
  const cur = (name, dflt) => parseFloat(sz[name] || dflt) / 100;
  $('#splitV').addEventListener('keydown', e => {
    const d = e.key === 'ArrowLeft' ? -.02 : e.key === 'ArrowRight' ? .02 : 0;
    if (d) { e.preventDefault(); setLeft(cur('left', '47') + d); store.set('sqlens-split', sz); }
  });
  $('#splitH').addEventListener('keydown', e => {
    const d = e.key === 'ArrowUp' ? -.02 : e.key === 'ArrowDown' ? .02 : 0;
    if (d) { e.preventDefault(); setTop(cur('top', '42') + d); store.set('sqlens-split', sz); }
  });
}
splitters();
