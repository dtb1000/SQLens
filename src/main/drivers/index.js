// Every driver returns the same small interface:
//   query(sql, max) -> { cols, rows (arrays), total }
//   run(sql) -> number of rows changed
//   tables(), columns(table), primaryKey(table), reset(), close()
//   columns() gives { name, type, length, precision, scale, nullable, default } (null where unknown)
//   optional: foreignKeys(table), uniques(table) -> [[column, ...], ...] for unique keys and indexes
// Drivers load lazily, so a missing optional package only affects that one database.
const DRIVERS = {
  sqlite: () => require('./sqlite'),
  postgres: () => require('./postgres'),
  mysql: () => require('./mysql'),
  sqlserver: () => require('./sqlserver'),
  oracle: () => require('./oracle')
};
async function connect(cfg) {
  const load = DRIVERS[cfg.engine];
  if (!load) throw new Error(`Unknown database type: ${cfg.engine}`);
  return load().connect(cfg);
}
module.exports = { connect, engines: Object.keys(DRIVERS) };
