/**
 * Key contacts per company — filtered to HubSpot's own Company<->Contact
 * ASSOCIATION LABELS (not a contact property, and not a title-guessing
 * heuristic): a real, portal-specific role taxonomy someone already
 * maintains by hand (Aaron, Sep 2026: "restrict the contact coming through
 * to the ones with the special HubSpot tags"). Confirmed live via GET
 * /crm/v4/associations/companies/contacts/labels, and confirmed the
 * signal-to-noise gain is real: Sinceri Senior Living has 346 total
 * associated contacts but only 5 carry one of these labels.
 */
const { hubspotRequest, chunk, hubspotRecordUrl } = require('./hubspotClient');

const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'jobtitle', 'phone'];

// Company->Contact association typeIds worth surfacing, confirmed live
// (Sep 2026) via the labels endpoint above — every other label that
// endpoint returns (e.g. "Contact with Primary Company", "Clinical",
// "Sales & Marketing") is deliberately excluded, not just unmapped, per
// Aaron's explicit list. Order here is also the display sort priority.
const ROLE_ORDER = [64, 78, 74, 930, 68, 72, 66, 76, 70, 23];
const ROLE_LABELS_BY_TYPE_ID = {
  64: 'Account Owner',
  78: 'Decision Maker',
  74: 'Billing Admin',
  930: 'Billing Contact',
  68: 'Billing Super User',
  72: 'Clinical Admin',
  66: 'Clinical Super User',
  76: 'Sales Admin',
  70: 'Sales Super User',
  23: 'ALIS Pay Contact',
};

function bestRoleRank(roleTypeIds) {
  let best = ROLE_ORDER.length;
  for (const id of roleTypeIds) {
    const idx = ROLE_ORDER.indexOf(id);
    if (idx !== -1 && idx < best) best = idx;
  }
  return best;
}

/** Every contact association for a company that carries at least one of the target role labels — paginated, and filtered here rather than after batch-reading, so a company with hundreds of contacts doesn't need a batch/read call for every single one of them just to throw most away. */
async function getRoledContactsForCompany(companyId) {
  const roled = [];
  let after;
  do {
    const path = `/crm/v4/objects/companies/${companyId}/associations/contacts${after ? `?after=${encodeURIComponent(after)}` : ''}`;
    const { status, body } = await hubspotRequest('GET', path);
    if (status !== 200) {
      throw new Error(`HubSpot contact associations lookup failed (${status}): ${JSON.stringify(body)}`);
    }
    for (const r of body.results || []) {
      const roleTypeIds = (r.associationTypes || []).map((t) => t.typeId).filter((id) => ROLE_LABELS_BY_TYPE_ID[id] != null);
      if (roleTypeIds.length > 0) roled.push({ contactId: r.toObjectId, roleTypeIds });
    }
    after = body.paging?.next?.after;
  } while (after);
  return roled;
}

async function batchReadContacts(contactIds) {
  if (contactIds.length === 0) return [];
  const results = [];
  for (const batch of chunk(contactIds, 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/contacts/batch/read', {
      properties: CONTACT_PROPERTIES,
      inputs: batch.map((id) => ({ id })),
    });
    if (status !== 200) {
      throw new Error(`HubSpot contact batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    results.push(...(body.results || []));
  }
  return results;
}

/** Every contact carrying one of the target role labels for this company, each with its role(s) attached, ranked by the most senior/relevant role held (Account Owner and Decision Maker first) then alphabetically. Empty is a real, common answer — most contacts on file for an account carry no special role. */
async function getKeyContactsForCompany(companyId) {
  const roled = await getRoledContactsForCompany(companyId);
  if (roled.length === 0) return [];

  const rolesByContactId = new Map(roled.map((r) => [String(r.contactId), r.roleTypeIds]));
  const contacts = await batchReadContacts(roled.map((r) => r.contactId));

  return contacts
    .map((c) => {
      const roleTypeIds = rolesByContactId.get(c.id) || [];
      return {
        id: c.id,
        name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || '(no name)',
        title: c.properties.jobtitle || null,
        email: c.properties.email || null,
        phone: c.properties.phone || null,
        url: hubspotRecordUrl('contact', c.id),
        roles: roleTypeIds
          .slice()
          .sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b))
          .map((id) => ROLE_LABELS_BY_TYPE_ID[id]),
        _rank: bestRoleRank(roleTypeIds),
      };
    })
    .sort((a, b) => a._rank - b._rank || a.name.localeCompare(b.name))
    .map(({ _rank, ...contact }) => contact);
}

module.exports = { getKeyContactsForCompany };
