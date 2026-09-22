/**
 * Portfolio-wide company listing — the account picker for Contract Truth.
 * Deliberately NOT owner-scoped (unlike alis-hub's getOwnedCompanies):
 * this app has no individual dashboards and no HubSpot Owner ID concept —
 * Ella and everyone else who uses this sees the whole book. Ported from
 * alis-hub's server/services/hubspotAccounts.js.
 */
const { hubspotRequest } = require('./hubspotClient');

const COMPANY_PROPERTIES = ['name', 'account_manager', 'hs_num_child_companies', 'lifecyclestage', 'createdate', 'arr', 'client_tier', 'client_teir_2_0'];

function resolveTier(properties) {
  const newTier = properties.client_teir_2_0;
  if (newTier != null && newTier !== '') return Number(newTier);
  const oldTier = properties.client_tier;
  return oldTier != null && oldTier !== '' ? Number(oldTier) : null;
}

/** Every Home Office (parent) company in the portal — same "hs_num_child_companies > 0" filter alis-hub uses to mean "this is an account, not a standalone community record". */
async function getAllHomeOfficeCompanies() {
  const companies = [];
  let after;
  do {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/companies/search', {
      filterGroups: [{ filters: [{ propertyName: 'hs_num_child_companies', operator: 'GT', value: '0' }] }],
      properties: COMPANY_PROPERTIES,
      limit: 100,
      ...(after ? { after } : {}),
    });
    if (status !== 200) {
      throw new Error(`HubSpot all-Home-Offices search failed (${status}): ${JSON.stringify(body)}`);
    }
    companies.push(...(body.results || []).map((c) => ({
      id: c.id,
      name: c.properties.name,
      lifecycleStage: c.properties.lifecyclestage || null,
      createdAt: c.properties.createdate || null,
      arrCents: c.properties.arr != null ? Math.round(Number(c.properties.arr) * 100) : null,
      tier: resolveTier(c.properties),
    })));
    after = body.paging?.next?.after;
  } while (after);
  return companies;
}

module.exports = { getAllHomeOfficeCompanies };
