// PostgreSQL (and compatible: CockroachDB, Redshift, Supabase, Neon...) through node-postgres.
// One client per connection, so temporary tables made by the step engine stay visible.
const { Client, types } = require('pg');
// Return numbers as numbers where it is safe, so values line up and sort like the user expects.
types.setTypeParser(20, v => (Number.isSafeInteger(+v) ? +v : v));   // int8
types.setTypeParser(1700, v => (Number.isFinite(+v) ? +v : v));             // numeric
types.setTypeParser(700, v => +v); types.setTypeParser(701, v => +v);        // float4, float8

async function connect(cfg) {
  const client = new Client({
    host: cfg.host || 'localhost', port: +cfg.port || 5432, database: cfg.database || undefined,
    user: cfg.user || undefined, password: cfg.password || undefined,
    ssl: cfg.ssl ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();
  const schemaRow = await client.query('SELECT current_schema()');
  const schema = schemaRow.rows[0].current_schema || 'public';
  return {
    label: `${cfg.database || cfg.user || 'postgres'} on ${cfg.host || 'localhost'}`,
    async query(sql, max) {
      const r = await client.query({ text: sql, rowMode: 'array' });
      const res = Array.isArray(r) ? r[r.length - 1] : r;
      const rows = res.rows || [];
      return { cols: (res.fields || []).map(f => f.name), rows: max == null ? rows : rows.slice(0, max), total: rows.length };
    },
    async run(sql) { const r = await client.query(sql); return (Array.isArray(r) ? r[r.length - 1] : r).rowCount || 0; },
    async tables() {
      const r = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name", [schema]);
      return r.rows.map(x => x.table_name);
    },
    async columns(table) {
      const r = await client.query(`SELECT column_name, data_type, character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale,
        is_nullable, column_default FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, table]);
      return r.rows.map(x => ({ name: x.column_name, type: x.data_type, length: x.len == null ? null : +x.len, precision: x.prec == null ? null : +x.prec,
        scale: x.scale == null ? null : +x.scale, nullable: x.is_nullable === 'YES', default: x.column_default }));
    },
    async uniques(table) {
      const r = await client.query(`SELECT tc.constraint_name AS c, kcu.column_name AS col FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type IN ('UNIQUE', 'PRIMARY KEY') AND tc.table_schema = $1 AND tc.table_name = $2 ORDER BY kcu.ordinal_position`, [schema, table]);
      const g = new Map(); for (const x of r.rows) { if (!g.has(x.c)) g.set(x.c, []); g.get(x.c).push(x.col); }
      return [...g.values()];
    },
    async primaryKey(table) {
      const r = await client.query(`SELECT kcu.column_name FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2 ORDER BY kcu.ordinal_position`, [schema, table]);
      return r.rows.map(x => x.column_name);
    },
    async foreignKeys(table) {
      const r = await client.query(`SELECT kcu.column_name AS col, ccu.table_name AS ref_table, ccu.column_name AS ref_col
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name AND tc.table_schema = ccu.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1 AND tc.table_name = $2`, [schema, table]);
      return r.rows.map(x => ({ col: x.col, refTable: x.ref_table, refCol: x.ref_col }));
    },
    async reset() { return false; },
    async close() { await client.end(); }
  };
}
module.exports = { connect };
