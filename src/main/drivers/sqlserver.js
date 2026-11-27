// Microsoft SQL Server and Azure SQL through mssql (tedious, pure JavaScript).
// The pool is limited to one connection so #temp tables made by the step engine stay visible.
const sql = require('mssql');

async function connect(cfg) {
  const pool = new sql.ConnectionPool({
    server: cfg.host || 'localhost', port: +cfg.port || 1433, database: cfg.database || undefined,
    user: cfg.user || undefined, password: cfg.password || undefined,
    pool: { max: 1, min: 1 },
    options: { encrypt: !!cfg.ssl, trustServerCertificate: true }
  });
  await pool.connect();
  const req = () => { const r = pool.request(); r.arrayRowMode = true; return r; };
  return {
    label: `${cfg.database || 'master'} on ${cfg.host || 'localhost'}`,
    async query(text, max) {
      const r = await req().query(text);
      const rows = r.recordset || [];
      const cols = r.columns && r.columns[0] ? r.columns[0].map(c => c.name) : [];
      return { cols, rows: max == null ? rows : rows.slice(0, max), total: rows.length };
    },
    async run(text) { const r = await pool.request().query(text); return (r.rowsAffected || []).reduce((a, b) => a + b, 0); },
    async tables() {
      const r = await pool.request().query("SELECT TABLE_NAME AS t FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = SCHEMA_NAME() ORDER BY TABLE_NAME");
      return r.recordset.map(x => x.t);
    },
    async columns(table) {
      const r = await pool.request().input('t', sql.NVarChar, table).query(`SELECT COLUMN_NAME AS c, DATA_TYPE AS t, CHARACTER_MAXIMUM_LENGTH AS len,
        NUMERIC_PRECISION AS prec, NUMERIC_SCALE AS sc, IS_NULLABLE AS n, COLUMN_DEFAULT AS d
        FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = SCHEMA_NAME() AND TABLE_NAME = @t ORDER BY ORDINAL_POSITION`);
      // a length of -1 means MAX
      return r.recordset.map(x => ({ name: x.c, type: x.t, length: x.len == null ? null : +x.len, precision: x.prec == null ? null : +x.prec,
        scale: x.sc == null ? null : +x.sc, nullable: x.n === 'YES', default: x.d == null ? null : String(x.d) }));
    },
    async uniques(table) {
      const r = await pool.request().input('t', sql.NVarChar, table).query(`SELECT i.name AS i, COL_NAME(ic.object_id, ic.column_id) AS c
        FROM sys.indexes i JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        WHERE i.object_id = OBJECT_ID(@t) AND i.is_unique = 1 AND ic.is_included_column = 0 ORDER BY i.name, ic.key_ordinal`);
      const g = new Map(); for (const x of r.recordset) { if (!g.has(x.i)) g.set(x.i, []); g.get(x.i).push(x.c); }
      return [...g.values()];
    },
    async primaryKey(table) {
      const r = await pool.request().input('t', sql.NVarChar, table).query(`SELECT k.COLUMN_NAME AS c FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON tc.CONSTRAINT_NAME = k.CONSTRAINT_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_NAME = @t ORDER BY k.ORDINAL_POSITION`);
      return r.recordset.map(x => x.c);
    },
    async foreignKeys(table) {
      const r = await pool.request().input('t', sql.NVarChar, table).query(`SELECT COL_NAME(fc.parent_object_id, fc.parent_column_id) AS c,
        OBJECT_NAME(fc.referenced_object_id) AS rt, COL_NAME(fc.referenced_object_id, fc.referenced_column_id) AS rc
        FROM sys.foreign_key_columns fc WHERE fc.parent_object_id = OBJECT_ID(@t)`);
      return r.recordset.map(x => ({ col: x.c, refTable: x.rt, refCol: x.rc }));
    },
    async reset() { return false; },
    async close() { await pool.close(); }
  };
}
module.exports = { connect };
