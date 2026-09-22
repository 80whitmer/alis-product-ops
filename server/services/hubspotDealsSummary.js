/**
 * Portfolio-wide deal roll-up per account — Open Deals/Value and ARR
 * Added (this year), the two HubSpot-only slices of alis-hub's Account
 * Health Dashboard (server/services/accountHealthPdf.js /
 * server/api/accountHealth.js's mapLiveFinancialHealth). alis-hub computes
 * this per-company (one deal-associations call per account, ~616 of them)
 * because its Account Health numbers are a periodic snapshot, not
 * recomputed on every page load. This app has no snapshot store — a
 * "click Refresh, wait ~15s" experience means 616 sequential per-company
 * calls isn't an option, so this does the same portfolio-wide-search +
 * batch-associations join hubspotRequests.js already uses for tickets,
 * just for deals instead.
 *
 * Deliberately NOT pulling Health score or Aging Balance/DSO — those need
 * a scoring formula and the AR-aging PDF import respectively, out of
 * scope for this pass (Aaron, Sep 2026: keep ALIS credentials out of this
 * app entirely, so anything needing the ALIS API — Total Capacity/Current
 * Census — is out too).
 */
const { hubspotRequest, chunk, batchGetCompanyIdsFor } = require('./hubspotClient');

const DEAL_PROPERTIES = ['hs_is_closed', 'hs_is_closed_won', 'closedate', 'arr_value'];

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

/**
 * Returns Map<companyId, {openDealsCount, openDealValueCents, arrAddedThisYearCents}>.
 * "Open Deal Value" and "ARR Added" both sum `arr_value` (the portal's
 * purpose-built ARR field), not `amount` — same reasoning as
 * hubspotDeals.js's DEAL_PROPERTIES comment: `amount` can be a one-time
 * fee or partial add-on, `arr_value` is the annualized figure everywhere
 * else in this org means "ARR" by. A deal with no company association is
 * silently dropped — nothing to roll up onto.
 */
async function getDealSummaryByCompany() {
  const deals = await searchAllDeals();
  const companyIdsByDeal = await batchGetCompanyIdsFor('deals', deals.map((d) => d.id));

  const currentYear = new Date().getFullYear();
  const summaryByCompany = new Map();

  for (const deal of deals) {
    const companyId = (companyIdsByDeal.get(deal.id) || [])[0];
    if (!companyId) continue;

    const p = deal.properties;
    const arrValueCents = p.arr_value != null ? Math.round(Number(p.arr_value) * 100) : 0;
    const isClosed = p.hs_is_closed === 'true';
    const isWon = p.hs_is_closed_won === 'true';
    const closedThisYear = isWon && p.closedate && new Date(p.closedate).getFullYear() === currentYear;

    if (!summaryByCompany.has(companyId)) {
      summaryByCompany.set(companyId, { openDealsCount: 0, openDealValueCents: 0, arrAddedThisYearCents: 0 });
    }
    const s = summaryByCompany.get(companyId);
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

module.exports = { getDealSummaryByCompany };
