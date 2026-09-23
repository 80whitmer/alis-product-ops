const express = require('express');
const router = express.Router();
const { getAllHomeOfficeCompanies } = require('../services/hubspotAccounts');
const { getTicketHistory } = require('../services/hubspotRequests');
const { getDealSummaryByCompany } = require('../services/hubspotDealsSummary');

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

/** Merges each account's open/closed Enhancement Request ticket counts onto it, for the Accounts table's own two columns — zero is a real, common state, not missing data. */
function withEnhancementCounts(companies, ticketHistory) {
  const openCounts = new Map();
  const closedCounts = new Map();
  for (const t of ticketHistory) {
    if (!t.isEnhancementRequest || !t.companyId) continue;
    const counts = t.isOpen ? openCounts : closedCounts;
    counts.set(t.companyId, (counts.get(t.companyId) || 0) + 1);
  }
  return companies.map((c) => ({
    ...c,
    openEnhancementCount: openCounts.get(c.id) || 0,
    closedEnhancementCount: closedCounts.get(c.id) || 0,
  }));
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
    const dealSummaryByCompany = await getDealSummaryByCompany();
    let companies = withDealSummary(rawCompanies, dealSummaryByCompany);
    const companiesById = new Map(companies.map((c) => [c.id, c]));
    const requests = await getTicketHistory({ lookbackDays: 400, companiesById });
    companies = withEnhancementCounts(companies, requests);
    res.json({ generatedAt: new Date().toISOString(), companies, requests });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
