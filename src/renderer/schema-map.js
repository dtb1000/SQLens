// The schema map: every table as a box listing its columns, with a line from each column that
// points at another table (a foreign key) to the column it points at. Tables that are pointed at
// sit to the left, tables that point at them to the right, so the lines mostly run one way.
// When a database declares no foreign keys, columns named like "dept_id" or "employee_id" are
// matched to a table by name and drawn with a dashed line, marked "guessed".
// Each line ends in a crow's foot on the "many" side and a bar on the "one" side, with the words
// "many" and "1" beside them, and a list under the map says what each link means in plain words.

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export async function loadSchema(A) {
  const tables = await A.tables();
  const info = [];
  for (const t of tables) {
    const cols = await A.tableInfo(t);
    let pk = []; try { pk = await A.primaryKey(t); } catch {}
    if (pk.length === 1 && pk[0] === 'rowid') {
      // SQLite reports rowid; use a column called id when there is one
      const id = cols.find(c => c.name.toLowerCase() === 'id'); pk = id ? [id.name] : [];
    }
    const fks = await A.foreignKeys(t);
    const uniques = A.uniques ? await A.uniques(t) : [];
    // columns that are unique on their own: a link from one of them is one to one
    const unique = new Set([...uniques.filter(u => u.length === 1).map(u => String(u[0]).toLowerCase()), ...(pk.length === 1 ? [pk[0].toLowerCase()] : [])]);
    info.push({ name: t, cols, pk: new Set(pk.map(c => c.toLowerCase())), fks, unique });
  }
  const byName = new Map(info.map(t => [t.name.toLowerCase(), t]));
  const links = [];
  for (const t of info) {
    for (const f of t.fks) {
      const target = byName.get(String(f.refTable).toLowerCase()); if (!target) continue;
      const refCol = f.refCol || [...target.pk][0] || 'id';
      links.push({ from: t.name, fromCol: f.col, to: target.name, toCol: refCol, guessed: false });
    }
  }
  // guesses, only for columns that have no declared key
  for (const t of info) {
    for (const c of t.cols) {
      const m = /^(.+?)_?id$/i.exec(c.name);
      if (!m || c.name.toLowerCase() === 'id' || links.some(l => l.from === t.name && l.fromCol.toLowerCase() === c.name.toLowerCase())) continue;
      const stem = m[1].replace(/_$/, '').toLowerCase();
      const cand = [stem, stem + 's', stem + 'es', stem.replace(/y$/, 'ies'), ...[...byName.keys()].filter(n => n.startsWith(stem) && n.length - stem.length <= 6)];
      const target = cand.map(n => byName.get(n)).find(x => x && x !== t);
      if (!target) continue;
      const idCol = target.cols.find(x => x.name.toLowerCase() === 'id') || target.cols.find(x => target.pk.has(x.name.toLowerCase()));
      if (!idCol) continue;
      links.push({ from: t.name, fromCol: c.name, to: target.name, toCol: idCol.name, guessed: true });
    }
  }
  for (const l of links) {
    const t = byName.get(l.from.toLowerCase());
    const col = t.cols.find(c => c.name.toLowerCase() === l.fromCol.toLowerCase());
    l.oneToOne = t.unique.has(l.fromCol.toLowerCase());
    l.optional = !col || col.nullable !== false;   // unknown counts as "can be empty"
  }
  return { tables: info, links };
}

// what a link means, in words: a short title and a few sentences
export function linkWords(l) {
  const A = `<code>${esc(l.to)}</code>`, B = `<code>${esc(l.from)}</code>`;
  const on = `<code>${esc(l.from)}.${esc(l.fromCol)}</code> = <code>${esc(l.to)}.${esc(l.toCol)}</code>`;
  const out = [];
  if (l.guessed) out.push(`This link is a guess from the column name. The database does not say the two tables are linked.`);
  if (l.oneToOne) {
    out.push(`Each row in ${A} has at most one matching row in ${B}, and the other way round.`);
    out.push(`Matched on ${on}. A join never repeats a row.`);
  } else {
    out.push(`Each row in ${A} can have many rows in ${B}. Each row in ${B} belongs to one row in ${A}.`);
    out.push(`Matched on ${on}. In a join, a row from ${A} repeats once for each matching row in ${B}.`);
  }
  if (l.optional) out.push(`<code>${esc(l.fromCol)}</code> can be empty, so a row in ${B} may belong to no row in ${A}.`);
  else out.push(`<code>${esc(l.fromCol)}</code> can not be empty, so every row in ${B} belongs to a row in ${A}.`);
  return { title: `${esc(l.to)} <span class="card">1</span> to <span class="card">${l.oneToOne ? '1' : 'many'}</span> ${esc(l.from)}`, lines: out };
}

// used: set of table names in the query; joins: set of "table.column" (lower case) used to join
export function renderSchemaMap(el, schema, { used = new Set(), joins = new Set(), onPick } = {}) {
  const { tables, links } = schema;
  if (!tables.length) { el.innerHTML = '<p class="empty">This database has no tables yet.</p>'; return; }
  // columns of boxes: a table goes one step to the right of every table it points at
  const level = new Map();
  const out = t => links.filter(l => l.from === t && l.to !== t);
  const lv = (t, seen = new Set()) => {
    if (level.has(t)) return level.get(t);
    if (seen.has(t)) return 0;
    seen.add(t);
    const v = Math.max(0, ...out(t).map(l => lv(l.to, seen) + 1));
    level.set(t, v); return v;
  };
  tables.forEach(t => lv(t.name));
  const cols = [];
  for (const t of tables) { const k = level.get(t.name); (cols[k] = cols[k] || []).push(t); }
  const keyLinks = new Map(); // "table.col" -> link, for the column labels
  for (const l of links) keyLinks.set((l.from + '.' + l.fromCol).toLowerCase(), l);
  const box = t => {
    const u = used.has(t.name);
    const rows = t.cols.map(c => {
      const k = (t.name + '.' + c.name).toLowerCase();
      const l = keyLinks.get(k);
      const isPk = t.pk.has(c.name.toLowerCase());
      const j = joins.has(k);
      return `<li data-col="${esc(k)}" class="${j ? 'join' : ''}"><span class="mc">${esc(c.name)}</span><span class="mt">${isPk ? '<b>key</b> ' : ''}${l ? `→ ${esc(l.to)}${l.guessed ? ' (guessed)' : ''}` : esc(String(c.type || '').toLowerCase())}</span></li>`;
    }).join('');
    return `<div class="mbox${u ? ' used' : ''}" data-t="${esc(t.name)}"><button type="button" class="mhead" data-t="${esc(t.name)}">${esc(t.name)}${u ? '<small>in query</small>' : ''}</button><ul>${rows}</ul></div>`;
  };
  const rel = links.map((l, i) => { const w = linkWords(l); return `<li data-i="${i}" tabindex="0"><b>${w.title}</b>${w.lines.map(x => `<span>${x}</span>`).join('')}</li>`; }).join('');
  el.innerHTML = `<div class="map"><svg class="map-lines" aria-hidden="true"></svg>${cols.map(c => `<div class="mcol">${(c || []).map(box).join('')}</div>`).join('')}</div>
    <div class="map-key">${links.length ? `<span><svg viewBox="0 0 44 14" aria-hidden="true"><path d="M0,7 H44 M12,7 L0,1 M12,7 L0,13 M32,1 V13"/></svg> the crow's foot is the <b>many</b> side, the bar is the <b>1</b> side</span>
      <span><svg viewBox="0 0 44 14" aria-hidden="true"><path d="M0,7 H44"/></svg> a link the database knows about</span>
      <span><svg viewBox="0 0 44 14" aria-hidden="true"><path class="guess" d="M0,7 H44"/></svg> a guess from a column name</span>` : '<span>No links between tables were found.</span>'}
      <span>Click a table name to see its rows.</span></div>
    ${links.length ? `<h3 class="rel-head">What the links mean</h3><ol class="rel-list">${rel}</ol>` : ''}`;
  const map = el.querySelector('.map'), svg = el.querySelector('.map-lines');
  const draw = () => {
    const mr = map.getBoundingClientRect();
    const sc = map.offsetWidth ? mr.width / map.offsetWidth : 1;   // page zoom
    svg.setAttribute('width', map.scrollWidth); svg.setAttribute('height', map.scrollHeight);
    const at = (t, c) => map.querySelector(`.mbox[data-t="${CSS.escape(t)}"] li[data-col="${CSS.escape((t + '.' + c).toLowerCase())}"]`);
    let paths = '';
    for (const l of links) {
      const a = at(l.from, l.fromCol), b = at(l.to, l.toCol);
      if (!a || !b) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const ay = (ra.top + ra.height / 2 - mr.top) / sc, by = (rb.top + rb.height / 2 - mr.top) / sc;
      let ax, bx, dir;
      if (rb.right <= ra.left) { ax = (ra.left - mr.left) / sc; bx = (rb.right - mr.left) / sc; dir = -1; }
      else if (ra.right <= rb.left) { ax = (ra.right - mr.left) / sc; bx = (rb.left - mr.left) / sc; dir = 1; }
      else { ax = (ra.right - mr.left) / sc; bx = (rb.right - mr.left) / sc; dir = 0; }
      // which way is "out of the box" at each end
      const aw = dir === -1 ? -1 : 1, bw = dir === 1 ? -1 : 1;
      const bend = dir === 0 ? 48 : Math.max(30, Math.abs(bx - ax) / 2);
      const c1 = ax + aw * bend, c2 = bx + bw * bend;
      const joined = joins.has((l.from + '.' + l.fromCol).toLowerCase()) || joins.has((l.to + '.' + l.toCol).toLowerCase());
      const hot = joined && used.has(l.from) && used.has(l.to);
      const many = l.oneToOne
        ? `M${ax + aw * 9},${ay - 6} V${ay + 6}`
        : `M${ax + aw * 13},${ay} L${ax},${ay - 6} M${ax + aw * 13},${ay} L${ax},${ay + 6} M${ax + aw * 13},${ay} L${ax},${ay}`;
      const one = `M${bx + bw * 9},${by - 6} V${by + 6}`;
      // the word goes on the side of the line away from where the curve heads, so they do not cross
      const lab = (x, y, w, t, other) => `<text x="${x + w * 17}" y="${other < y - 2 ? y + 15 : y - 6}" text-anchor="${w > 0 ? 'start' : 'end'}">${t}</text>`;
      paths += `<g data-i="${links.indexOf(l)}" class="${l.guessed ? 'guess' : ''}${hot ? ' hot' : ''}">
        <path class="line" d="M${ax},${ay} C${c1},${ay} ${c2},${by} ${bx},${by}"/><path class="end" d="${many}"/><path class="end" d="${one}"/>
        ${lab(ax, ay, aw, l.oneToOne ? '1' : 'many', by)}${lab(bx, by, bw, '1', ay)}</g>`;
    }
    svg.innerHTML = paths;
  };
  requestAnimationFrame(draw);
  el.querySelectorAll('.mhead').forEach(b => b.addEventListener('click', () => onPick && onPick(b.dataset.t)));
  // pointing at a sentence lights up its line, and the other way round
  const mark = (i, on) => { svg.querySelectorAll(`g[data-i="${i}"]`).forEach(g => g.classList.toggle('on', on)); el.querySelectorAll(`.rel-list li[data-i="${i}"]`).forEach(x => x.classList.toggle('on', on)); };
  el.querySelectorAll('.rel-list li').forEach(li => {
    for (const [ev, on] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) li.addEventListener(ev, () => mark(li.dataset.i, on));
  });
  return draw;
}
