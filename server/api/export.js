const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getTicketHistory, withEnhancementCounts } = require('../services/hubspotRequests');
const { getKeyContactsForCompanies } = require('../services/hubspotContacts');
const { getDealsWithCompanyContext, getDealSummaryByCompany, getImplementationProjects } = require('../services/hubspotDealsSummary');
const { computeTierSnapshotRows } = require('../services/kpiMetrics');
const { attachPinnedNotes } = require('../services/pinnedNotes');
const { renderDashboardPdf } = require('../services/dashboardPdf');
const { recordKpiMetricSnapshots, listAlisAdminIds, listCompanyHosts, getMaxUpdatedAt } = require('../db/database');

/**
 * Server-side snapshot cache (Sep 2026, Aaron: "I just want recent data to
 * be instantly accessible... navigating back to the dashboard and having
 * it empty is the worst"). The client already caches its own copy in
 * localStorage (DataCache.jsx), but that's per-browser-profile — a fresh
 * browser, a colleague opening this same dashboard, or a server restart
 * during dev all hit a genuinely empty client cache and would otherwise
 * force everyone through the same ~15-25s live HubSpot pull before
 * anything renders. Caching the last successful pull here too means GET
 * /api/export is instant for everyone by default; only an explicit
 * ?refresh=true (the client's "Refresh" button) pays the live-pull cost.
 * Persisted to a JSON file next to the sqlite db so it also survives a dev
 * server restart, not just requests within one process's lifetime.
 */
const CACHE_PATH = path.join(__dirname, '..', 'db', 'export-cache.json');
let cachedSnapshot = loadCacheFromDisk();

function loadCacheFromDisk() {
  try {
    return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveCacheToDisk(snapshot) {
  try {
    fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(snapshot));
  } catch (err) {
    console.error('[export] Failed to persist export cache to disk:', err.message);
  }
}

/** Merges the manually-entered ALIS Admin Company ID / Subdomain mappings onto each company — the same fields Account Truth needs, folded into this one shared portfolio pull instead of AccountTruth.jsx running its own separate (and equally expensive) copy of it. */
function withAlisMappings(companies) {
  const alisAdminIdByCompany = new Map(listAlisAdminIds().map((r) => [r.hubspot_company_id, r.alis_admin_company_id]));
  const companyHostByCompany = new Map(listCompanyHosts().map((r) => [r.hubspot_company_id, r.company_host]));
  return companies.map((c) => ({
    ...c,
    alisAdminCompanyId: alisAdminIdByCompany.get(c.id) || null,
    companyHost: companyHostByCompany.get(c.id) || null,
  }));
}

/** Merges the deal roll-up onto each company — zero deals is a real, common state (most of the portfolio has none open), not missing data, so it defaults to 0s rather than null. */
function withDealSummary(companies, dealSummaryByCompany) {
  return companies.map((c) => {
    const s = dealSummaryByCompany.get(c.id);
    return {
      ...c,
      openDealsCount: s?.openDealsCount ?? 0,
      openDealValueCents: s?.openDealValueCents ?? 0,
      arrAddedThisYearCents: s?.arrAddedThisYearCents ?? 0,
    };
  });
}

/** Tier 0/blank AND no ARR — Aaron, Sep 2026: "filter out all of the tier 0s with no ARR -- they don't seem like active clients." A tier OR any ARR keeps an account in. */
function isActiveClient(c) {
  return (c.tier != null && c.tier !== 0) || (c.arrCents || 0) > 0;
}

/**
 * Attaches each active company's tagged key contacts (one batch pull,
 * portfolio-wide — see getKeyContactsForCompanies) plus which of the
 * portfolio's actually-in-use role labels this company has NO contact
 * tagged with. "In use" (not the full 10-label target list) so a label
 * nobody on the whole portfolio has ever tagged doesn't show as "missing"
 * everywhere — same derived-from-usage convention as alis-hub's Key
 * Contacts section (Aaron, Sep 2026: "build out a parallel key contacts
 * section... on the Product hub dashboard").
 */
async function withKeyContacts(companies) {
  const keyContactsByCompany = await getKeyContactsForCompanies(companies.map((c) => c.id));
  const labelsInUse = new Set();
  for (const contacts of keyContactsByCompany.values()) {
    for (const contact of contacts) for (const role of contact.roles) labelsInUse.add(role);
  }
  return companies.map((c) => {
    const keyContacts = keyContactsByCompany.get(c.id) || [];
    const covered = new Set(keyContacts.flatMap((k) => k.roles));
    return {
      ...c,
      keyContacts,
      missingKeyContactLabels: [...labelsInUse].filter((label) => !covered.has(label)).sort(),
    };
  });
}

/** Joins each implementation project onto its company's context (name/tier/ARR/AM) — same convention as hubspotRequests.js's ticket rows for a deal whose company isn't in the portfolio list. */
function withProjectCompanyContext(projects, companiesById) {
  return projects.map((p) => {
    const company = p.companyId ? companiesById.get(p.companyId) : null;
    return {
      ...p,
      companyName: company?.name || (p.companyId ? '(company not in portfolio list)' : null),
      tier: company?.tier ?? null,
      arrCents: company?.arrCents ?? null,
      accountManagerName: company?.accountManagerName ?? null,
      companyHost: company?.companyHost ?? null,
    };
  });
}

/** The actual ~15-25s live HubSpot pull, pulled out of the route handler so both a cache-miss and an explicit ?refresh=true share one code path. */
async function pullLiveSnapshot() {
  // Sequential, not Promise.all — confirmed live (2026-09-21): running
  // the company search and the portfolio-wide deal search concurrently
  // trips HubSpot's per-second search rate limit hard enough that the
  // built-in 429 backoff in hubspotClient.js can't recover ("You have
  // reached your secondly limit"). Costs some wall-clock time, but
  // reliability over speed for a page that already takes 15-25s.
  const rawCompanies = await getAllHomeOfficeCompanies();
  const dealsWithCompany = await getDealsWithCompanyContext();
  const dealSummaryByCompany = getDealSummaryByCompany(dealsWithCompany);
  // withAlisMappings runs on the FULL company list, before companiesById is
  // built — Sep 2026, Aaron: "put the important links beside company name
  // throughout the app and reports" needs companyHost/alisAdminCompanyId
  // threaded onto ticket rows too (see hubspotRequests.js), which only
  // works if companiesById (used by getTicketHistory below) already has
  // them. Previously this ran AFTER getTicketHistory and only on the
  // active-filtered `companies`, so every ticket row's company lookup
  // missed both fields entirely.
  const allCompanies = withAlisMappings(withDealSummary(rawCompanies, dealSummaryByCompany));
  // Joins still resolve against every company, so a ticket or project on
  // an inactive account keeps its real name instead of "(not in list)";
  // only the account lists/KPIs drop inactive ones.
  const companiesById = new Map(allCompanies.map((c) => [c.id, c]));
  let companies = allCompanies.filter(isActiveClient);
  const inactiveCompanyCount = allCompanies.length - companies.length;
  const requests = await getTicketHistory({ lookbackDays: 400, companiesById });
  companies = withEnhancementCounts(companies, requests);
  companies = await withKeyContacts(companies);
  const implementationProjects = withProjectCompanyContext(getImplementationProjects(dealsWithCompany), companiesById);
  await attachPinnedNotes(implementationProjects, 'Deal');

  // Captures today's ARR/company/community-by-tier snapshot as a side
  // effect of this same load — the "tracking and trending" on the
  // Overview KPI cards (Aaron, Sep 2026) needs history, and this is the
  // cheapest way to build it: no scheduled job, just a row written (or
  // overwritten, once per calendar day) every time someone loads the
  // dashboard. See server/services/kpiMetrics.js and the
  // kpi_metric_history table. Only recorded on a real live pull, not on a
  // cache serve — replaying the same day's number twice is a no-op anyway
  // (upsert keyed by day), but there's no reason to touch it otherwise.
  const kpiSnapshot = computeTierSnapshotRows(companies);
  recordKpiMetricSnapshots(kpiSnapshot.rows);

  return {
    generatedAt: new Date().toISOString(),
    companies,
    inactiveCompanyCount,
    requests,
    implementationProjects,
    kpi: kpiSnapshot.current,
    alisAdminIdsUpdatedAt: getMaxUpdatedAt('alis_admin_ids'),
    companyHostsUpdatedAt: getMaxUpdatedAt('company_hosts'),
  };
}

// GET /api/export — the V1 "just serve up the data" endpoint. Returns raw,
// unscored rows for the two sheets Trisha's/BI's team plug into their own
// existing spreadsheet/DOMO setup: the account roster, and every
// enhancement/escalation/support ticket (open AND closed, last ~13 months)
// with account context (ARR/tier) attached — `isOpen`/`closedAt` let the
// dashboard's trend charts and this same export tell open from closed. No
// queue, no scoring, no decision log here.
//
// Serves the cached last-pulled snapshot instantly by default (Sep 2026,
// Aaron: "recent data instantly accessible... navigating back to the
// dashboard and having it empty is the worst") — a cache miss (nothing's
// ever been pulled since this server started, and no export-cache.json on
// disk either) is the only case that pays the live ~15-25s pull here.
// `?refresh=true` (the client's explicit "Refresh" button) always pays it,
// to actually get new data.
router.get('/', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    if (!forceRefresh && cachedSnapshot) {
      return res.json({ ...cachedSnapshot, servedFromCache: true });
    }
    const snapshot = await pullLiveSnapshot();
    cachedSnapshot = snapshot;
    saveCacheToDisk(snapshot);
    res.json(snapshot);
  } catch (err) {
    next(err);
  }
});

// POST /api/export/pdf — the portfolio Dashboard as a PDF (Sep 2026, Aaron:
// "are the Excel and pdf exports for the Product hub dashboard thorough,
// robust, illustrative, engaging, graphical where appropriate, punchy --
// value delivered!!" — there was no PDF export at all before this). Takes
// the already-loaded { companies, totals, kpi, generatedAt } in the body,
// same convention as accounts.js's /:id/export-pdf — no extra HubSpot
// calls, renders exactly what the client already has on screen.
router.post('/pdf', async (req, res, next) => {
  try {
    const { companies, totals, kpi, generatedAt, entitlementsRollup } = req.body || {};
    if (!Array.isArray(companies) || !totals || !kpi) {
      return res.status(400).json({ error: 'Expected { companies, totals, kpi, generatedAt }' });
    }
    const buffer = await renderDashboardPdf({ companies, totals, kpi, generatedAt: generatedAt || new Date().toISOString(), entitlementsRollup });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ALIS-Product-Hub-Portfolio-Report-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
