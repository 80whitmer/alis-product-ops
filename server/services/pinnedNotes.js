/**
 * HubSpot pinned notes (hs_pinned_engagement_id) as display-safe segments:
 * note HTML → plain-text strings and {label, href} links, so links stay
 * clickable without ever rendering HubSpot HTML. Only http(s) links
 * survive. Ported from alis-hub's server/services/pinnedNotes.js (kept in
 * sync by convention, not import).
 */
const { hubspotRequest, chunk } = require('./hubspotClient');

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function fragmentToText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  ).replace(/\n{3,}/g, '\n\n');
}

function htmlToText(html) {
  return fragmentToText(html || '').trim();
}

function safeHref(raw) {
  try {
    const url = new URL(raw);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.') || /^[\d.]+$/.test(url.hostname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const BARE_URL = /https?:\/\/[^\s<>"')]+/g;

function linkifyText(text, out) {
  let last = 0;
  for (const m of text.matchAll(BARE_URL)) {
    const raw = m[0].replace(/[.,;:!?]+$/, '');
    const href = safeHref(raw);
    if (!href) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push({ label: raw, href });
    last = m.index + raw.length;
  }
  if (last < text.length) out.push(text.slice(last));
}

function htmlToSegments(html) {
  const out = [];
  const anchor = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let last = 0;
  let m;
  while ((m = anchor.exec(html))) {
    linkifyText(fragmentToText(html.slice(last, m.index)), out);
    const href = safeHref(decodeEntities(m[1]));
    const label = fragmentToText(m[2]).trim();
    if (href) out.push({ label: label || href, href });
    else if (label) out.push(label);
    last = anchor.lastIndex;
  }
  linkifyText(fragmentToText(html.slice(last)), out);
  if (typeof out[0] === 'string') out[0] = out[0].replace(/^\s+/, '');
  if (typeof out[out.length - 1] === 'string') out[out.length - 1] = out[out.length - 1].replace(/\s+$/, '');
  return out.filter((s) => s !== '');
}

/** Map<id, {text, segments}>. Ids that aren't notes (a pinned email/call) are simply absent. */
async function getPinnedNotes(ids) {
  const result = new Map();
  for (const batch of chunk([...new Set(ids.map(String))], 100)) {
    const { status, body } = await hubspotRequest('POST', '/crm/v3/objects/notes/batch/read', {
      properties: ['hs_note_body'],
      inputs: batch.map((id) => ({ id })),
    });
    // 207 = some ids weren't notes; the ones that were still come back.
    if (status !== 200 && status !== 207) {
      throw new Error(`HubSpot pinned-note batch read failed (${status}): ${JSON.stringify(body)}`);
    }
    for (const n of body.results || []) {
      const html = n.properties?.hs_note_body || '';
      const text = htmlToText(html);
      if (text) result.set(String(n.id), { text, segments: htmlToSegments(html) });
    }
  }
  return result;
}

/** Sets pinnedNote (plain text, for search/export) and pinnedNoteSegments (for display) on each row that has a pinnedEngagementId. Failure degrades to no notes rather than failing the whole pull. */
async function attachPinnedNotes(rows, label) {
  const ids = rows.map((r) => r.pinnedEngagementId).filter(Boolean);
  if (ids.length === 0) return;
  try {
    const notes = await getPinnedNotes(ids);
    for (const r of rows) {
      const note = r.pinnedEngagementId ? notes.get(String(r.pinnedEngagementId)) : null;
      r.pinnedNote = note?.text || null;
      r.pinnedNoteSegments = note?.segments || null;
    }
  } catch (err) {
    console.warn(`${label} pinned-note lookup failed; continuing without notes:`, err.message);
  }
}

module.exports = { getPinnedNotes, attachPinnedNotes, htmlToText };
