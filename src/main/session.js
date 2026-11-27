// Holds the open connection and runs one database call at a time, in order.
// Live highlighting and the step engine both send queries; a queue keeps them from overlapping.
const drivers = require('./drivers');

function toPlain(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return isNaN(v) ? String(v) : v.toISOString().replace('T', ' ').replace(/\.000Z$|Z$/, '');
  if (typeof v === 'bigint') return Number.isSafeInteger(Number(v)) ? Number(v) : String(v);
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { binary: v.length };
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function createSession() {
  let conn = null, engine = null, chain = Promise.resolve();
  const serial = fn => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };
  const need = () => { if (!conn) throw new Error('Not connected to a database.'); return conn; };
  return {
    connect: cfg => serial(async () => {
      if (conn) { try { await conn.close(); } catch {} conn = null; }
      conn = await drivers.connect(cfg); engine = cfg.engine;
      return { engine, label: conn.label };
    }),
    disconnect: () => serial(async () => { if (conn) await conn.close(); conn = null; engine = null; }),
    query: (sql, max) => serial(async () => {
      const r = await need().query(sql, max);
      return { cols: r.cols, rows: r.rows.map(row => row.map(toPlain)), total: r.total };
    }),
    run: sql => serial(() => need().run(sql)),
    tables: () => serial(() => need().tables()),
    columns: t => serial(() => need().columns(t)),
    primaryKey: t => serial(() => need().primaryKey(t)),
    foreignKeys: t => serial(async () => { const c = need(); return c.foreignKeys ? c.foreignKeys(t) : []; }),
    uniques: t => serial(async () => { const c = need(); return c.uniques ? c.uniques(t) : []; }),
    reset: () => serial(() => need().reset()),
    info: () => ({ engine, label: conn ? conn.label : null })
  };
}
module.exports = { createSession };
