// SQL tokenizer and a forgiving parser. It works on half-typed queries, so the tables can be highlighted while you type.
// It does not try to validate SQL: the database does that when you press Run.
function tokenize(src, keepComments){
  const out = []; let i = 0; const n = src.length;
  while (i < n){
    const c = src[i], s = i;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r'){ i++; continue; }
    if (c === '-' && src[i+1] === '-'){ while (i < n && src[i] !== '\n') i++; if (keepComments) out.push({k:'comment', s, e:i}); continue; }
    if (c === '/' && src[i+1] === '*'){ const e = src.indexOf('*/', i+2); i = e < 0 ? n : e + 2; if (keepComments) out.push({k:'comment', s, e:i}); continue; }
    if (c === "'"){ i++; while (i < n){ if (src[i] === "'"){ if (src[i+1] === "'"){ i += 2; continue; } i++; break; } i++; } out.push({k:'str', s, e:i}); continue; }
    if (c === '"' || c === '`' || c === '['){
      const cl = c === '[' ? ']' : c; i++;
      while (i < n && src[i] !== cl) i++;
      const closed = i < n; if (closed) i++;
      out.push({k:'id', s, e:i, v: src.slice(s+1, closed ? i-1 : i)}); continue;
    }
    if (/[A-Za-z_]/.test(c)){ while (i < n && /[A-Za-z0-9_$]/.test(src[i])) i++; const v = src.slice(s, i); out.push({k:'word', s, e:i, v, u:v.toUpperCase()}); continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i+1] || ''))){ i++; while (i < n && /[0-9.eE]/.test(src[i])) i++; out.push({k:'num', s, e:i}); continue; }
    if ('(),;'.includes(c)){ out.push({k:c, s, e:i+1}); i++; continue; }
    const two = src.slice(i, i+2);
    if (['<=','>=','<>','!=','||','==','<<','>>'].includes(two)){ out.push({k:'op', s, e:i+2, v:two}); i += 2; continue; }
    out.push({k:'op', s, e:i+1, v:c}); i++;
  }
  return out;
}
function setDepth(t){ let d = 0; for (const x of t){ if (x.k === ')') d = Math.max(0, d-1); x.d = d; if (x.k === '(') d++; } return t; }
const isName = t => t && (t.k === 'word' || t.k === 'id');
const isDot = t => t && t.k === 'op' && t.v === '.';
const nameVal = t => t.k === 'id' ? t.v : t.v;
function splitTop(toks, pred){ const parts = [[]]; for (const t of toks){ if (t.d === toks[0]?.d && pred(t)) parts.push([]); else parts[parts.length-1].push(t); } return parts.filter(p => p.length); }
const textOf = (src, toks) => toks.length ? src.slice(toks[0].s, toks[toks.length-1].e) : '';

const HL_KW = new Set(('SELECT FROM WHERE AND OR NOT NULL IS IN LIKE GLOB BETWEEN CASE WHEN THEN ELSE END AS ON JOIN LEFT RIGHT INNER OUTER FULL CROSS NATURAL GROUP BY ORDER HAVING LIMIT OFFSET ASC DESC DISTINCT ALL EXISTS TRUE FALSE USING UNION INTERSECT EXCEPT COLLATE NULLS FIRST LAST CAST INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE VIEW INDEX DROP ALTER ADD COLUMN PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE WITH RECURSIVE OVER PARTITION WINDOW REPLACE RETURNING INTEGER TEXT REAL BLOB NUMERIC IF').split(' '));
const AGG = new Set(['COUNT','SUM','AVG','MIN','MAX','TOTAL','GROUP_CONCAT','STRING_AGG','ARRAY_AGG']);
const NOALIAS = new Set(['END','NULL','TRUE','FALSE','ASC','DESC','CURRENT_DATE','CURRENT_TIME','CURRENT_TIMESTAMP']);
const KW_BEFORE = new Set(['CASE','WHEN','THEN','ELSE','AND','OR','NOT','IS','IN','LIKE','GLOB','AS','DISTINCT','BY','BETWEEN','SELECT','ESCAPE','COLLATE']);
const JMOD = new Set(['NATURAL','LEFT','RIGHT','FULL','OUTER','INNER','CROSS']);

/* ============================== Statement splitting ============================== */
function statements(src){
  const t = setDepth(tokenize(src, false)); const out = []; let start = 0;
  for (const x of t){ if (x.k === ';' && x.d === 0){ out.push({s:start, e:x.s, end:x.e}); start = x.e; } }
  out.push({s:start, e:src.length, end:src.length});
  return out.map(o => ({...o, text: src.slice(o.s, o.e)}));
}
function hasCode(text){ return tokenize(text, false).length > 0; }
function statementAt(src, pos){
  const list = statements(src);
  let idx = list.findIndex(o => pos >= o.s && pos <= o.end);
  if (idx < 0) idx = list.length - 1;
  // cursor after a ';' on an empty tail: use the statement before
  while (idx > 0 && !hasCode(list[idx].text)) idx--;
  if (!hasCode(list[idx].text)) return null;
  const o = list[idx];
  // trim leading whitespace/comments offset for display
  return {text: o.text, s: o.s, e: o.e, index: idx, count: list.filter(x => hasCode(x.text)).length};
}

/* ============================== Parsing ============================== */
function parseQuery(text){
  const T = setDepth(tokenize(text, false));
  const q = {text, T, kind: T[0] && T[0].k === 'word' ? T[0].u : '', cl: {}};
  if (!T.length) return q;
  const marks = [];
  for (let i = 0; i < T.length; i++){
    const t = T[i]; if (t.d !== 0 || t.k !== 'word') continue;
    const nx = T[i+1];
    switch (t.u){
      case 'SELECT': case 'FROM': case 'WHERE': case 'HAVING': case 'LIMIT': case 'WITH': case 'UNION': case 'INTERSECT': case 'EXCEPT': case 'WINDOW': case 'VALUES': case 'SET': case 'RETURNING':
        marks.push({u:t.u, i, b:i+1}); break;
      case 'OFFSET': if (marks.some(m => m.u === 'LIMIT')) marks.push({u:'OFFSET', i, b:i+1}); break;
      case 'GROUP': case 'ORDER': if (nx && nx.u === 'BY'){ marks.push({u:t.u + ' BY', i, b:i+2}); i++; } break;
    }
  }
  marks.forEach((m, j) => {
    const end = j + 1 < marks.length ? marks[j+1].i : T.length;
    const toks = T.slice(m.b, end);
    if (q.cl[m.u]){ q.dup = true; return; }
    q.cl[m.u] = {toks, text: textOf(text, toks), kwStart: T[m.i].s};
  });
  q.compound = q.dup || ['UNION','INTERSECT','EXCEPT'].some(k => q.cl[k]);
  q.hasWith = !!q.cl.WITH;
  q.window = T.some(t => t.k === 'word' && t.u === 'OVER');

  if (q.cl.SELECT) q.items = parseItems(q.cl.SELECT.toks, text, q);
  if (q.cl.FROM && q.kind !== 'DELETE') q.from = parseFrom(q.cl.FROM.toks, text);
  if (q.cl.WHERE) q.whereParts = splitAnd(q.cl.WHERE.toks, text);
  if (q.cl['GROUP BY']) q.groupExprs = splitTop(q.cl['GROUP BY'].toks, t => t.k === ',').map(p => textOf(text, p));
  if (q.cl['ORDER BY']) q.orderTerms = splitTop(q.cl['ORDER BY'].toks, t => t.k === ',').map(p => {
    let dir = 'asc', toks = p.slice();
    while (toks.length > 1){
      const l = toks[toks.length-1];
      if (l.k === 'word' && (l.u === 'ASC' || l.u === 'DESC')){ if (l.u === 'DESC') dir = 'desc'; toks.pop(); continue; }
      if (l.k === 'word' && (l.u === 'FIRST' || l.u === 'LAST') && toks[toks.length-2]?.u === 'NULLS'){ toks.splice(-2); continue; }
      break;
    }
    return {expr: textOf(text, toks), toks, dir};
  });
  q.hasAgg = (q.items || []).some(it => containsAgg(it.toks)) || (q.cl.HAVING ? containsAgg(q.cl.HAVING.toks) : false);
  // write statements
  if (q.kind === 'UPDATE' || q.kind === 'DELETE' || q.kind === 'INSERT' || q.kind === 'REPLACE'){
    let i = 1;
    if (q.kind === 'DELETE' && T[i]?.u === 'FROM') i++;
    if (T[i]?.u === 'OR') i += 2;
    if ((q.kind === 'INSERT' || q.kind === 'REPLACE') && T[i]?.u === 'INTO') i++;
    const parts = [];
    while (isName(T[i])){ parts.push(T[i]); if (isDot(T[i+1])) i += 2; else { i++; break; } }
    if (parts.length){ q.target = nameVal(parts[parts.length-1]); q.targetSql = text.slice(parts[0].s, parts[parts.length-1].e); }
    if (isName(T[i]) && T[i].u === 'AS') i++;
    if (isName(T[i]) && !['SET','WHERE','VALUES','SELECT','DEFAULT'].includes(T[i].u) && T[i].k !== '('){ q.targetAlias = nameVal(T[i]); q.targetAliasSql = text.slice(T[i].s, T[i].e); }
    if (q.cl.SET) q.sets = splitTop(q.cl.SET.toks, t => t.k === ',').map(p => {
      const eq = p.findIndex(t => t.k === 'op' && t.v === '=');
      return eq > 0 ? {col: textOf(text, p.slice(0, eq)), colName: nameVal(p[eq-1]), expr: textOf(text, p.slice(eq+1)), toks: p.slice(eq+1)} : null;
    }).filter(Boolean);
  }
  return q;
}
function containsAgg(toks){
  for (let i = 0; i < toks.length; i++){
    const t = toks[i]; if (!(t.k === 'word' && AGG.has(t.u) && toks[i+1]?.k === '(')) continue;
    // SUM(x) OVER (...) is a window function, not a group aggregate
    let j = i + 2, depth = 1; while (j < toks.length && depth){ if (toks[j].k === '(') depth++; else if (toks[j].k === ')') depth--; j++; }
    if (toks[j]?.k === 'word' && toks[j].u === 'OVER') continue;
    return true;
  }
  return false;
}
function parseItems(toks, text, q){
  if (toks[0] && toks[0].k === 'word' && (toks[0].u === 'DISTINCT' || toks[0].u === 'ALL')){ q.distinct = toks[0].u === 'DISTINCT'; toks = toks.slice(1); }
  // SQL Server: SELECT [DISTINCT] TOP (n) [PERCENT] ...
  if (toks[0] && toks[0].k === 'word' && toks[0].u === 'TOP'){
    let j = 1;
    if (toks[j]?.k === '('){ const d = toks[j].d; j++; while (j < toks.length && !(toks[j].k === ')' && toks[j].d === d)) j++; j++; } else j++;
    if (toks[j]?.u === 'PERCENT') j++;
    if (toks[j]?.u === 'WITH' && toks[j+1]?.u === 'TIES') j += 2;
    q.top = textOf(text, toks.slice(1, j)); toks = toks.slice(j);
  }
  q.itemsText = textOf(text, toks);
  return splitTop(toks, t => t.k === ',').map(p => {
    let ex = p, alias = null; const L = p.length;
    if (L >= 3 && p[L-2].k === 'word' && p[L-2].u === 'AS' && isName(p[L-1])){ alias = nameVal(p[L-1]); ex = p.slice(0, L-2); }
    else if (L >= 2 && isName(p[L-1]) && !(p[L-1].k === 'word' && (NOALIAS.has(p[L-1].u) || KW_BEFORE.has(p[L-1].u))) &&
      ['(',')','word','id','num','str'].includes(p[L-2].k) && p[L-2].k !== '(' && !(p[L-2].k === 'word' && KW_BEFORE.has(p[L-2].u)) && !isDot(p[L-2])){
      alias = nameVal(p[L-1]); ex = p.slice(0, L-1);
    }
    const star = ex.length === 1 && ex[0].k === 'op' && ex[0].v === '*';
    const qualStar = ex.length === 3 && isName(ex[0]) && isDot(ex[1]) && ex[2].v === '*' ? nameVal(ex[0]) : null;
    const plain = (ex.length === 1 && isName(ex[0])) || (ex.length === 3 && isName(ex[0]) && isDot(ex[1]) && isName(ex[2]));
    return {toks: ex, expr: textOf(text, ex), alias, star, qualStar, plain, label: alias || textOf(text, ex)};
  });
}
function parseFrom(toks, text){
  const items = []; let cur = {join:null, src:[], on:[], using:[]}, mode = 'src', mods = [];
  const base = toks[0]?.d ?? 0;
  for (const t of toks){
    if (t.d === base){
      if (t.k === ','){ items.push(cur); cur = {join:',', src:[], on:[], using:[]}; mode = 'src'; mods = []; continue; }
      if (t.k === 'word' && JMOD.has(t.u)){ mods.push(t.u); continue; }
      if (t.k === 'word' && t.u === 'JOIN'){ items.push(cur); cur = {join:[...mods, 'JOIN'].join(' '), src:[], on:[], using:[]}; mods = []; mode = 'src'; continue; }
      if (t.k === 'word' && t.u === 'ON' && mode === 'src'){ mode = 'on'; continue; }
      if (t.k === 'word' && t.u === 'USING' && mode === 'src'){ mode = 'using'; continue; }
    }
    cur[mode].push(t);
  }
  items.push(cur);
  return items.map(it => {
    const s = parseSource(it.src, text);
    if (!s) return null;
    return {...s, join: it.join, on: it.on.length ? textOf(text, it.on) : '', onToks: it.on, using: it.using.length ? textOf(text, it.using) : ''};
  });
}
function parseSource(toks, text){
  if (!toks.length) return null;
  let i = 0, sql, name = null, last = null;
  if (toks[0].k === '('){
    let j = 1; while (j < toks.length && !(toks[j].k === ')' && toks[j].d === toks[0].d)) j++;
    if (j >= toks.length) return null;
    sql = text.slice(toks[0].s, toks[j].e); i = j + 1;
  } else {
    let j = 0; const parts = [];
    while (j < toks.length && isName(toks[j])){ parts.push(toks[j]); if (isDot(toks[j+1])) j += 2; else { j++; break; } }
    if (!parts.length) return null;
    last = parts[parts.length-1];
    sql = text.slice(parts[0].s, last.e); name = nameVal(last); i = j;
  }
  let aliasTok = null;
  if (toks[i] && toks[i].k === 'word' && toks[i].u === 'AS') i++;
  if (isName(toks[i])){ aliasTok = toks[i]; i++; }
  const refTok = aliasTok || last;
  return {
    sql, table: name, subquery: !name,
    ref: refTok ? text.slice(refTok.s, refTok.e) : null,
    refName: refTok ? nameVal(refTok) : null,
    alias: aliasTok ? nameVal(aliasTok) : null,
    weird: i < toks.length
  };
}
function splitAnd(toks, text){
  const base = toks[0]?.d ?? 0;
  if (toks.some(t => t.d === base && t.k === 'word' && t.u === 'OR')) return [textOf(text, toks)];
  const parts = [[]]; let between = false;
  for (const t of toks){
    if (t.d === base && t.k === 'word' && t.u === 'BETWEEN') between = true;
    if (t.d === base && t.k === 'word' && t.u === 'AND'){ if (between){ between = false; } else { parts.push([]); continue; } }
    parts[parts.length-1].push(t);
  }
  return parts.filter(p => p.length).map(p => textOf(text, p));
}
// column references inside a token list: [{qual, name}]
function columnRefs(toks){
  const refs = [];
  for (let i = 0; i < toks.length; i++){
    const t = toks[i];
    if (!isName(t)) continue;
    if (t.k === 'word' && toks[i+1]?.k === '(') continue; // function
    if (isDot(toks[i+1]) && isName(toks[i+2])){ refs.push({qual: nameVal(t), name: nameVal(toks[i+2])}); i += 2; continue; }
    if (isDot(toks[i+1]) && toks[i+2]?.v === '*'){ refs.push({qual: nameVal(t), name: '*'}); i += 2; continue; }
    if (isDot(toks[i-1])) continue;
    refs.push({qual: null, name: nameVal(t)});
  }
  return refs;
}


export { tokenize, setDepth, isName, isDot, nameVal, splitTop, textOf, HL_KW, AGG, statements, statementAt, parseQuery, containsAgg, columnRefs };
