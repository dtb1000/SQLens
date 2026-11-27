// What differs between databases, as far as the step engine is concerned.
// The parser and the step views are shared; only these small SQL snippets change.
//   qi(name)               quote an identifier
//   top(select, from, n)   first n rows of SELECT <select> FROM <from>
//   temp(k)                name for the k-th temporary table
//   createTemp(name, sql)  make a temporary table from a SELECT
//   createTempWith(...)    optional: the same for a WITH query, where createTemp's shape does not work
//   dropTemp(name)         remove it again
//   rowNumber              a row-number expression that needs no ORDER BY from the user
//   scalar(expr)           evaluate one expression with no table
const dq = s => '"' + String(s).replace(/"/g, '""') + '"';

export const DIALECTS = {
  sqlite: {
    label: 'SQLite', qi: dq,
    top: (sel, from, n) => `SELECT ${sel} FROM ${from} LIMIT ${n}`,
    temp: k => `sw_s${k}`,
    createTemp: (name, sql) => `CREATE TEMP TABLE ${name} AS ${sql}`,
    dropTemp: name => `DROP TABLE IF EXISTS temp.${name}`,
    rowNumber: 'ROW_NUMBER() OVER ()',
    scalar: e => `SELECT ${e}`,
    defaults: {}
  },
  postgres: {
    label: 'PostgreSQL', qi: dq,
    top: (sel, from, n) => `SELECT ${sel} FROM ${from} LIMIT ${n}`,
    temp: k => `sw_s${k}`,
    createTemp: (name, sql) => `CREATE TEMP TABLE ${name} AS ${sql}`,
    dropTemp: name => `DROP TABLE IF EXISTS ${name}`,
    rowNumber: 'ROW_NUMBER() OVER ()',
    scalar: e => `SELECT ${e}`,
    defaults: { port: 5432, user: 'postgres', database: 'postgres' }
  },
  mysql: {
    label: 'MySQL / MariaDB', qi: s => '`' + String(s).replace(/`/g, '``') + '`',
    top: (sel, from, n) => `SELECT ${sel} FROM ${from} LIMIT ${n}`,
    temp: k => `sw_s${k}`,
    createTemp: (name, sql) => `CREATE TEMPORARY TABLE ${name} AS ${sql}`,
    dropTemp: name => `DROP TEMPORARY TABLE IF EXISTS ${name}`,
    rowNumber: 'ROW_NUMBER() OVER ()',
    scalar: e => `SELECT ${e}`,
    defaults: { port: 3306, user: 'root' }
  },
  sqlserver: {
    label: 'SQL Server', qi: s => '[' + String(s).replace(/]/g, ']]') + ']',
    top: (sel, from, n) => `SELECT TOP ${n} ${sel} FROM ${from}`,
    temp: k => `#sw_s${k}`,
    createTemp: (name, sql) => `SELECT * INTO ${name} FROM (${sql}) sw_t`,
    // SQL Server does not allow WITH inside FROM (...), so the INTO goes on the outer SELECT
    createTempWith: (name, withPart, cte) => `${withPart} SELECT * INTO ${name} FROM ${cte}`,
    dropTemp: name => `DROP TABLE IF EXISTS ${name}`,
    rowNumber: 'ROW_NUMBER() OVER (ORDER BY (SELECT NULL))',
    scalar: e => `SELECT ${e}`,
    defaults: { port: 1433, user: 'sa', database: 'master' }
  },
  oracle: {
    label: 'Oracle', qi: dq,
    top: (sel, from, n) => `SELECT ${sel} FROM ${from} FETCH FIRST ${n} ROWS ONLY`,
    temp: k => `ORA$PTT_SW_S${k}`,
    createTemp: (name, sql) => `CREATE PRIVATE TEMPORARY TABLE ${name} ON COMMIT PRESERVE DEFINITION AS ${sql}`,
    dropTemp: name => `DROP TABLE ${name}`,
    rowNumber: 'ROW_NUMBER() OVER (ORDER BY NULL)',
    scalar: e => `SELECT ${e} FROM DUAL`,
    defaults: { port: 1521, database: 'FREEPDB1' }
  }
};

// Columns the step engine adds for its own bookkeeping. Oracle upper-cases them, so match either way.
export const isHelperCol = c => /^sw_/i.test(String(c));
export const colIndex = (cols, name) => cols.findIndex(c => String(c).toLowerCase() === String(name).toLowerCase());
