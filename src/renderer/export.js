// Turns a result (column names and rows) into a file: CSV, tab-separated text, Excel, JSON,
// a Markdown table, an HTML table, or SQL INSERT statements. Everything is made here in the
// window; the desktop app only shows the Save dialog and writes the bytes.

export const FORMATS = [
  { id: 'csv', label: 'CSV (comma-separated)', ext: 'csv', filter: 'CSV file' },
  { id: 'xlsx', label: 'Excel workbook', ext: 'xlsx', filter: 'Excel workbook' },
  { id: 'tsv', label: 'Tab-separated text', ext: 'tsv', filter: 'Tab-separated text' },
  { id: 'json', label: 'JSON', ext: 'json', filter: 'JSON file' },
  { id: 'md', label: 'Markdown table', ext: 'md', filter: 'Markdown file' },
  { id: 'html', label: 'HTML table', ext: 'html', filter: 'Web page' },
  { id: 'sql', label: 'SQL INSERT statements', ext: 'sql', filter: 'SQL file' }
];

const plain = v => v === null || v === undefined ? null : (typeof v === 'object' && 'binary' in v) ? `[${v.binary} bytes]` : v;

function delimited(cols, rows, sep) {
  const cell = v => {
    v = plain(v);
    if (v === null) return '';
    const s = String(v);
    return (sep === ',' ? /[",\r\n]/ : /[\t"\r\n]/).test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols, ...rows].map(r => r.map(cell).join(sep)).join('\r\n') + '\r\n';
}
function json(cols, rows) {
  return JSON.stringify(rows.map(r => Object.fromEntries(cols.map((c, i) => [c, plain(r[i])]))), null, 2) + '\n';
}
function markdown(cols, rows) {
  const cell = v => { v = plain(v); return v === null ? '' : String(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' '); };
  const num = i => rows.length && rows.every(r => r[i] === null || typeof r[i] === 'number');
  return [
    '| ' + cols.map(cell).join(' | ') + ' |',
    '| ' + cols.map((_, i) => num(i) ? '---:' : '---').join(' | ') + ' |',
    ...rows.map(r => '| ' + r.map(cell).join(' | ') + ' |')
  ].join('\n') + '\n';
}
const escHtml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function html(cols, rows, title) {
  const cell = v => { v = plain(v); return v === null ? '<td class="null">NULL</td>' : `<td${typeof v === 'number' ? ' class="n"' : ''}>${escHtml(v)}</td>`; };
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px}table{border-collapse:collapse}th,td{border:1px solid #bbb;padding:4px 8px;text-align:left}th{background:#eee}td.n{text-align:right}td.null{color:#8F5E00;font-style:italic}</style>
</head><body>
<table>
<thead><tr>${cols.map(c => `<th>${escHtml(c)}</th>`).join('')}</tr></thead>
<tbody>
${rows.map(r => `<tr>${r.map(cell).join('')}</tr>`).join('\n')}
</tbody>
</table>
</body></html>
`;
}
function inserts(cols, rows, table, qi) {
  const lit = v => { v = plain(v); if (v === null) return 'NULL'; if (typeof v === 'number') return String(v); if (typeof v === 'boolean') return v ? '1' : '0'; return "'" + String(v).replace(/'/g, "''") + "'"; };
  const head = `INSERT INTO ${qi(table)} (${cols.map(qi).join(', ')}) VALUES`;
  return rows.map(r => `${head} (${r.map(lit).join(', ')});`).join('\n') + '\n';
}

/* ---------- Excel (.xlsx): a zip of a few small XML files ---------- */
const enc = new TextEncoder();
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
// a zip with stored (uncompressed) entries, which every spreadsheet program can open
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const u16 = n => [n & 0xFF, (n >>> 8) & 0xFF], u32 = n => [n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF];
  for (const [name, text] of files) {
    const data = enc.encode(text), nm = enc.encode(name), crc = crc32(data);
    const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    const local = Uint8Array.from([...u32(0x04034B50), ...common]);
    parts.push(local, nm, data);
    central.push(Uint8Array.from([...u32(0x02014B50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nm);
    offset += local.length + nm.length + data.length;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = Uint8Array.from([...u32(0x06054B50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0));
  let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}
const xml = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colName = i => { let s = ''; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function xlsx(cols, rows, sheet) {
  const cell = (v, r, c, head) => {
    const ref = colName(c) + (r + 1);
    v = plain(v);
    if (v === null) return '';
    if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${head ? ' s="1"' : ''}><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
  };
  const sheetRows = [cols, ...rows].map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cell(v, ri, ci, ri === 0)).join('')}</row>`).join('');
  const widths = cols.map((c, i) => Math.min(60, Math.max(8, String(c).length + 2, ...rows.slice(0, 200).map(r => String(plain(r[i]) ?? '').length + 2))));
  const name = xml(String(sheet || 'Result').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Result');
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${sheetRows}</sheetData></worksheet>`]
  ]);
}

// returns text or bytes for the chosen format
export function encode(format, cols, rows, { name = 'result', qi = s => '"' + String(s).replace(/"/g, '""') + '"' } = {}) {
  switch (format) {
    case 'csv': return '﻿' + delimited(cols, rows, ',');
    case 'tsv': return delimited(cols, rows, '\t');
    case 'json': return json(cols, rows);
    case 'md': return markdown(cols, rows);
    case 'html': return html(cols, rows, name);
    case 'sql': return inserts(cols, rows, name, qi);
    case 'xlsx': return xlsx(cols, rows, name);
  }
  throw new Error('Unknown format ' + format);
}
