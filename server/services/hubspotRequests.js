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
const { hubspotRequest, getPipelineStageLabels, getPropertyOptionLabels, batchGetCompanyIdsFor, hubspotRecordUrl, chunk } = require('./hubspotClient');

const CATEGORY_2_0_LABELS = {
  false: 'General Question',
  true: 'Issue',
  Project: 'General Project',
  'ALIS Bug': 'ALIS Escalation',
};

// HubSpot's built-in hs_ticket_category (the fallback when category_2_0 is
// blank) labels FEATURE_REQUEST as "Enhancement" in the UI, and it shows
// up in compound values like "Issue;FEATURE_REQUEST" too — alis-hub counts
// all of these as enhancement asks (its isEnhancementIshCategory).
const FEATURE_REQUEST_PATTERN = /feature_request/i;
const HS_TICKET_CATEGORY_LABELS = { GENERAL_INQUIRY: 'General Question' };

// No "focus" field exists on tickets; this form question is the closest
// (ALIS HQ (Domo) / ALIS App / ALIS Pay / ALIS Connect / AI). Its stored
// values are placeholders ("Option 1"), so labels are resolved live.
const ENHANCEMENT_FOCUS_PROPERTY = 'what_type_of_enhancement_request_is_this_';

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
  'alis_module', ENHANCEMENT_FOCUS_PROPERTY, 'hs_pinned_engagement_id',
];

function resolveCategory(p) {
  if (p.category_2_0) return CATEGORY_2_0_LABELS[p.category_2_0] ?? p.category_2_0;
  const hs = p.hs_ticket_category;
  if (!hs) return null;
  if (FEATURE_REQUEST_PATTERN.test(hs)) return 'Enhancement';
  return HS_TICKET_CATEGORY_LABELS[hs] ?? hs;
}

function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Map<engagementId, plainText> for pinned notes. A pinned engagement can also be an email/call/task — those ids just don't resolve as notes and are skipped. */
async function getPinnedNoteText(engagementIds) {
  const result = new Map();
  for (const batch of chunk([...new Set(engagementIds)], 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body'],
      inputs: batch.map((id) => ({ id })),
    });
    // 207 = some ids weren't notes; the ones that were still come back in results.
    if (status !== 200 && status !== 207) {
      throw new Error(`HubSpot pinned-note batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    for (const note of body.results || []) {
      const text = note.properties?.hs_note_body ? htmlToText(note.properties.hs_note_body) : '';
      if (text) result.set(note.id, text);
    }
  }
  return result;
}

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

  let focusLabels = new Map();
  try {
    focusLabels = await getPropertyOptionLabels('tickets', ENHANCEMENT_FOCUS_PROPERTY);
  } catch {
    // Falls back to the raw stored value.
  }

  const now = new Date();
  const companyIdsByTicket = await batchGetCompanyIdsFor('tickets', rawTickets.map((t) => t.id));

  const rows = rawTickets
    .map((t) => {
      const p = t.properties;
      const label = stageLabels.get(`${p.hs_pipeline}:${p.hs_pipeline_stage}`);
      const category = resolveCategory(p);
      const isOpen = !p.closed_date;
      const companyId = (companyIdsByTicket.get(t.id) || [])[0] || null;
      const company = companyId ? companiesById.get(companyId) : null;
      const rawFocus = p[ENHANCEMENT_FOCUS_PROPERTY];
      return {
        ticketId: t.id,
        subject: p.subject || '(no subject)',
        category,
        module: p.alis_module || null,
        enhancementFocus: rawFocus ? (focusLabels.get(rawFocus) || rawFocus) : null,
        pinnedEngagementId: p.hs_pinned_engagement_id || null,
        pinnedNote: null,
        isEscalation: category === 'ALIS Escalation',
        isEnhancementRequest: category === 'Enhancement' || FEATURE_REQUEST_PATTERN.test(p.hs_ticket_category || '') || /enhancement/i.test(p.subject || ''),
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

  // Only escalations/enhancements — the two surfaces that show pinned notes
  // — so this stays a handful of batch calls, not one per ticket.
  const pinnedIds = rows
    .filter((r) => r.pinnedEngagementId && (r.isEscalation || r.isEnhancementRequest))
    .map((r) => r.pinnedEngagementId);
  if (pinnedIds.length > 0) {
    try {
      const noteText = await getPinnedNoteText(pinnedIds);
      for (const r of rows) {
        if (r.pinnedEngagementId) r.pinnedNote = noteText.get(r.pinnedEngagementId) || null;
      }
    } catch (err) {
      console.warn('Pinned-note lookup failed; continuing without notes:', err.message);
    }
  }
  return rows;
}

/** Merges each account's open/closed Enhancement Request ticket counts onto it — shared by server/api/export.js (Dashboard's Accounts table) and server/api/accounts.js (Account Truth's list) so both surfaces agree. Zero is a real, common state, not missing data. */
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

module.exports = { getTicketHistory, withEnhancementCounts };
