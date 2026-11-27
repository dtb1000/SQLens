// Suggestions for the dropdown under the cursor: table names after FROM or JOIN, column names
// elsewhere, the columns of one table after "alias.", plus keywords and common functions.
// Close misspellings are offered too ("emploees" suggests employees), so it also works as autocorrect.
import { tokenize, setDepth, parseQuery, statementAt } from './sql-parse.js';

const KEYWORDS = ['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'NULL', 'IS NULL', 'IS NOT NULL', 'IN', 'LIKE', 'BETWEEN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'AS', 'JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'ON', 'USING', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'ASC', 'DESC', 'DISTINCT', 'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT', 'WITH', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'EXISTS', 'OVER', 'PARTITION BY'];
const FUNCTIONS = ['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'ROUND', 'ABS', 'COALESCE', 'NULLIF', 'LOWER', 'UPPER', 'LENGTH', 'TRIM', 'SUBSTR', 'REPLACE', 'CAST', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE'];
const TABLE_AFTER = new Set(['FROM', 'JOIN', 'INTO', 'UPDATE', 'TABLE']);

// Levenshtein distance, stopping early once it is clearly too far
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1] && i > 1 && j > 1) cur[j] = Math.min(cur[j], prev[j - 2] + 1);
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// ctx: { tables: [names], columns: name -> [{name, type}] or undefined while loading }
// Returns { from, to, items: [{ text, kind, detail, fix }] } or null.
export function suggest(src, pos, ctx, { manual = false } = {}) {
  let s = pos;
  while (s > 0 && /[A-Za-z0-9_$]/.test(src[s - 1])) s--;
  const prefix = src.slice(s, pos);
  const after = src[pos] || '';
  if (/[A-Za-z0-9_$]/.test(after)) return null;           // cursor in the middle of a word
  const before = src.slice(0, s);
  const inQuote = (before.match(/'/g) || []).length % 2 === 1;
  if (inQuote) return null;
  if (/--[^\n]*$/.test(before)) return null;              // inside a line comment
  if (/^\d/.test(prefix)) return null;
  const dotted = /\.\s*$/.test(before) && /[A-Za-z0-9_"\]`]\.$/.test(before);
  if (!prefix && !dotted && !manual) return null;

  const stmt = statementAt(src, pos);
  const stmtText = stmt ? stmt.text : '';
  const q = stmt ? parseQuery(stmtText) : null;
  const refs = new Map();                                  // alias or table name -> table
  const cte = new Set();
  if (q) {
    for (const f of q.from || []) if (f && f.table) { refs.set(f.table.toLowerCase(), f.table); if (f.refName) refs.set(f.refName.toLowerCase(), f.table); }
    if (q.target) { refs.set(q.target.toLowerCase(), q.target); if (q.targetAlias) refs.set(q.targetAlias.toLowerCase(), q.target); }
    const T = setDepth(tokenize(stmtText, false));
    for (let i = 0; i < T.length - 2; i++) if ((T[i].k === 'word' || T[i].k === 'id') && T[i + 1].k === 'word' && T[i + 1].u === 'AS' && T[i + 2].k === '(' && (T[i - 1]?.u === 'WITH' || T[i - 1]?.k === ',' || T[i - 1]?.u === 'RECURSIVE')) cte.add(T[i].k === 'id' ? T[i].v : T[i].v);
  }
  const findTable = name => ctx.tables.find(t => t.toLowerCase() === String(name).toLowerCase());
  const colsOf = t => (ctx.columns(t) || []).map(c => ({ text: c.name, kind: 'column', detail: `${t}${c.type ? ' · ' + String(c.type).toLowerCase() : ''}` }));

  let pool;
  if (dotted) {
    const m = before.match(/([A-Za-z0-9_$]+|"[^"]+"|\[[^\]]+\]|`[^`]+`)\s*\.\s*$/);
    const q1 = m ? m[1].replace(/^["\[`]|["\]`]$/g, '') : '';
    const t = refs.get(q1.toLowerCase()) || findTable(q1);
    if (!t || !findTable(t)) return null;
    pool = colsOf(findTable(t));
  } else {
    const prevWord = (before.match(/([A-Za-z_]+)\s*$/) || [])[1];
    const pw = prevWord ? prevWord.toUpperCase() : '';
    if (TABLE_AFTER.has(pw)) {
      pool = [...ctx.tables.map(t => ({ text: t, kind: 'table', detail: 'table' })), ...[...cte].map(c => ({ text: c, kind: 'table', detail: 'from WITH' }))];
    } else {
      const used = [...new Set(refs.values())].map(findTable).filter(Boolean);
      const cols = [];
      const seen = new Set();
      for (const t of used) for (const c of colsOf(t)) { const k = c.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); cols.push(c); } }
      // with no table yet, still offer every column so a SELECT list can be typed first
      if (!used.length) for (const t of ctx.tables) for (const c of colsOf(t)) { const k = c.text.toLowerCase(); if (!seen.has(k)) { seen.add(k); cols.push(c); } }
      const aliases = [...refs.keys()].filter(a => !findTable(a)).map(a => ({ text: a, kind: 'alias', detail: `means ${refs.get(a)}` }));
      pool = [...cols, ...aliases,
        ...ctx.tables.map(t => ({ text: t, kind: 'table', detail: 'table' })),
        ...FUNCTIONS.map(f => ({ text: f, kind: 'function', detail: 'function', call: true })),
        ...KEYWORDS.map(k => ({ text: k, kind: 'keyword', detail: 'keyword' }))];
    }
  }
  const p = prefix.toLowerCase();
  const scored = [];
  for (const it of pool) {
    const t = it.text.toLowerCase();
    let score = null, fix = false;
    if (!p) score = 0;
    else if (t === p) score = it.kind === 'keyword' ? -1 : 0.5;
    else if (t.startsWith(p)) score = 1 + (it.kind === 'keyword' ? 0.3 : it.kind === 'function' ? 0.2 : 0);
    else if (t.includes(p) && p.length >= 2) score = 3;
    else if (p.length >= 3 && it.kind !== 'keyword') {
      const d = distance(p, t.slice(0, Math.max(p.length, Math.min(t.length, p.length + 1))), p.length >= 6 ? 2 : 1);
      const dw = distance(p, t, p.length >= 6 ? 2 : 1);
      const best = Math.min(d, dw);
      if (best <= (p.length >= 6 ? 2 : 1)) { score = 5 + best; fix = true; }
    }
    if (score !== null && score >= 0) scored.push({ ...it, fix, score });
  }
  // an exact match for a keyword means the word is finished: no list
  if (p && scored.some(x => x.score === -1 || (x.score === 0.5 && x.text.length === prefix.length)) && scored.filter(x => x.score >= 1).length === 0) return null;
  if (p) scored.sort((a, b) => a.score - b.score || a.text.length - b.text.length || a.text.localeCompare(b.text));
  const items = [];
  const seenText = new Set();
  for (const it of scored) { const k = it.kind + ':' + it.text.toLowerCase(); if (seenText.has(k)) continue; seenText.add(k); items.push(it); if (items.length >= 12) break; }
  if (!items.length) return null;
  // keywords keep the case the user is typing in
  const lower = prefix && prefix === prefix.toLowerCase();
  for (const it of items) if ((it.kind === 'keyword' || it.kind === 'function') && lower) it.insert = it.text.toLowerCase(); else it.insert = it.text;
  for (const it of items) if (it.kind === 'table' || it.kind === 'column') { if (!/^[A-Za-z_][A-Za-z0-9_$]*$/.test(it.text)) it.insert = ctx.qi ? ctx.qi(it.text) : '"' + it.text.replace(/"/g, '""') + '"'; }
  return { from: s, to: pos, prefix, items };
}
