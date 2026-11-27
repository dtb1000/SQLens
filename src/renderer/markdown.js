// A small Markdown renderer for the user guide: headings, paragraphs, lists, tables,
// fenced code, images, links, bold, italics and inline code. Enough for docs/user-guide.md.
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// other pages of the documentation open online, where GitHub shows them
const DOCS_ONLINE = 'https://github.com/dtb1000/SQLens/blob/main/docs/';
const slug = s => s.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function inline(text, base) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) => `<img alt="${alt}" src="${/^https?:/.test(src) ? src : base + src}">`)
       .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, href) => href.startsWith('#') ? `<a href="${href}" data-local>${t}</a>` : `<a href="${/^https?:/.test(href) ? href : DOCS_ONLINE + href}" target="_blank" rel="noreferrer">${t}</a>`)
       .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
       .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

export function renderMarkdown(md, base = '') {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out = [], toc = [];
  let i = 0;
  const isBlockStart = l => /^(#{1,6}\s|```|\s*[-*]\s|\s*\d+\.\s|\|)/.test(l) || /^!\[/.test(l.trim());
  while (i < lines.length) {
    const l = lines[i];
    if (!l.trim()) { i++; continue; }
    let m;
    if ((m = l.match(/^(#{1,6})\s+(.*)$/))) {
      const level = m[1].length, text = m[2].trim(), id = slug(text);
      toc.push({ level, text, id });
      out.push(`<h${level} id="${id}">${inline(text, base)}</h${level}>`); i++; continue;
    }
    if (l.startsWith('```')) {
      const buf = []; i++;
      while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
      i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue;
    }
    if (l.startsWith('|')) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      out.push(`<table><thead><tr>${head.map(h => `<th>${inline(h, base)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c, base)}</td>`).join('')}</tr>`).join('')}</tbody></table>`);
      continue;
    }
    if ((m = l.match(/^\s*([-*]|\d+\.)\s/))) {
      const ordered = /\d/.test(m[1]); const items = [];
      while (i < lines.length && (m = lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)$/))) {
        let item = m[2]; i++;
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s/.test(lines[i])) item += ' ' + lines[i++].trim();
        items.push(`<li>${inline(item, base)}</li>`);
      }
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`); continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++].trim());
    if (!buf.length) { buf.push(lines[i++].trim()); }
    const text = buf.join(' ');
    out.push(/^!\[[^\]]*\]\([^)]+\)$/.test(text) ? inline(text, base) : `<p>${inline(text, base)}</p>`);
  }
  return { html: out.join('\n'), toc };
}
