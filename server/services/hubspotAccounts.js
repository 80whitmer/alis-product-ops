/**
 * Portfolio-wide company listing — the account picker for Contract Truth.
 * Deliberately NOT owner-scoped (unlike alis-hub's getOwnedCompanies):
 * this app has no individual dashboards and no HubSpot Owner ID concept —
 * everyone who uses this sees the whole book. Ported from
 * alis-hub's server/services/hubspotAccounts.js.
 */
const { hubspotRequest } = require('./hubspotClient');

const COMPANY_PROPERTIES = ['name', 'account_manager', 'hs_num_child_companies', 'lifecyclestage', 'createdate', 'arr', 'client_tier', 'client_teir_2_0', 'notes_last_updated', 'company_total_capacity'];

function resolveTier(properties) {
  const newTier = properties.client_teir_2_0;
  if (newTier != null && newTier !== '') return Number(newTier);
  const oldTier = properties.client_tier;
  return oldTier != null && oldTier !== '' ? Number(oldTier) : null;
}

// Same owner-id-to-name snapshot as alis-hub's server/services/hubspotAccounts.js
// (Aaron-provided, not resolved from HubSpot automatically — HubSpot's
// owner API needs a scope this app's token isn't guaranteed to have).
// Kept in sync manually with that file, not shared/imported, matching
// this app's established "port the piece, don't couple the repos"
// convention (see docs/CONTEXT.md).
const ACCOUNT_MANAGER_NAMES = {
  280699315: 'Aaron Whitmer',
  474571664: 'Taylor King',
  2558500: 'Patrick Noack',
  49052011: 'Owen Phoenix',
  77259229: 'Jeffery Brown',
  90345669: 'Jessica Crouse',
  212010676: 'Evan Kuo',
  1152655184: 'Gary Jones',
};

/** `null` (no account_manager set) vs. a real ID this map doesn't have a name for yet are genuinely different states — "Unassigned" vs. "Other AM (id)" — not folded into one fallback. */
function getAccountManagerName(ownerId) {
  if (!ownerId) return 'Unassigned';
  return ACCOUNT_MANAGER_NAMES[ownerId] || `Other AM (${ownerId})`;
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
      accountManagerId: c.properties.account_manager || null,
      accountManagerName: getAccountManagerName(c.properties.account_manager),
      lastActivityDate: c.properties.notes_last_updated || null,
      // Community count is HubSpot's own child-company count for this
      // Home Office — not an ALIS pull. Total capacity is a HubSpot
      // property too (company_total_capacity), hand-maintained per
      // alis-hub's own comment on this field, not live ALIS floor-plan
      // data — directional, not exact, but real and needs no ALIS
      // credentials, which this app deliberately doesn't take (Aaron,
      // Sep 2026).
      communityCount: c.properties.hs_num_child_companies != null && c.properties.hs_num_child_companies !== ''
        ? Number(c.properties.hs_num_child_companies) : null,
      totalCapacity: c.properties.company_total_capacity != null && c.properties.company_total_capacity !== ''
        ? Number(c.properties.company_total_capacity) : null,
    })));
    after = body.paging?.next?.after;
  } while (after);
  return companies;
}

module.exports = { getAllHomeOfficeCompanies, getAccountManagerName };
