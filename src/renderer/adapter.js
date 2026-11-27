// The window's view of the database: the calls the desktop app exposes (window.sqlens),
// plus the dialect, plus a small cache of table and column names so typing stays fast.
import { DIALECTS } from './dialects.js';

export class Adapter {
  constructor(api, engine, label) {
    this.api = api; this.engine = engine; this.label = label;
    this.d = DIALECTS[engine];
    this._tables = null; this._cols = new Map(); this._pk = new Map();
  }
  qi(x) { return this.d.qi(x); }
  query(sql, max) { return this.api.query(sql, max); }
  async run(sql) { this.invalidate(); return this.api.run(sql); }
  // for the step engine's own temporary tables: no cache reset needed
  runQuiet(sql) { return this.api.run(sql); }
  // gen goes up on every change, so a list read before a change can not be cached after it
  invalidate() { this._gen = (this._gen || 0) + 1; this._tables = null; this._cols.clear(); this._pk.clear(); }
  async tables() {
    if (this._tables) return this._tables;
    const g = this._gen, list = await this.api.tables();
    if (g === this._gen) this._tables = list;
    return list;
  }
  async findTable(name) {
    const n = String(name || '').toLowerCase();
    return (await this.tables()).find(t => t.toLowerCase() === n) || null;
  }
  async tableInfo(t) {
    if (this._cols.has(t)) return this._cols.get(t);
    const g = this._gen, cols = await this.api.columns(t);
    if (g === this._gen) this._cols.set(t, cols);
    return cols;
  }
  async foreignKeys(t) { try { return await this.api.foreignKeys(t); } catch { return []; } }
  async uniques(t) { try { return this.api.uniques ? await this.api.uniques(t) : []; } catch { return []; } }
  async primaryKey(t) {
    if (this._pk.has(t)) return this._pk.get(t);
    const g = this._gen, pk = await this.api.primaryKey(t);
    if (g === this._gen) this._pk.set(t, pk);
    return pk;
  }
  async count(from) { return Number((await this.query(`SELECT COUNT(*) FROM ${from}`)).rows[0][0]); }
  top(sel, from, n) { return this.d.top(sel, from, n); }
  async scalar(expr) { return (await this.query(this.d.scalar(expr))).rows[0][0]; }
  // rows of a table with a stable key per row, for before/after comparisons
  async snapshot(table) {
    const pk = await this.primaryKey(table);
    const t = this.qi(table);
    if (pk.length === 1 && pk[0] === 'rowid') {
      const r = await this.query(`SELECT rowid AS sw_key, * FROM ${t} ORDER BY rowid`);
      return { ...r, keyed: true, order: ' ORDER BY rowid', keyOf: row => row[0] };
    }
    if (pk.length) {
      const order = ' ORDER BY ' + pk.map(c => this.qi(c)).join(', ');
      const r = await this.query(`SELECT * FROM ${t}${order}`);
      const idx = pk.map(c => r.cols.findIndex(x => x.toLowerCase() === c.toLowerCase()));
      return { ...r, keyed: true, order, keyOf: row => JSON.stringify(idx.map(i => row[i])) };
    }
    const r = await this.query(`SELECT * FROM ${t}`);
    return { ...r, keyed: false, order: '', keyOf: (row, i) => i };
  }
}
