/**
 * Portfolio-wide deal roll-up per account — Open Deals/Value, ARR Added
 * (this year), and implementation/onboarding project tracking, the
 * HubSpot-only slices of alis-hub's Account Health Dashboard
 * (server/api/accountHealth.js's mapLiveFinancialHealth /
 * server/services/hubspotTickets.js's getDealSummaryForCompany). alis-hub
 * computes this per-company (one deal-associations call per account, ~616
 * of them) because its numbers are a periodic snapshot, not recomputed on
 * every page load. This app has no snapshot store — a "click Refresh, wait
 * ~1-2 min" experience means 616 sequential per-company calls isn't an
 * option, so this does one portfolio-wide-search + batch-associations join
 * (same pattern hubspotRequests.js already uses for tickets) instead, and
 * derives BOTH the deal summary and the implementation-projects list from
 * that single fetch rather than searching deals twice.
 *
 * Deliberately NOT pulling Health score or Aging Balance/DSO — those need
 * a scoring formula and the AR-aging PDF import respectively, out of
 * scope for this pass (Aaron, Sep 2026: keep ALIS credentials out of this
 * app entirely, so anything needing the ALIS API — Total Capacity/Current
 * Census — is out too).
 */
const { hubspotRequest, batchGetCompanyIdsFor, hubspotRecordUrl } = require('./hubspotClient');

const DEAL_PROPERTIES = [
  'dealname', 'hs_is_closed', 'hs_is_closed_won', 'closedate', 'createdate', 'arr_value',
  'project_status', 'project_health_rag', 'project_progress', 'project_owner', 'projected_golive_date',
  'hs_pinned_engagement_id',
];

// Same convention as alis-hub's TeamAmDashboard.jsx isOpenProject — every
// other project_status value (In Progress, On Hold, Blocked, Not Started,
// Delayed Go-Live, Off Track, etc.) counts as still open.
const TERMINAL_PROJECT_STATUSES = new Set(['Completed', 'Cancelled', 'Merged']);

/** Every deal in the portal, most-recently-modified first — same 10k-result safety cap as hubspotRequests.js's searchRecentTickets. */
async function searchAllDeals() {
  const deals = [];
  let after;
  do {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/deals/search', {
      filterGroups: [],
      properties: DEAL_PROPERTIES,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    });
    if (status !== 200) {
      throw new Error(`HubSpot deal search failed (${status}): ${JSON.stringify(body)}`);
    }
    deals.push(...(body.results || []));
    after = body.paging?.next?.after;
  } while (after && deals.length < 10000);
  return deals;
}

/** One portfolio-wide deal search + company join, reused by both getDealSummaryByCompany and getImplementationProjects below so the (already rate-limit-sensitive) deal search only runs once per /api/export load. Deals with no company association keep companyId null — callers drop them. */
async function getDealsWithCompanyContext() {
  const deals = await searchAllDeals();
  const companyIdsByDeal = await batchGetCompanyIdsFor('deals', deals.map((d) => d.id));
  return deals.map((d) => ({ ...d, companyId: (companyIdsByDeal.get(d.id) || [])[0] || null }));
}

/**
 * Returns Map<companyId, {openDealsCount, openDealValueCents, arrAddedThisYearCents}>.
 * "Open Deal Value" and "ARR Added" both sum `arr_value` (the portal's
 * purpose-built ARR field), not `amount` — same reasoning as
 * hubspotDeals.js's DEAL_PROPERTIES comment: `amount` can be a one-time
 * fee or partial add-on, `arr_value` is the annualized figure everywhere
 * else in this org means "ARR" by.
 */
function getDealSummaryByCompany(dealsWithCompany) {
  const currentYear = new Date().getFullYear();
  const summaryByCompany = new Map();

  for (const deal of dealsWithCompany) {
    if (!deal.companyId) continue;

    const p = deal.properties;
    const arrValueCents = p.arr_value != null ? Math.round(Number(p.arr_value) * 100) : 0;
    const isClosed = p.hs_is_closed === 'true';
    const isWon = p.hs_is_closed_won === 'true';
    const closedThisYear = isWon && p.closedate && new Date(p.closedate).getFullYear() === currentYear;

    if (!summaryByCompany.has(deal.companyId)) {
      summaryByCompany.set(deal.companyId, { openDealsCount: 0, openDealValueCents: 0, arrAddedThisYearCents: 0 });
    }
    const s = summaryByCompany.get(deal.companyId);
    if (!isClosed) {
      s.openDealsCount += 1;
      s.openDealValueCents += arrValueCents;
    }
    if (closedThisYear) {
      s.arrAddedThisYearCents += arrValueCents;
    }
  }

  return summaryByCompany;
}

/**
 * Every deal that has a Project Status set, open or closed (Aaron, Sep
 * 2026, porting alis-hub's "Onboarding" section: "as long as the tool
 * pulls in any implementations with a project status — if no project
 * status then we do not have to track"). Joined to company context
 * (name/tier/ARR/AM) by the caller, same as ticket rows in
 * hubspotRequests.js — this just returns the deal-level fields.
 */
function getImplementationProjects(dealsWithCompany) {
  return dealsWithCompany
    .filter((d) => d.properties.project_status)
    .map((d) => {
      const p = d.properties;
      return {
        dealId: d.id,
        name: p.dealname || '(no name)',
        projectStatus: p.project_status,
        isOpen: !TERMINAL_PROJECT_STATUSES.has(p.project_status),
        projectHealthRag: p.project_health_rag ? p.project_health_rag.toLowerCase() : null,
        projectProgress: p.project_progress != null ? Number(p.project_progress) : null,
        projectOwner: p.project_owner || null,
        projectedGoLiveDate: p.projected_golive_date || null,
        createdAt: p.createdate || null,
        companyId: d.companyId,
        url: hubspotRecordUrl('deal', d.id),
        pinnedEngagementId: p.hs_pinned_engagement_id || null,
        pinnedNote: null,
        pinnedNoteSegments: null,
      };
    });
}

// Contract Truth (data-completeness: does each account have a closed-won
// deal with an ARR value and close date on file) used to live here as a
// portfolio-wide rollup for this app's Dashboard. Moved to alis-hub (Sep
// 2026, Aaron: "I don't think these really need to be on the product
// board") — see alis-hub's server/services/hubspotTickets.js's
// computeContractTruth, now surfaced on both the Team AM board (portfolio
// rollup) and the Account Health board (per-account).

module.exports = { getDealsWithCompanyContext, getDealSummaryByCompany, getImplementationProjects };
