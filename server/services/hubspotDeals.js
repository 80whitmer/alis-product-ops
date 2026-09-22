/**
 * Deal + line-item pull — the "what did this company actually contract for"
 * data source for Contract Truth (view #2). Ported verbatim from alis-hub's
 * server/services/hubspotTickets.js (getContractedModulesForCompany and its
 * helpers), which built this for the same purpose (the Usage Audit RAG
 * grid's Contracted column) but has it DISABLED there as of 2026-09-03:
 * the shared HubSpot private app token is missing the
 * crm.objects.line_items.read / crm.schemas.line_items.read scopes this
 * needs. This will return an empty lineItems array per deal until those
 * scopes are added and the token regenerated — that's a HubSpot private-app
 * config change, not a code fix, on either side of the fork.
 */
const { hubspotRequest, chunk, hubspotRecordUrl } = require('./hubspotClient');

const DEAL_PROPERTIES = [
  'dealname', 'pipeline', 'dealstage', 'dealtype', 'amount',
  // Purpose-built ARR property ((AL/IL capacity × negotiated rate) × 12) —
  // not the same as `amount`, which can be a one-time fee or partial add-on.
  'arr_value',
  'closedate', 'createdate', 'hs_is_closed', 'hs_is_closed_won',
];

const LINE_ITEM_PROPERTIES = ['name', 'quantity', 'price', 'recurringbillingfrequency', 'hs_product_id'];

async function getDealIdsForCompany(companyId) {
  const ids = [];
  let after;
  do {
    const path = `/crm/v4/objects/companies/${companyId}/associations/deals${after ? `?after=${encodeURIComponent(after)}` : ''}`;
    const { status, body } = await hubspotRequest('GET', path);
    if (status !== 200) {
      throw new Error(`HubSpot deal associations lookup failed (${status}): ${JSON.stringify(body)}`);
    }
    ids.push(...(body.results || []).map((r) => r.toObjectId));
    after = body.paging?.next?.after;
  } while (after);
  return ids;
}

async function batchReadDeals(dealIds) {
  if (dealIds.length === 0) return [];
  const results = [];
  for (const batch of chunk(dealIds, 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/deals/batch/read', {
      properties: DEAL_PROPERTIES,
      inputs: batch.map((id) => ({ id })),
    });
    if (status !== 200) {
      throw new Error(`HubSpot deal batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    results.push(...(body.results || []));
  }
  return results;
}

async function getLineItemIdsForDeal(dealId) {
  const ids = [];
  let after;
  do {
    const path = `/crm/v4/objects/deals/${dealId}/associations/line_items${after ? `?after=${encodeURIComponent(after)}` : ''}`;
    const { status, body } = await hubspotRequest('GET', path);
    if (status !== 200) {
      throw new Error(`HubSpot line-item associations lookup failed for deal ${dealId} (${status}): ${JSON.stringify(body)}`);
    }
    ids.push(...(body.results || []).map((r) => r.toObjectId));
    after = body.paging?.next?.after;
  } while (after);
  return ids;
}

async function batchReadLineItems(lineItemIds) {
  if (lineItemIds.length === 0) return [];
  const results = [];
  for (const batch of chunk(lineItemIds, 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/line_items/batch/read', {
      properties: LINE_ITEM_PROPERTIES,
      inputs: batch.map((id) => ({ id })),
    });
    if (status !== 200) {
      throw new Error(`HubSpot line-item batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    results.push(...(body.results || []));
  }
  return results;
}

/**
 * Every deal ever associated with a company (not just open/recent — a
 * module purchased on a 2023 deal is still contracted today), each with its
 * line items. One-time implementation-fee line items are included as-is.
 *
 * Line-item reads degrade to an empty array per deal (with a flag, not a
 * thrown error) when the token lacks the required scopes — confirmed live
 * 2026-09-21: this token 403s with MISSING_SCOPES
 * (crm.objects.line_items.read / crm.schemas.line_items.read) on every
 * batchReadLineItems call. Deal-level info (name, ARR, close date) is a
 * separate, already-working call and shouldn't be lost because of it.
 */
async function getContractedModulesForCompany(hubspotCompanyId) {
  const dealIds = await getDealIdsForCompany(hubspotCompanyId);
  const deals = await batchReadDeals(dealIds);

  const results = [];
  for (const deal of deals) {
    let lineItems = [];
    let lineItemsBlocked = false;
    try {
      const lineItemIds = await getLineItemIdsForDeal(deal.id);
      const rawLineItems = await batchReadLineItems(lineItemIds);
      lineItems = rawLineItems.map((li) => ({
        id: li.id,
        name: li.properties.name,
        quantity: li.properties.quantity != null ? Number(li.properties.quantity) : null,
        price: li.properties.price != null ? Number(li.properties.price) : null,
        recurringBillingFrequency: li.properties.recurringbillingfrequency || null,
      }));
    } catch (err) {
      lineItemsBlocked = true;
    }

    results.push({
      dealId: deal.id,
      dealName: deal.properties.dealname,
      isClosed: deal.properties.hs_is_closed === 'true',
      isWon: deal.properties.hs_is_closed_won === 'true',
      closeDate: deal.properties.closedate || null,
      arrValue: deal.properties.arr_value != null ? Number(deal.properties.arr_value) : null,
      url: hubspotRecordUrl('deal', deal.id),
      lineItems,
      lineItemsBlocked,
    });
  }
  return results;
}

module.exports = { getContractedModulesForCompany };
