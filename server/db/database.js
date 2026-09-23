/**
 * database.js
 * Uses sql.js (pure JS SQLite — no native compilation required), same
 * pattern as alis-hub's server/db/database.js. DB persisted to disk
 * manually on every write via saveToDisk().
 *
 * Only table so far is `decisions` — the durable decision log (view #6 in
 * docs/CONTEXT.md). The other views either aren't built yet or don't need
 * persisted state (Contract Truth is a live on-demand HubSpot lookup, not
 * cached — see server/api/accounts.js).
 */

const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'product-ops.sqlite');

let db;

async function initDb() {
  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
    console.log('DB loaded from disk:', DB_PATH);
  } else {
    db = new SQL.Database();
    console.log('DB created (new):', DB_PATH);
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS decisions (
      id            TEXT PRIMARY KEY,
      subject       TEXT NOT NULL,
      outcome       TEXT NOT NULL,
      evidence      TEXT,
      decided_by    TEXT NOT NULL,
      decided_at    TEXT NOT NULL,
      related_url   TEXT,
      created_at    TEXT DEFAULT (datetime('now'))
    );
  `);

  // Generic "one row per metric per scope per day" snapshot table — same
  // shape as alis-hub's kpi_metric_history (server/db/database.js there),
  // ported since it already solves "trending" for exactly this kind of
  // portfolio-aggregate number without needing a scheduled job: a point is
  // captured as a side effect every time the Dashboard loads/refreshes
  // (see server/api/export.js), not on a cron. `scope` distinguishes what
  // kind of thing `scope_key` names — 'tier' (scope_key = 'Tier 1'..
  // 'Tier 4'/'Unassigned'), 'portfolio' (scope_key always 'portfolio'), or
  // 'arr_band' (scope_key = a band label like "$10k-25k") — so one table
  // covers every breakdown this app needs instead of one table per chart.
  db.run(`
    CREATE TABLE IF NOT EXISTS kpi_metric_history (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      scope          TEXT NOT NULL,
      scope_key      TEXT NOT NULL,
      metric_key     TEXT NOT NULL,
      recorded_date  TEXT NOT NULL,
      value          REAL NOT NULL,
      created_at     TEXT DEFAULT (datetime('now'))
    );
  `);
  db.run(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_kpi_metric_history_daily
    ON kpi_metric_history(scope, scope_key, metric_key, recorded_date);
  `);

  return db;
}

function saveToDisk() {
  const buf = Buffer.from(db.export());
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, buf);
}

function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  const result = [];
  stmt.bind(params);
  while (stmt.step()) result.push(stmt.getAsObject());
  stmt.free();
  return result;
}

function run(sql, params = []) {
  db.run(sql, params);
  saveToDisk();
}

function listDecisions() {
  return queryAll('SELECT * FROM decisions ORDER BY decided_at DESC');
}

function addDecision({ id, subject, outcome, evidence, decidedBy, decidedAt, relatedUrl }) {
  run(
    `INSERT INTO decisions (id, subject, outcome, evidence, decided_by, decided_at, related_url) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, subject, outcome, evidence || null, decidedBy, decidedAt, relatedUrl || null]
  );
}

function deleteDecision(id) {
  run('DELETE FROM decisions WHERE id = ?', [id]);
}

/**
 * Records today's value for each {scope, scopeKey, metricKey} row, one
 * point per calendar day — same delete-then-insert "upsert" as alis-hub's
 * recordKpiMetricSnapshots, backed by the table's UNIQUE index. Refreshing
 * the dashboard multiple times in one day overwrites that day's point
 * rather than accumulating duplicates.
 */
function recordKpiMetricSnapshots(rows) {
  const today = new Date().toISOString().slice(0, 10);
  for (const r of rows) {
    db.run('DELETE FROM kpi_metric_history WHERE scope = ? AND scope_key = ? AND metric_key = ? AND recorded_date = ?', [r.scope, r.scopeKey, r.metricKey, today]);
    db.run('INSERT INTO kpi_metric_history (scope, scope_key, metric_key, recorded_date, value) VALUES (?, ?, ?, ?, ?)', [r.scope, r.scopeKey, r.metricKey, today, r.value]);
  }
  saveToDisk();
}

/** Every recorded point for a given scope (e.g. every tier's every metric, across every captured day) — the caller groups/filters client-side rather than this needing a param per axis. */
function getKpiMetricHistory(scope, limit = 3660) {
  return queryAll(
    'SELECT scope_key, metric_key, recorded_date, value FROM kpi_metric_history WHERE scope = ? ORDER BY recorded_date ASC LIMIT ?',
    [scope, limit]
  );
}

module.exports = { initDb, listDecisions, addDecision, deleteDecision, recordKpiMetricSnapshots, getKpiMetricHistory };
