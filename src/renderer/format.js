// Lays a query out so it is easier to read: one clause per line, one column per line,
// AND / OR conditions on their own lines, keywords in capitals and subqueries indented.
// It only changes spaces, line breaks and the case of keywords, never the meaning.
import { tokenize, HL_KW } from './sql-parse.js';

const CLAUSE = new Set(['SELECT', 'FROM', 'WHERE', 'HAVING', 'LIMIT', 'OFFSET', 'WINDOW', 'VALUES', 'SET', 'RETURNING', 'WITH', 'UNION', 'INTERSECT', 'EXCEPT', 'MINUS', 'FETCH']);
const PAIR = new Set(['GROUP', 'ORDER', 'PARTITION']);
const JOIN_MOD = new Set(['LEFT', 'RIGHT', 'INNER', 'OUTER', 'FULL', 'CROSS', 'NATURAL']);
const EXTRA_KW = new Set(['TOP', 'PERCENT', 'TIES', 'ROWS', 'RANGE', 'GROUPS', 'PRECEDING', 'FOLLOWING', 'UNBOUNDED', 'CURRENT', 'ROW', 'ONLY', 'NEXT', 'MINUS', 'ILIKE', 'TRUNCATE', 'MERGE', 'MATCHED', 'TO', 'RENAME']);
const FUNCS = new Set(['COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'COALESCE', 'IFNULL', 'NULLIF', 'LOWER', 'UPPER', 'LENGTH', 'ROUND', 'ABS', 'SUBSTR', 'SUBSTRING', 'TRIM', 'CAST', 'ROW_NUMBER', 'RANK', 'DENSE_RANK', 'NTILE', 'LAG', 'LEAD', 'FIRST_VALUE', 'LAST_VALUE', 'DATE', 'STRFTIME', 'NOW', 'CONCAT', 'REPLACE', 'GROUP_CONCAT', 'STRING_AGG', 'TOTAL', 'EXTRACT']);

export function formatSql(src) {
  const toks = tokenize(src, true);
  if (!toks.length) return src;
  const IND = '  ';
  let out = '', depth = 0, lineStart = true;
  // per bracket level: is it a subquery, and are we inside a SELECT list or a WHERE-like list there
  const stack = [{ sub: true, base: 0, mode: '' }];
  const top = () => stack[stack.length - 1];
  const indent = n => IND.repeat(Math.max(0, n));
  const nl = n => { out = out.replace(/[ \t]+$/, ''); out += '\n' + indent(n); lineStart = true; };
  const put = (s, space = true) => { if (!lineStart && space && !/[\s(]$/.test(out)) out += ' '; out += s; lineStart = false; };
  const word = (t, next) => {
    const raw = src.slice(t.s, t.e);
    if (t.k !== 'word') return raw;
    const u = t.u;
    if (HL_KW.has(u) || EXTRA_KW.has(u) || PAIR.has(u)) return u;
    // a function name only when it is called, so a column called total or date keeps its case
    if (FUNCS.has(u) && next && src.slice(next.s, next.e) === '(') return u;
    return raw;
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], prev = toks[i - 1], next = toks[i + 1];
    const lvl = top();
    if (t.k === 'comment') {
      const c = src.slice(t.s, t.e);
      if (c.startsWith('--')) { if (out && !lineStart) out += ' '; out += c; nl(lvl.base + (lvl.mode ? 1 : 0)); }
      else put(c);
      continue;
    }
    if (t.k === ';') { out = out.replace(/\s+$/, ''); out += ';'; if (next) { out += '\n\n'; lineStart = true; } stack.length = 1; Object.assign(stack[0], { mode: '' }); depth = 0; continue; }
    if (t.k === ',') {
      out = out.replace(/\s+$/, ''); out += ',';
      if (lvl.sub && (lvl.mode === 'list' || lvl.mode === 'with')) nl(lvl.base + 1); else { out += ' '; lineStart = false; }
      continue;
    }
    if (t.k === '(') {
      const isSub = next && next.k === 'word' && (next.u === 'SELECT' || next.u === 'WITH');
      const fn = !isSub && prev && ((prev.k === 'word' && (!HL_KW.has(prev.u) || prev.u === 'CAST')) || prev.k === 'id');
      put('(', !fn);
      depth++;
      stack.push({ sub: isSub, base: isSub ? lvl.base + 1 + (lvl.mode ? 1 : 0) : lvl.base, mode: '' });
      if (isSub) nl(top().base);
      lineStart = isSub;
      continue;
    }
    if (t.k === ')') {
      const was = stack.length > 1 ? stack.pop() : top();
      depth = Math.max(0, depth - 1);
      if (was.sub) { nl(top().base + (top().mode ? 1 : 0)); out += ')'; }
      else out = out.replace(/[ \t]+$/, '') + ')';
      lineStart = false;
      continue;
    }
    if (t.k === 'op' && t.v === '.') { out = out.replace(/[ \t]+$/, '') + '.'; lineStart = true; continue; }
    if (prev && prev.k === 'op' && prev.v === '.') { out += word(t, next); lineStart = false; continue; }
    if (t.k === 'word' && lvl.sub) {
      const u = t.u;
      // the start of a clause goes on its own line
      if (CLAUSE.has(u) || (PAIR.has(u) && next && next.u === 'BY' && u !== 'PARTITION')) {
        const first = out.trim() === '' || /\n\s*$/.test(out) || /\($/.test(out.trimEnd());
        if (!first) nl(lvl.base); else if (/\n[ \t]*$/.test(out)) out = out.replace(/\n[ \t]*$/, '\n' + indent(lvl.base));
        const short = shortClause(toks, i, u);
        if (PAIR.has(u)) { put(u + ' BY'); i++; } else {
          put(u);
          if ((u === 'UNION' || u === 'EXCEPT') && next && next.k === 'word' && (next.u === 'ALL' || next.u === 'DISTINCT')) { put(next.u); i++; }
        }
        lvl.mode = ['SELECT', 'GROUP', 'ORDER', 'SET', 'RETURNING'].includes(u) ? 'list' : ['WHERE', 'HAVING', 'FROM'].includes(u) ? 'cond' : u === 'WITH' ? 'with' : '';
        if (u === 'SELECT' && next && next.k === 'word' && (next.u === 'DISTINCT' || next.u === 'ALL')) { put(next.u); i++; }
        if (['UNION', 'INTERSECT', 'EXCEPT', 'MINUS'].includes(u)) nl(lvl.base);
        else if (!short && (lvl.mode === 'list' || lvl.mode === 'cond' || lvl.mode === 'with')) nl(lvl.base + 1);
        continue;
      }
      if (u === 'JOIN' || (JOIN_MOD.has(u) && toks.slice(i, i + 4).some(x => x.k === 'word' && x.u === 'JOIN') && !(prev && prev.k === 'word' && JOIN_MOD.has(prev.u)))) {
        nl(lvl.base);
        put(u);
        lvl.mode = 'cond';
        if (u !== 'JOIN') { while (toks[i + 1] && toks[i + 1].k === 'word' && (JOIN_MOD.has(toks[i + 1].u) || toks[i + 1].u === 'JOIN')) { i++; put(toks[i].u); } }
        continue;
      }
      if (u === 'ON' && lvl.mode === 'cond') { nl(lvl.base + 1); put('ON'); continue; }
      if ((u === 'AND' || u === 'OR') && lvl.mode === 'cond' && !betweenOpen(toks, i, src)) { nl(lvl.base + 1); put(u); continue; }
    }
    const s = t.k === 'word' ? word(t, next) : src.slice(t.s, t.e);
    put(s);
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() + (/;\s*$/.test(src) && !/;$/.test(out.trim()) ? ';' : '') + (src.endsWith('\n') ? '\n' : '');
}

// a clause with one short item stays on one line: "FROM employees", "WHERE id = 3"
function shortClause(toks, i, u) {
  if (u === 'WITH') return false;
  let j = i + 1, d = 0, n = 0, len = 0;
  if (toks[j] && toks[j].u === 'BY') j++;
  for (; j < toks.length; j++) {
    const t = toks[j];
    if (t.k === '(') d++;
    else if (t.k === ')') { if (d === 0) break; d--; }
    else if (t.k === ';' && d === 0) break;
    if (d === 0 && t.k === ',') return false;
    if (d === 0 && t.k === 'word' && (CLAUSE.has(t.u) || t.u === 'JOIN' || JOIN_MOD.has(t.u) || (PAIR.has(t.u) && toks[j + 1] && toks[j + 1].u === 'BY'))) break;
    if (d === 0 && t.k === 'word' && (t.u === 'AND' || t.u === 'OR') && !betweenOpen(toks, j)) return false;
    if (t.k === 'word' && (t.u === 'SELECT' || t.u === 'CASE')) return false;
    n++; len += t.e - t.s + 1;
  }
  return n > 0 && len <= 60;
}

// "x BETWEEN 1 AND 5": that AND belongs to BETWEEN, so it stays on the line
function betweenOpen(toks, i) {
  for (let j = i - 1; j >= 0 && j > i - 8; j--) {
    const t = toks[j];
    if (t.k === 'word' && (t.u === 'AND' || t.u === 'OR' || t.u === 'WHERE' || t.u === 'ON' || t.u === 'HAVING')) return false;
    if (t.k === 'word' && t.u === 'BETWEEN') return true;
  }
  return false;
}
