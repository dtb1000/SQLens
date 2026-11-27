// Oracle Database through node-oracledb in Thin mode (pure JavaScript, no Instant Client needed).
// The step views use private temporary tables, which need Oracle 18c or later.
const oracledb = require('oracledb');

async function connect(cfg) {
  const conn = await oracledb.getConnection({
    user: cfg.user, password: cfg.password,
    connectString: cfg.connectString || `${cfg.host || 'localhost'}:${+cfg.port || 1521}/${cfg.database || 'FREEPDB1'}`
  });
  const opts = { outFormat: oracledb.OUT_FORMAT_ARRAY, autoCommit: true };
  return {
    label: `${cfg.user || 'oracle'} on ${cfg.host || 'localhost'}`,
    async query(sql, max) {
      const r = await conn.execute(sql, [], max == null ? opts : { ...opts, maxRows: max + 1 });
      const rows = r.rows || [];
      return { cols: (r.metaData || []).map(m => m.name), rows: max == null ? rows : rows.slice(0, max), total: rows.length };
    },
    async run(sql) { const r = await conn.execute(sql, [], opts); return r.rowsAffected || 0; },
    async tables() { const r = await conn.execute('SELECT table_name FROM user_tables ORDER BY table_name', [], opts); return r.rows.map(x => x[0]); },
    async columns(table) {
      // data_default is a LONG column, so it is left out; char_length is the length in characters
      const r = await conn.execute(`SELECT column_name, data_type, char_length, data_precision, data_scale, nullable
        FROM user_tab_columns WHERE table_name = :t ORDER BY column_id`, [table], opts);
      return r.rows.map(x => ({ name: x[0], type: x[1], length: x[2] ? +x[2] : null, precision: x[3] == null ? null : +x[3],
        scale: x[4] == null ? null : +x[4], nullable: x[5] === 'Y', default: null }));
    },
    async uniques(table) {
      const r = await conn.execute(`SELECT c.constraint_name, cc.column_name FROM user_constraints c JOIN user_cons_columns cc ON c.constraint_name = cc.constraint_name
        WHERE c.constraint_type IN ('P', 'U') AND c.table_name = :t ORDER BY c.constraint_name, cc.position`, [table], opts);
      const g = new Map(); for (const x of r.rows) { if (!g.has(x[0])) g.set(x[0], []); g.get(x[0]).push(x[1]); }
      return [...g.values()];
    },
    async primaryKey(table) {
      const r = await conn.execute(`SELECT cc.column_name FROM user_constraints c JOIN user_cons_columns cc ON c.constraint_name = cc.constraint_name
        WHERE c.constraint_type = 'P' AND c.table_name = :t ORDER BY cc.position`, [table], opts);
      return r.rows.map(x => x[0]);
    },
    async foreignKeys(table) {
      const r = await conn.execute(`SELECT cc.column_name, rc.table_name, rcc.column_name FROM user_constraints c
        JOIN user_cons_columns cc ON c.constraint_name = cc.constraint_name
        JOIN user_constraints rc ON c.r_constraint_name = rc.constraint_name
        JOIN user_cons_columns rcc ON rc.constraint_name = rcc.constraint_name AND rcc.position = cc.position
        WHERE c.constraint_type = 'R' AND c.table_name = :t`, [table], opts);
      return r.rows.map(x => ({ col: x[0], refTable: x[1], refCol: x[2] }));
    },
    async reset() { return false; },
    async close() { await conn.close(); }
  };
}
module.exports = { connect };
