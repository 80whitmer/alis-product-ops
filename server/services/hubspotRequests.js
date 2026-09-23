/**
 * Portfolio-wide ticket history pull — every ALIS Escalation / Enhancement
 * Request ticket (open AND closed) within `lookbackDays`, joined to its
 * account. Broader than the original v1 "currently active requests" export
 * (see git history): the trend/heatmap charts on the dashboard need closed
 * tickets' `closedAt` too, not just what's still open today.
 *
 * Same category_2_0 convention, and the same open/closed/Top-3
 * classification rules, as alis-hub's server/services/hubspotTickets.js —
 * ported and adapted for a single portfolio-wide search instead of that
 * file's per-company association pull (616 companies × per-company calls
 * would be far too slow/rate-limited here; one paginated ticket search plus
 * a batch company-association lookup scales the same way
 * hubspotAccounts.js's company pull already does).
 */
const { hubspotRequest, getPipelineStageLabels, batchGetCompanyIdsFor, hubspotRecordUrl } = require('./hubspotClient');

const CATEGORY_2_0_LABELS = {
  false: 'General Question',
  true: 'Issue',
  Project: 'General Project',
  'ALIS Bug': 'ALIS Escalation',
};

// Internal team/process-tracking noise, not client support work — same
// exclusion alis-hub applies at its one shared ticket source, so every
// downstream count/chart here is clean without a separate fix per section.
const EXCLUDED_CATEGORY = 'ALIS Internal';

// The pipeline-stage label a ticket must resolve to for it to count as
// "status-flagged Top 3" — same signal as alis-hub's TOP_3_STATUS_LABEL, one
// of two independent Top-3 signals (the other is the `top_3` tag property);
// a ticket carrying either counts.
const TOP_3_STATUS_LABEL = 'Top 3 Enhancements';

const TICKET_PROPERTIES = [
  'subject', 'hs_pipeline', 'hs_pipeline_stage', 'category_2_0', 'hs_ticket_category',
  'hs_ticket_priority', 'createdate', 'hs_lastmodifieddate', 'closed_date', 'top_3', 'next_step',
];

function daysBetween(fromIso, toDate) {
  if (!fromIso) return null;
  return Math.round((toDate.getTime() - new Date(fromIso).getTime()) / 86400000);
}

/** Every ticket touched in the last `lookbackDays` — a bounded proxy for "not ancient/irrelevant" that doesn't require knowing every pipeline's closed-stage IDs up front. Closing a ticket touches hs_lastmodifieddate, so any ticket closed within the window is captured even if it's old; a long-open, long-untouched ticket can still fall outside it, same tradeoff the original v1 export accepted. */
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
 * Returns raw rows: one per ticket (open or closed) touched in the lookback
 * window, joined to its associated company where one exists, tagged with
 * the classification flags (isEscalation/isEnhancementRequest/isTopThree/
 * isOpen) the dashboard's stat tiles, tier charts, and trend/heatmap charts
 * all key off of. No scoring — ARR/tier are columns, not multiplied into
 * anything.
 */
async function getTicketHistory({ lookbackDays = 400, companiesById = new Map() } = {}) {
  const rawTickets = await searchRecentTickets(lookbackDays);

  let stageLabels = new Map();
  try {
    stageLabels = await getPipelineStageLabels('tickets');
  } catch {
    // Falls through to raw pipeline/stage IDs below — still useful, just less readable, and isTopThree falls back to the tag-only signal.
  }

  const now = new Date();
  const companyIdsByTicket = await batchGetCompanyIdsFor('tickets', rawTickets.map((t) => t.id));

  return rawTickets
    .map((t) => {
      const p = t.properties;
      const label = stageLabels.get(`${p.hs_pipeline}:${p.hs_pipeline_stage}`);
      const rawCategory = p.category_2_0 || p.hs_ticket_category || null;
      const category = rawCategory != null ? (CATEGORY_2_0_LABELS[rawCategory] ?? rawCategory) : null;
      const isOpen = !p.closed_date;
      const companyId = (companyIdsByTicket.get(t.id) || [])[0] || null;
      const company = companyId ? companiesById.get(companyId) : null;
      return {
        ticketId: t.id,
        subject: p.subject || '(no subject)',
        category,
        isEscalation: category === 'ALIS Escalation',
        isEnhancementRequest: category === 'Enhancement' || /enhancement/i.test(p.subject || ''),
        isTopThree: (p.top_3 != null && p.top_3 !== '') || label?.stage === TOP_3_STATUS_LABEL,
        isOpen,
        pipeline: label?.pipeline || p.hs_pipeline,
        stage: label?.stage || p.hs_pipeline_stage,
        priority: p.hs_ticket_priority || null,
        createdAt: p.createdate || null,
        closedAt: p.closed_date || null,
        lastModifiedAt: p.hs_lastmodifieddate || null,
        ageDays: daysBetween(p.createdate, isOpen ? now : new Date(p.closed_date)),
        nextStep: p.next_step || null,
        companyId,
        companyName: company?.name || (companyId ? '(company not in portfolio list)' : null),
        arrCents: company?.arrCents ?? null,
        tier: company?.tier ?? null,
        totalCapacity: company?.totalCapacity ?? null,
        accountManagerName: company?.accountManagerName ?? null,
        url: hubspotRecordUrl('ticket', t.id),
      };
    })
    .filter((t) => t.category !== EXCLUDED_CATEGORY);
}

module.exports = { getTicketHistory };
