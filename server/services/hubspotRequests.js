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
const { inferModule } = require('./moduleInference');
const { attachPinnedNotes, htmlToText } = require('./pinnedNotes');

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
// Same as alis-hub's LONG_TERM_STATUS_LABEL — a ticket staged here (and not
// also Top 3) is the other half of alis-hub's narrower "staged" Enhancement
// Requests headline figure (Sep 2026, Aaron: "why does the AM dashboard
// capture 157 Enhancement requests AND the Product hub Dashboard has 560").
const LONG_TERM_STATUS_LABEL = 'Long-Term Projects';

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

/** Map<ticketId, plainText description> — fetched separately (not on the portfolio-wide search) since only escalations missing a module need it. */
async function getTicketDescriptions(ticketIds) {
  const result = new Map();
  for (const batch of chunk(ticketIds, 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/tickets/batch/read', {
      properties: ['content'],
      inputs: batch.map((id) => ({ id })),
    });
    if (status !== 200 && status !== 207) {
      throw new Error(`HubSpot ticket description batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    for (const t of body.results || []) {
      if (t.properties?.content) result.set(t.id, htmlToText(t.properties.content));
    }
  }
  return result;
}

function daysBetween(fromIso, toDate) {
  if (!fromIso) return null;
  return Math.round((toDate.getTime() - new Date(fromIso).getTime()) / 86400000);
}

/**
 * Every ticket touched in the last `lookbackDays`, PLUS every ticket that's
 * still open regardless of age. Originally just the modified-date window
 * (a bounded proxy for "not ancient/irrelevant" that doesn't require
 * knowing every pipeline's closed-stage IDs up front) — but a long-open,
 * long-untouched ticket falls outside that window while still being a real
 * open Enhancement Request, and alis-hub's own per-company pull has no
 * such window at all. Confirmed live (Sep 2026, Aaron: "we are super close
 * on the enhancement call out... Team AM... 157, but on the product hub
 * side it is reading 147"): the entire 10-ticket gap was in the Long-Term
 * Projects bucket specifically — exactly the kind of deprioritized,
 * rarely-touched backlog ticket this window used to silently drop.
 * `closed_date` NOT_HAS_PROPERTY is HubSpot's own "still open" signal (same
 * property this file's own `isOpen` already keys off of), OR'd with the
 * existing window so closed-ticket history for the trend/heatmap charts is
 * unaffected — closed tickets still need the window, only open ones don't.
 */
async function searchRecentTickets(lookbackDays) {
  const sinceIso = new Date(Date.now() - lookbackDays * 86400000).toISOString();
  const tickets = [];
  let after;
  do {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/tickets/search', {
      filterGroups: [
        { filters: [{ propertyName: 'closed_date', operator: 'NOT_HAS_PROPERTY' }] },
        { filters: [{ propertyName: 'hs_lastmodifieddate', operator: 'GTE', value: sinceIso }] },
      ],
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
        moduleInferred: null,
        enhancementFocus: rawFocus ? (focusLabels.get(rawFocus) || rawFocus) : null,
        pinnedEngagementId: p.hs_pinned_engagement_id || null,
        pinnedNote: null,
        pinnedNoteSegments: null,
        isEscalation: category === 'ALIS Escalation',
        // Sep 2026, Aaron: "why does the AM dashboard capture 157
        // Enhancement requests AND the Product hub Dashboard has 560" —
        // this used to also OR in a raw hs_ticket_category FEATURE_REQUEST
        // match regardless of category_2_0, so a ticket whose account
        // manager had explicitly set category_2_0 to something else
        // entirely (Billing, ALIS Bug, ...) could still get counted here
        // off a stale/secondary hs_ticket_category value. `category` above
        // already resolves hs_ticket_category as a FALLBACK only when
        // category_2_0 is blank (see resolveCategory) — matching alis-hub's
        // own isEnhancementRequest exactly (`t.category === 'Enhancement'
        // || /enhancement/i.test(t.subject)`) means whichever category
        // field actually won for this ticket is respected once, not
        // second-guessed by the raw hs_ticket_category here too.
        isEnhancementRequest: category === 'Enhancement' || /enhancement/i.test(p.subject || ''),
        isTopThree: (p.top_3 != null && p.top_3 !== '') || label?.stage === TOP_3_STATUS_LABEL,
        // alis-hub's narrower "staged" bucket (its isLesserEnhancement) —
        // whether Top 3 wins out over this for display purposes is decided
        // by the consumer (Dashboard.jsx), same as alis-hub keeping the two
        // as separate functions rather than baking the exclusion in here.
        isLongTermEnhancement: label?.stage === LONG_TERM_STATUS_LABEL,
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
        // Sep 2026, Aaron: "put the important links beside company name
        // throughout the app and reports" — company already carries these
        // (export.js's withAlisMappings runs before getTicketHistory is
        // called), just not previously threaded onto the ticket row itself.
        companyHost: company?.companyHost ?? null,
        alisAdminCompanyId: company?.alisAdminCompanyId ?? null,
        url: hubspotRecordUrl('ticket', t.id),
      };
    })
    .filter((t) => t.category !== EXCLUDED_CATEGORY);

  // Only escalations/enhancements — the two surfaces that show pinned notes
  // — so this stays a handful of batch calls, not one per ticket.
  await attachPinnedNotes(rows.filter((r) => r.isEscalation || r.isEnhancementRequest), 'Ticket');

  const needModule = rows.filter((r) => r.isEscalation && !r.module);
  let descriptions = new Map();
  try {
    descriptions = await getTicketDescriptions(needModule.map((r) => r.ticketId));
  } catch (err) {
    console.warn('Ticket description lookup failed; inferring module from subject/next step only:', err.message);
  }
  for (const r of needModule) {
    r.moduleInferred = inferModule({ subject: r.subject, description: descriptions.get(r.ticketId), nextStep: r.nextStep });
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
