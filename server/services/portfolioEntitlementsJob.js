/**
 * Manual, on-demand "Run portfolio entitlement check" job (Aaron, Sep
 * 2026, explicitly choosing this over folding it into the regular
 * Refresh: "a manual bulk-check button... you control when it hits
 * production" — a real ALIS admin login+scrape per account is slow and
 * shouldn't add to every 60-90s Refresh). In-memory job state only, not a
 * DB-backed queue — this is a single-process app and a job that's still
 * running when the server restarts is fine to just re-run; the scraped
 * RESULTS it writes along the way (entitlement_snapshots) do persist.
 */
const { getLiveEntitlementsBulk } = require('./alisEntitlements');
const {
  replaceEntitlementSnapshot, listEntitlementSnapshots, countEntitlementSnapshotCompanies,
  listEntitlementFreshness, recordKpiMetricSnapshots,
} = require('../db/database');
const { broadcast } = require('../api/broadcaster');

// How stale a company's last check can be before the audit view flags it —
// this check is manual/on-demand (not part of Refresh), so "never checked"
// and "checked 8 months ago" both need to read as gaps, not silence.
const STALE_AFTER_DAYS = 90;

// Fixed channel id, not a per-run jobId — only one portfolio entitlement
// check can ever be running at a time (see the state.status === 'running'
// guard below), so there's nothing to disambiguate between runs. Same
// convention as alis-hub's own copy of this file.
const STREAM_CHANNEL = 'portfolio-entitlements';

let state = { status: 'idle', total: 0, processed: 0, currentCompany: null, startedAt: null, finishedAt: null, errors: [] };

function getStatus() {
  return { ...state, snapshotCompanyCount: countEntitlementSnapshotCompanies() };
}

/**
 * Starts the job if one isn't already running. Fire-and-forget — progress
 * is broadcast live over SSE (server/api/accounts.js's /portfolio-
 * entitlements/stream route) as each account finishes, instead of the
 * client polling getStatus() on a timer — ported from alis-hub's own copy
 * of this file (Sep 2026, Aaron: port the ALIS Photo Migrator side
 * project's live-log idea to product-ops too). A late subscriber (page
 * opened mid-run, or a reload) still gets getStatus()'s point-in-time
 * snapshot on connect — see the /stream route — it just won't see log
 * lines from before it connected.
 */
function startPortfolioEntitlementsCheck(accounts) {
  if (state.status === 'running') return false;
  state = { status: 'running', total: accounts.length, processed: 0, currentCompany: null, startedAt: new Date().toISOString(), finishedAt: null, errors: [] };
  broadcast(STREAM_CHANNEL, 'log', { msg: `Starting portfolio entitlement check — ${accounts.length} account(s)...` });

  getLiveEntitlementsBulk(accounts, {
    onProgress: ({ index, total, companyName, status, error }) => {
      state.currentCompany = companyName;
      state.total = total;
      if (status === 'done') {
        state.processed = index + 1;
        broadcast(STREAM_CHANNEL, 'log', { msg: `[${index + 1}/${total}] ${companyName}`, processed: state.processed, total, currentCompany: companyName });
      }
      if (status === 'error') {
        state.processed = index + 1;
        state.errors.push({ companyName, error });
        broadcast(STREAM_CHANNEL, 'log', { msg: `[${index + 1}/${total}] ${companyName} — ERROR: ${error}`, level: 'error', processed: state.processed, total, currentCompany: companyName });
      }
    },
    onSnapshot: async (hubspotCompanyId, companyName, flags) => {
      replaceEntitlementSnapshot(hubspotCompanyId, companyName, flags);
    },
  })
    .then(() => {
      state.status = 'done';
      state.finishedAt = new Date().toISOString();
      recordEntitlementTrendSnapshot();
      broadcast(STREAM_CHANNEL, 'log', { msg: `Done. ${state.processed} of ${state.total} account(s) checked, ${state.errors.length} error(s).` });
      broadcast(STREAM_CHANNEL, 'complete', getStatus());
    })
    .catch((err) => {
      state.status = 'error';
      state.finishedAt = new Date().toISOString();
      state.errors.push({ companyName: null, error: err.message });
      broadcast(STREAM_CHANNEL, 'log', { msg: `FATAL ERROR: ${err.message}`, level: 'error' });
      broadcast(STREAM_CHANNEL, 'complete', getStatus());
    });

  return true;
}

/**
 * Rolls the latest per-company snapshot rows into a portfolio-wide %
 * enabled per flag — the actual "callout of what percentage of ALIS live
 * environments have those specific entitlements enabled" (Aaron, Sep
 * 2026). Computed fresh from the stored rows on every call rather than
 * cached, since it's a cheap in-memory group-by over what's realistically
 * a few tens of thousands of rows at most.
 */
function getPortfolioEntitlementRollup() {
  const rows = listEntitlementSnapshots();
  const companiesChecked = new Set(rows.map((r) => r.hubspot_company_id)).size;

  // Per-company "confirmed as of" — the caller (PortfolioEntitlementsSection)
  // already has the full company list (with alisAdminCompanyId) to diff
  // against, so this only needs to report what's actually been checked, not
  // guess at what should have been.
  const now = Date.now();
  const freshness = listEntitlementFreshness().map((r) => {
    const ageDays = Math.floor((now - new Date(r.last_checked_at).getTime()) / 86400000);
    return {
      hubspotCompanyId: r.hubspot_company_id,
      companyName: r.company_name,
      lastCheckedAt: r.last_checked_at,
      ageDays,
      stale: ageDays > STALE_AFTER_DAYS,
    };
  });

  // Grouped by (category, label), NOT flag_id — confirmed live (Sep 2026):
  // ALIS's entitlement checkbox ids carry a per-company numeric suffix
  // (e.g. "scheduling_assistant_entitlement_2" on one account,
  // "..._entitlement_3" on another) for the SAME feature, so only 91 of
  // 132 flag_ids actually matched across two test accounts while all 132
  // labels did. Grouping by flag_id would silently split one feature into
  // several n=1 "100%/0%" rows instead of a real portfolio percentage.
  const byFlag = new Map();
  for (const r of rows) {
    const key = `${r.category}::${r.label}`;
    if (!byFlag.has(key)) byFlag.set(key, { flagId: key, label: r.label, category: r.category, enabledCount: 0, totalCount: 0 });
    const f = byFlag.get(key);
    f.totalCount += 1;
    if (r.enabled) f.enabledCount += 1;
  }
  const flags = [...byFlag.values()]
    .map((f) => ({ ...f, pctEnabled: f.totalCount > 0 ? Math.round((f.enabledCount / f.totalCount) * 1000) / 10 : 0 }))
    .sort((a, b) => b.pctEnabled - a.pctEnabled || b.totalCount - a.totalCount);

  const byCategory = new Map();
  for (const f of flags) {
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  }
  const categories = [...byCategory.entries()]
    .map(([name, categoryFlags]) => ({ name, flags: categoryFlags }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { companiesChecked, categories, freshness };
}

/**
 * Writes today's per-flag adoption % into the same kpi_metric_history table
 * the ARR/Companies/Communities-by-tier trend charts already use — one
 * point per calendar day, so a trend line "falls out" for free the next
 * time this check is run, without a separate history table (Sep 2026,
 * Aaron: "incredible to... track this over time"). Called once a run
 * finishes rather than per-account, since the % is only meaningful once
 * the whole run's flags are in.
 */
function recordEntitlementTrendSnapshot() {
  const { categories } = getPortfolioEntitlementRollup();
  const rows = categories.flatMap((c) => c.flags.map((f) => ({
    scope: 'entitlement', scopeKey: f.flagId, metricKey: 'pctEnabled', value: f.pctEnabled,
  })));
  if (rows.length > 0) recordKpiMetricSnapshots(rows);
}

module.exports = { startPortfolioEntitlementsCheck, getStatus, getPortfolioEntitlementRollup };
