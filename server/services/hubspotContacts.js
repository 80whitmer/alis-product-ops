/**
 * Key contacts per company — HubSpot's own company->contact associations,
 * no ALIS pull. "Key" is a title-match heuristic, not a HubSpot flag: this
 * portal has no dedicated primary-contact field to key off of instead.
 */
const { hubspotRequest, chunk, hubspotRecordUrl } = require('./hubspotClient');

const CONTACT_PROPERTIES = ['firstname', 'lastname', 'email', 'jobtitle', 'phone'];

// Seniority buckets so the handful of contacts most likely to be
// decision-makers sort first. Lower = higher rank. Checked in this order
// specifically so "Vice President of Sales" lands in the VP bucket rather
// than the top (owner/CEO/president) one — "president" is a substring of
// "vice president", so the VP check has to run first.
function rankTitle(title) {
  if (!title) return 3;
  const t = title.toLowerCase();
  if (/\bvice president\b|\bvp\b/.test(t)) return 1;
  if (/\bowner\b|\bceo\b|\bpresident\b|\bprincipal\b/.test(t)) return 0;
  if (/\bcfo\b|\bcoo\b|\bdirector\b/.test(t)) return 1;
  if (/\badministrator\b|\bexecutive director\b/.test(t)) return 2;
  return 3;
}

async function getContactIdsForCompany(companyId) {
  const ids = [];
  let after;
  do {
    const path = `/crm/v4/objects/companies/${companyId}/associations/contacts${after ? `?after=${encodeURIComponent(after)}` : ''}`;
    const { status, body } = await hubspotRequest('GET', path);
    if (status !== 200) {
      throw new Error(`HubSpot contact associations lookup failed (${status}): ${JSON.stringify(body)}`);
    }
    ids.push(...(body.results || []).map((r) => r.toObjectId));
    after = body.paging?.next?.after;
  } while (after);
  return ids;
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

/** Every contact associated with a company, ranked so likely decision-makers surface first, then alphabetically. Capping the list for display is the caller's call, not this function's. */
async function getKeyContactsForCompany(companyId) {
  const contactIds = await getContactIdsForCompany(companyId);
  const contacts = await batchReadContacts(contactIds);
  return contacts
    .map((c) => ({
      id: c.id,
      name: [c.properties.firstname, c.properties.lastname].filter(Boolean).join(' ') || '(no name)',
      title: c.properties.jobtitle || null,
      email: c.properties.email || null,
      phone: c.properties.phone || null,
      url: hubspotRecordUrl('contact', c.id),
    }))
    .sort((a, b) => rankTitle(a.title) - rankTitle(b.title) || a.name.localeCompare(b.name));
}

module.exports = { getKeyContactsForCompany };
