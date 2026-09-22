/**
 * Portfolio-wide "currently active requests" pull — the raw evidence data
 * for view #1 in docs/CONTEXT.md, minus the scoring. Per the 2026-09-21
 * pivot: don't compute a score, don't merge Jira in yet — just get the
 * HubSpot half of the picture (account, ARR, tier, category, stage, age)
 * out as clean rows so Trisha's/BI's team can plug it into whatever they're
 * already using (their #bi-priority Google Sheet, DOMO, etc.) instead of
 * hand-copying it.
 *
 * Same category_2_0 convention as alis-hub's server/services/hubspotTickets.js
 * (see that file's doc comment for the "true"/"false" stored-value quirk).
 */
const { hubspotRequest, chunk, hubspotRecordUrl, getPipelineStageLabels, batchGetCompanyIdsFor } = require('./hubspotClient');

const CATEGORY_2_0_LABELS = {
  false: 'General Question',
  true: 'Issue',
  Project: 'General Project',
  'ALIS Bug': 'ALIS Escalation',
};

// Only these stage labels count as "currently active" — same convention as
// alis-hub (Client Submitted/In Progress = someone needs to act; Top 3
// Enhancements/Long-Term Projects = tracked enhancement work). Everything
// else (closed, spam, waiting-for-confirmation, etc.) is excluded rather
// than exported and left for the consumer to filter out by hand.
const ACTIVE_STAGE_LABELS = new Set(['Client Submitted', 'In Progress', 'Top 3 Enhancements', 'Long-Term Projects']);

const TICKET_PROPERTIES = [
  'subject', 'hs_pipeline', 'hs_pipeline_stage', 'category_2_0', 'hs_ticket_category',
  'hs_ticket_priority', 'createdate', 'hs_lastmodifieddate', 'top_3',
];

function daysBetween(fromIso, toDate) {
  if (!fromIso) return null;
  return Math.floor((toDate.getTime() - new Date(fromIso).getTime()) / 86400000);
}

/** Every ticket touched in the last `lookbackDays` — a bounded proxy for "not stale/closed" that doesn't require knowing every pipeline's closed-stage IDs up front. */
async function searchRecentTickets(lookbackDays) {
  const sinceIso = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const tickets = [];
  let after;
  do {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/tickets/search', {
      filterGroups: [{ filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: sinceIso }] }],
      properties: TICKET_PROPERTIES,
      sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
      limit: 100,
      ...(after ? { after } : {}),
    });
    if (status !== 200) {
      throw new Error(`HubSpot ticket search failed (${status}): ${JSON.stringify(body)}`);
    }
    tickets.push(...(body.results || []));
    after = body.paging?.next?.after;
    // HubSpot search caps total results at 10,000 regardless of paging —
    // stop rather than loop forever if a portal ever gets that large.
  } while (after && tickets.length < 10000);
  return tickets;
}

/**
 * Returns raw rows: one per currently-active ticket, joined to its
 * associated company (by whichever `companiesById` map the caller passes
 * in, from hubspotAccounts.getAllHomeOfficeCompanies) where one exists. No
 * scoring — ARR/tier are included as columns, not multiplied into anything.
 */
async function getActiveRequestRows({ lookbackDays = 120, companiesById = new Map() } = {}) {
  const rawTickets = await searchRecentTickets(lookbackDays);

  let stageLabels = new Map();
  try {
    stageLabels = await getPipelineStageLabels('tickets');
  } catch {
    // Falls through to raw pipeline/stage IDs below — still useful, just less readable.
  }

  const now = new Date();
  const active = rawTickets.filter((t) => {
    const label = stageLabels.get(`${t.properties.hs_pipeline}:${t.properties.hs_pipeline_stage}`);
    return label ? ACTIVE_STAGE_LABELS.has(label.stage) : false;
  });

  const companyIdsByTicket = await batchGetCompanyIdsFor('tickets', active.map((t) => t.id));

  return active.map((t) => {
    const p = t.properties;
    const label = stageLabels.get(`${p.hs_pipeline}:${p.hs_pipeline_stage}`);
    const companyId = (companyIdsByTicket.get(t.id) || [])[0] || null;
    const company = companyId ? companiesById.get(companyId) : null;
    const rawCategory = p.category_2_0 || p.hs_ticket_category || null;
    return {
      ticketId: t.id,
      subject: p.subject || '(no subject)',
      category: rawCategory != null ? (CATEGORY_2_0_LABELS[rawCategory] ?? rawCategory) : null,
      pipeline: label?.pipeline || p.hs_pipeline,
      stage: label?.stage || p.hs_pipeline_stage,
      priority: p.hs_ticket_priority || null,
      createdAt: p.createdate || null,
      lastModifiedAt: p.hs_lastmodifieddate || null,
      ageDays: daysBetween(p.createdate, now),
      companyId,
      companyName: company?.name || (companyId ? '(company not in portfolio list)' : null),
      arrCents: company?.arrCents ?? null,
      tier: company?.tier ?? null,
      accountManagerName: company?.accountManagerName ?? null,
      url: hubspotRecordUrl('ticket', t.id),
    };
  });
}

module.exports = { getActiveRequestRows };
