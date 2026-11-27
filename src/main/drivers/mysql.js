// MySQL and MariaDB through mysql2. Needs MySQL 8+ or MariaDB 10.2+ for the step views (they use ROW_NUMBER).
const mysql = require('mysql2/promise');

async function connect(cfg) {
  const conn = await mysql.createConnection({
    host: cfg.host || 'localhost', port: +cfg.port || 3306, database: cfg.database || undefined,
    user: cfg.user || undefined, password: cfg.password || undefined,
    ssl: cfg.ssl ? {} : undefined, decimalNumbers: true, dateStrings: true, multipleStatements: false
  });
  return {
    label: `${cfg.database || 'mysql'} on ${cfg.host || 'localhost'}`,
    async query(sql, max) {
      const [rows, fields] = await conn.query({ sql, rowsAsArray: true });
      if (!Array.isArray(rows)) return { cols: [], rows: [], total: 0 };
      return { cols: (fields || []).map(f => f.name), rows: max == null ? rows : rows.slice(0, max), total: rows.length };
    },
    async run(sql) { const [r] = await conn.query(sql); return r && r.affectedRows || 0; },
    async tables() {
      const [r] = await conn.query("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name");
      return r.map(x => x.t);
    },
    async columns(table) {
      const [r] = await conn.query(`SELECT column_name AS c, data_type AS t, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS sc,
        is_nullable AS n, column_default AS d FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? ORDER BY ordinal_position`, [table]);
      return r.map(x => ({ name: x.c, type: x.t, length: x.len == null ? null : +x.len, precision: x.prec == null ? null : +x.prec,
        scale: x.sc == null ? null : +x.sc, nullable: x.n === 'YES', default: x.d == null ? null : String(x.d) }));
    },
    async uniques(table) {
      const [r] = await conn.query("SELECT index_name AS i, column_name AS c FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND non_unique = 0 ORDER BY index_name, seq_in_index", [table]);
      const g = new Map(); for (const x of r) { if (!g.has(x.i)) g.set(x.i, []); g.get(x.i).push(x.c); }
      return [...g.values()];
    },
    async primaryKey(table) {
      const [r] = await conn.query("SELECT column_name AS c FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND constraint_name = 'PRIMARY' ORDER BY ordinal_position", [table]);
      return r.map(x => x.c);
    },
    async foreignKeys(table) {
      const [r] = await conn.query("SELECT column_name AS c, referenced_table_name AS rt, referenced_column_name AS rc FROM information_schema.key_column_usage WHERE table_schema = DATABASE() AND table_name = ? AND referenced_table_name IS NOT NULL", [table]);
      return r.map(x => ({ col: x.c, refTable: x.rt, refCol: x.rc }));
    },
    async reset() { return false; },
    async close() { await conn.end(); }
  };
}
module.exports = { connect };
