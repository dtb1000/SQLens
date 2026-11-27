// SQLite through sql.js (WebAssembly), so no native build step is needed.
// Opens the built-in sample, or a .sqlite/.db file. Changes to a file are written back after each statement.
const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const SAMPLES = require('../samples');

let SQL = null;
async function load() {
  if (!SQL) SQL = await initSqlJs({ locateFile: f => path.join(path.dirname(require.resolve('sql.js')), f) });
  return SQL;
}

async function connect(cfg) {
  const S = await load();
  const file = cfg.file && cfg.file.trim();
  let db;
  if (file) db = fs.existsSync(file) ? new S.Database(fs.readFileSync(file)) : new S.Database();
  const seed = SAMPLES[cfg.sample] || SAMPLES.company;
  const NAMES = { company: 'Sample: company', school: 'Sample: school', library: 'Sample: library' };
  if (!file) { db = new S.Database(); db.exec(seed); }
  const persist = () => { if (file) fs.writeFileSync(file, Buffer.from(db.export())); };

  return {
    label: file ? path.basename(file) : NAMES[cfg.sample] || NAMES.company,
    async query(sql, max) {
      const st = db.prepare(sql);
      try {
        const cols = st.getColumnNames(); const rows = []; let total = 0;
        while (st.step()) { total++; if (max == null || rows.length < max) rows.push(st.get()); }
        return { cols, rows, total };
      } finally { st.free(); }
    },
    async run(sql) { db.run(sql); const n = db.getRowsModified(); persist(); return n; },
    async tables() {
      const st = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY name");
      const out = []; while (st.step()) out.push(st.get()[0]); st.free(); return out;
    },
    async columns(table) {
      const st = db.prepare(`PRAGMA table_info("${String(table).replace(/"/g, '""')}")`);
      const out = [];
      while (st.step()) {
        const r = st.get(), type = r[2] || '';
        // SQLite keeps sizes only as part of the declared type, for example VARCHAR(50) or DECIMAL(10,2)
        const m = /\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/.exec(type);
        const textLike = /char|text|clob/i.test(type);
        out.push({ name: r[1], type, length: m && textLike ? +m[1] : null, precision: m && !textLike ? +m[1] : null, scale: m && m[2] != null ? +m[2] : null,
          nullable: !(r[3] || r[5]), default: r[4] == null ? null : String(r[4]) });
      }
      st.free(); return out;
    },
    async uniques(table) {
      const q = s => `"${String(s).replace(/"/g, '""')}"`;
      const st = db.prepare(`PRAGMA index_list(${q(table)})`);
      const idx = []; while (st.step()) { const r = st.getAsObject(); if (r.unique) idx.push(r.name); } st.free();
      const out = [];
      for (const name of idx) {
        const s2 = db.prepare(`PRAGMA index_info(${q(name)})`);
        const cols = []; while (s2.step()) cols.push(s2.getAsObject().name); s2.free();
        if (cols.every(Boolean)) out.push(cols);
      }
      return out;
    },
    async primaryKey() { return ['rowid']; },
    async foreignKeys(table) {
      const st = db.prepare(`PRAGMA foreign_key_list("${String(table).replace(/"/g, '""')}")`);
      const out = []; while (st.step()) { const r = st.getAsObject(); out.push({ col: r.from, refTable: r.table, refCol: r.to || null }); } st.free(); return out;
    },
    async reset() { if (!file) { db.close(); db = new S.Database(); db.exec(seed); return true; } return false; },
    async close() { persist(); db.close(); }
  };
}
module.exports = { connect };
