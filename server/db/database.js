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

  // The one piece of data needed to run a live ALIS admin entitlements
  // check (server/services/alisEntitlements.js) that this app has no
  // automated way to resolve — see that file's doc comment. Entered once
  // per account (singly, via Account Truth's inline editor, or in bulk via
  // its Download/Upload template) and reused on every future check.
  db.run(`
    CREATE TABLE IF NOT EXISTS alis_admin_ids (
      hubspot_company_id   TEXT PRIMARY KEY,
      company_name         TEXT,
      alis_admin_company_id TEXT NOT NULL,
      updated_at           TEXT DEFAULT (datetime('now'))
    );
  `);

  // A different mapping from alis_admin_ids above: the ALIS *subdomain*
  // (e.g. "vivaeast" -> vivaeast.alisonline.com), not the numeric admin
  // Company ID an entitlements check needs. Same "no automated way to
  // resolve it" story as alis_admin_ids, and same alis-hub precedent
  // (its own company_hosts table / CompanyHostMappingButtons) — cached
  // here once imported so re-uploading the same completed template isn't
  // needed every session. Useful on its own (a direct link to the
  // account's ALIS instance) and is what the ALIS Export API's per-
  // subdomain Basic Auth would key off of, if that's ever wired in here.
  db.run(`
    CREATE TABLE IF NOT EXISTS company_hosts (
      hubspot_company_id  TEXT PRIMARY KEY,
      company_name        TEXT,
      company_host        TEXT NOT NULL,
      updated_at          TEXT DEFAULT (datetime('now'))
    );
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

function listAlisAdminIds() {
  return queryAll('SELECT hubspot_company_id, alis_admin_company_id FROM alis_admin_ids');
}

function getAlisAdminId(hubspotCompanyId) {
  const rows = queryAll('SELECT alis_admin_company_id FROM alis_admin_ids WHERE hubspot_company_id = ?', [hubspotCompanyId]);
  return rows[0]?.alis_admin_company_id ?? null;
}

function setAlisAdminId({ hubspotCompanyId, companyName, alisAdminCompanyId }) {
  run(
    `INSERT INTO alis_admin_ids (hubspot_company_id, company_name, alis_admin_company_id, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(hubspot_company_id) DO UPDATE SET company_name = excluded.company_name, alis_admin_company_id = excluded.alis_admin_company_id, updated_at = excluded.updated_at`,
    [hubspotCompanyId, companyName || null, alisAdminCompanyId]
  );
}

/** Bulk upsert for the Download/Upload template flow — one row per {hubspotCompanyId, companyName, alisAdminCompanyId}, skipping any row with no ID or no HubSpot id to key on. */
function bulkSetAlisAdminIds(rows) {
  let imported = 0;
  for (const r of rows) {
    if (!r.alisAdminCompanyId || !r.hubspotCompanyId) continue;
    setAlisAdminId(r);
    imported += 1;
  }
  return imported;
}

function deleteAlisAdminId(hubspotCompanyId) {
  run('DELETE FROM alis_admin_ids WHERE hubspot_company_id = ?', [hubspotCompanyId]);
}

function listCompanyHosts() {
  return queryAll('SELECT hubspot_company_id, company_host FROM company_hosts');
}

function setCompanyHost({ hubspotCompanyId, companyName, companyHost }) {
  run(
    `INSERT INTO company_hosts (hubspot_company_id, company_name, company_host, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(hubspot_company_id) DO UPDATE SET company_name = excluded.company_name, company_host = excluded.company_host, updated_at = excluded.updated_at`,
    [hubspotCompanyId, companyName || null, companyHost]
  );
}

/** Bulk upsert for the Download/Upload template flow — skips any row with no host filled in, no HubSpot ID (name-only rows from an admin-directory scrape, which this app doesn't have, would otherwise have nothing to key on), or a name that doesn't resolve to a real ID. */
function bulkSetCompanyHosts(rows) {
  let imported = 0;
  for (const r of rows) {
    if (!r.companyHost || !r.hubspotCompanyId) continue;
    setCompanyHost(r);
    imported += 1;
  }
  return imported;
}

function deleteCompanyHost(hubspotCompanyId) {
  run('DELETE FROM company_hosts WHERE hubspot_company_id = ?', [hubspotCompanyId]);
}

module.exports = {
  initDb, listDecisions, addDecision, deleteDecision, recordKpiMetricSnapshots, getKpiMetricHistory,
  listAlisAdminIds, getAlisAdminId, setAlisAdminId, bulkSetAlisAdminIds, deleteAlisAdminId,
  listCompanyHosts, setCompanyHost, bulkSetCompanyHosts, deleteCompanyHost,
};
