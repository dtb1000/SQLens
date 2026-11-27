// The Details view of a table: what each column holds in plain words (its type, size, whether it
// can be empty, its default and its key), and how the table links to others, with counts from
// the data itself so "one to many" can be checked against real rows.
import { linkWords } from './schema-map.js';

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n = x => Number(x).toLocaleString('en-GB');
const plural = (k, one, many) => `${n(k)} ${k === 1 ? one : (many || one + 's')}`;

// what a column holds, in words, from the type name and the sizes the database reports
export function holds(c) {
  const t = String(c.type || '').toLowerCase();
  const len = c.length, p = c.precision, s = c.scale;
  const chars = len === -1 ? ', no set limit' : len ? `, up to ${plural(len, 'character')}` : '';
  if (/^(char|nchar|character)\b(?! varying)/.test(t) || /^(char|nchar)\(/.test(t)) return `text${len ? `, exactly ${plural(len, 'character')} (padded with spaces)` : ''}`;
  if (/char|text|clob|string|citext/.test(t)) return 'text' + chars;
  if (/bool|^bit$/.test(t)) return 'true or false';
  if (/timestamp|datetime/.test(t)) return 'date and time' + (/zone|tz|offset/.test(t) ? ', with time zone' : '');
  if (/^date$/.test(t)) return 'date';
  if (/^time/.test(t)) return 'time of day';
  if (/interval/.test(t)) return 'length of time';
  if (/uuid|uniqueidentifier/.test(t)) return 'unique ID (UUID)';
  if (/json/.test(t)) return 'JSON document';
  if (/xml/.test(t)) return 'XML document';
  if (/blob|binary|bytea|raw|image/.test(t)) return 'binary data (files, images)' + (len && len > 0 ? `, up to ${n(len)} bytes` : '');
  if (/money/.test(t)) return 'amount of money';
  if (/int|serial/.test(t) && !/interval/.test(t)) return 'whole number' + (/tiny/.test(t) ? ', small' : /small/.test(t) ? ', up to 32,767' : /big/.test(t) ? ', very large' : '');
  if (/dec|numeric|number/.test(t)) {
    if (s === 0 && p) return `whole number, up to ${plural(p, 'digit')}`;
    if (p && s != null) return `exact number, up to ${plural(p, 'digit')} with ${plural(s, 'digit')} after the point`;
    return 'exact number';
  }
  if (/real|float|double/.test(t)) return 'decimal number (approximate)';
  return t ? 'value of type ' + t : 'any value (no type set)';
}

// the size as the database states it: "40", "10, 2" or nothing
function size(c) {
  if (c.length === -1) return 'max';
  if (c.length) return String(c.length);
  if (c.precision != null && /dec|num|number/i.test(c.type || '')) return c.scale != null ? `${c.precision}, ${c.scale}` : String(c.precision);
  return '';
}

// how many rows on each side actually match, read from the data
async function counts(A, l) {
  const q = A.qi.bind(A);
  const child = q(l.from), fk = q(l.fromCol), parent = q(l.to), pk = q(l.toCol);
  const one = async sql => { try { const v = (await A.query(sql)).rows[0][0]; return v == null ? 0 : Number(v); } catch { return null; } };
  const [parents, withKids, most, empty] = await Promise.all([
    one(`SELECT COUNT(*) FROM ${parent}`),
    one(`SELECT COUNT(*) FROM ${parent} p WHERE EXISTS (SELECT 1 FROM ${child} c WHERE c.${fk} = p.${pk})`),
    one(`SELECT MAX(k) FROM (SELECT COUNT(*) AS k FROM ${child} WHERE ${fk} IS NOT NULL GROUP BY ${fk}) x`),
    one(`SELECT COUNT(*) FROM ${child} WHERE ${fk} IS NULL`)
  ]);
  return { parents, withKids, most, empty };
}

// el: where to draw; schema from loadSchema; names: the tables to describe; rowCount(t) -> number
export async function renderDetails(el, A, schema, names, rowCount) {
  const byName = new Map(schema.tables.map(t => [t.name.toLowerCase(), t]));
  const blocks = [];
  for (const name of names) {
    const t = byName.get(String(name).toLowerCase());
    if (!t) continue;
    const total = await rowCount(t.name);
    const mine = schema.links.filter(l => l.from === t.name || l.to === t.name);
    const outLink = c => schema.links.find(l => l.from === t.name && l.fromCol.toLowerCase() === c.name.toLowerCase());
    const inLinks = c => schema.links.filter(l => l.to === t.name && l.toCol.toLowerCase() === c.name.toLowerCase());
    const rows = t.cols.map(c => {
      const k = c.name.toLowerCase(), keys = [];
      if (t.pk.has(k)) keys.push('<span class="kb kb-pk">key</span>');
      else if (t.unique.has(k)) keys.push('<span class="kb">unique</span>');
      const o = outLink(c);
      if (o) keys.push(`<span class="kb kb-fk">links to ${esc(o.to)}.${esc(o.toCol)}${o.guessed ? ' (guessed)' : ''}</span>`);
      for (const l of inLinks(c)) keys.push(`<span class="kb">used by ${esc(l.from)}.${esc(l.fromCol)}</span>`);
      const nul = c.nullable === true ? 'yes' : c.nullable === false ? '<b>no</b>' : '<span class="muted">not known</span>';
      return `<tr><td class="mono"><b>${esc(c.name)}</b></td><td class="mono">${esc(String(c.type || '').toLowerCase()) || '<span class="muted">none</span>'}</td>
        <td>${esc(holds(c))}</td><td class="mono n">${esc(size(c))}</td><td>${nul}</td><td class="mono">${c.default == null ? '' : esc(c.default)}</td><td>${keys.join(' ')}</td></tr>`;
    }).join('');
    let rel = '';
    if (mine.length) {
      const items = [];
      for (const l of mine) {
        const w = linkWords(l);
        let fact = '';
        const big = (await rowCount(l.from)) > 200000;
        if (!big) {
          const c = await counts(A, l);
          const bits = [];
          if (c.parents != null && c.withKids != null) bits.push(`${n(c.withKids)} of ${plural(c.parents, 'row')} in <code>${esc(l.to)}</code> have a match in <code>${esc(l.from)}</code>`);
          if (c.most != null && c.most > 0) bits.push(`the most for one row is ${n(c.most)}`);
          if (c.empty) bits.push(`${plural(c.empty, 'row')} in <code>${esc(l.from)}</code> ${c.empty === 1 ? 'has' : 'have'} no match because <code>${esc(l.fromCol)}</code> is empty`);
          if (bits.length) fact = `<span class="fact">In the data now: ${bits.join(', ')}.</span>`;
        }
        items.push(`<li><b>${w.title}</b>${w.lines.map(x => `<span>${x}</span>`).join('')}${fact}</li>`);
      }
      rel = `<h4>How it links to other tables</h4><ol class="rel-list">${items.join('')}</ol>`;
    } else rel = '<h4>How it links to other tables</h4><p class="muted">No links to other tables were found.</p>';
    blocks.push(`<div class="tblock details"><div class="tblock-head"><h3>${esc(t.name)}</h3><span class="notice">${plural(total, 'row')}, ${plural(t.cols.length, 'column')}</span></div>
      <div class="tbl-wrap"><table class="dt meta"><thead><tr><th>Column</th><th>Type</th><th>What it holds</th><th class="n">Size</th><th>Can be empty</th><th>Default</th><th>Key</th></tr></thead><tbody>${rows}</tbody></table></div>
      ${rel}</div>`);
  }
  el.innerHTML = blocks.join('') || '<p class="empty">This database has no tables yet.</p>';
}
