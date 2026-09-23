const express = require('express');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getTicketHistory, withEnhancementCounts } = require('../services/hubspotRequests');
const { getDealsWithCompanyContext, getDealSummaryByCompany, getImplementationProjects } = require('../services/hubspotDealsSummary');
const { computeTierSnapshotRows } = require('../services/kpiMetrics');
const { attachPinnedNotes } = require('../services/pinnedNotes');
const { recordKpiMetricSnapshots, listAlisAdminIds, listCompanyHosts, getMaxUpdatedAt } = require('../db/database');

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
    };
  });
}

// GET /api/export — the V1 "just serve up the data" endpoint. Returns raw,
// unscored rows for the two sheets Trisha's/BI's team plug into their own
// existing spreadsheet/DOMO setup: the account roster, and every
// enhancement/escalation/support ticket (open AND closed, last ~13 months)
// with account context (ARR/tier) attached — `isOpen`/`closedAt` let the
// dashboard's trend charts and this same export tell open from closed. No
// queue, no scoring, no decision log here.
router.get('/', async (req, res, next) => {
  try {
    // Sequential, not Promise.all — confirmed live (2026-09-21): running
    // the company search and the portfolio-wide deal search concurrently
    // trips HubSpot's per-second search rate limit hard enough that the
    // built-in 429 backoff in hubspotClient.js can't recover ("You have
    // reached your secondly limit"). Costs some wall-clock time, but
    // reliability over speed for a page that already takes 15-25s.
    const rawCompanies = await getAllHomeOfficeCompanies();
    const dealsWithCompany = await getDealsWithCompanyContext();
    const dealSummaryByCompany = getDealSummaryByCompany(dealsWithCompany);
    const allCompanies = withDealSummary(rawCompanies, dealSummaryByCompany);
    // Joins still resolve against every company, so a ticket or project on
    // an inactive account keeps its real name instead of "(not in list)";
    // only the account lists/KPIs drop inactive ones.
    const companiesById = new Map(allCompanies.map((c) => [c.id, c]));
    let companies = allCompanies.filter(isActiveClient);
    const inactiveCompanyCount = allCompanies.length - companies.length;
    const requests = await getTicketHistory({ lookbackDays: 400, companiesById });
    companies = withEnhancementCounts(companies, requests);
    companies = withAlisMappings(companies);
    const implementationProjects = withProjectCompanyContext(getImplementationProjects(dealsWithCompany), companiesById);
    await attachPinnedNotes(implementationProjects, 'Deal');

    // Captures today's ARR/company/community-by-tier snapshot as a side
    // effect of this same load — the "tracking and trending" on the
    // Overview KPI cards (Aaron, Sep 2026) needs history, and this is the
    // cheapest way to build it: no scheduled job, just a row written (or
    // overwritten, once per calendar day) every time someone loads the
    // dashboard. See server/services/kpiMetrics.js and the
    // kpi_metric_history table.
    const kpiSnapshot = computeTierSnapshotRows(companies);
    recordKpiMetricSnapshots(kpiSnapshot.rows);

    res.json({
      generatedAt: new Date().toISOString(),
      companies,
      inactiveCompanyCount,
      requests,
      implementationProjects,
      kpi: kpiSnapshot.current,
      alisAdminIdsUpdatedAt: getMaxUpdatedAt('alis_admin_ids'),
      companyHostsUpdatedAt: getMaxUpdatedAt('company_hosts'),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
