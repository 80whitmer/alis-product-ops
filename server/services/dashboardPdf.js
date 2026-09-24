/**
 * Portfolio-wide Dashboard PDF — Sep 2026, Aaron: "are the Excel and pdf
 * exports for the Product hub dashboard thorough, robust, illustrative,
 * engaging, graphical where appropriate, punchy -- value delivered!!" The
 * honest answer before this file existed was no: there was no PDF export
 * at all, and the Excel export was a pure "just serve up the data" raw
 * dump (see dataExport.js's own doc comment). This mirrors the same
 * Playwright page.pdf() approach already used for accountTruthPdf.js/
 * alis-hub's accountHealthPdf.js — a plain HTML+CSS string, no JS charting
 * library needed since CSS bars render perfectly well in a PDF and don't
 * need a canvas/SVG round-trip. Renders whatever the client already has
 * loaded (companies/requests/kpi from GET /api/export) — no live HubSpot
 * pull here, same as accountTruthPdf.js's own reasoning.
 */
const { newPage } = require('../automation/playwright/browser');

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR = { 'Tier 1': '#16a34a', 'Tier 2': '#2563eb', 'Tier 3': '#ea580c', 'Tier 4': '#dc2626', Unassigned: '#737373' };

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function usd(cents) {
  return cents == null ? '—' : Number(cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function num(n) {
  return (n || 0).toLocaleString('en-US');
}

function kpiTileHtml(label, value, accent) {
  return `<div class="tile ${accent ? 'tile-accent' : ''}"><div class="tile-value">${esc(value)}</div><div class="tile-label">${esc(label)}</div></div>`;
}

/** Horizontal bar-per-tier chart, CSS-only — width% scaled to the largest tier's value so the tallest bar always fills the row. */
function tierBarChartHtml(title, kpi, metricKey, formatFn) {
  const values = TIER_ORDER.map((t) => kpi?.byTier?.[t]?.[metricKey] ?? 0);
  const max = Math.max(...values, 1);
  const total = values.reduce((s, v) => s + v, 0);
  const rows = TIER_ORDER.map((tier, i) => {
    const pct = Math.round((values[i] / max) * 100);
    return `
      <div class="bar-row">
        <span class="bar-label">${esc(tier)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${TIER_COLOR[tier]}"></div></div>
        <span class="bar-value">${esc(formatFn(values[i]))}</span>
      </div>`;
  }).join('');
  return `
    <div class="chart-block">
      <h3>${esc(title)} <span class="chart-total">Total: ${esc(formatFn(total))}</span></h3>
      ${rows}
    </div>`;
}

// One general client-accessible ALIS link per account (Sep 2026, Aaron:
// "the ALIS links anchored by their subdomain would be great -- not the
// admin links though those are not accessible to clients") — same
// bare-subdomain-root convention as dataExport.js's alisPortalUrl, kept in
// sync by convention (server vs. client file, not a shared import).
function alisPortalUrl(companyHost) {
  const first = String(companyHost || '').split(',')[0].trim();
  return first ? `https://${first}.alisonline.com` : null;
}

function top10TableHtml(companies) {
  const top10 = [...companies].sort((a, b) => (b.arrCents || 0) - (a.arrCents || 0)).slice(0, 10);
  const rows = top10.map((c) => {
    const portalUrl = alisPortalUrl(c.companyHost);
    return `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${c.tier ?? '—'}</td>
      <td class="num">${esc(usd(c.arrCents))}</td>
      <td class="num">${num(c.communityCount)}</td>
      <td>${portalUrl ? `<a href="${esc(portalUrl)}">Open ALIS →</a>` : '—'}</td>
    </tr>`;
  }).join('');
  return `
    <table>
      <thead><tr><th>Company</th><th>Tier</th><th>ARR</th><th>Communities</th><th>ALIS Portal</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/**
 * Category-level entitlements summary — one bar per category showing its
 * average % enabled (Sep 2026, Aaron: "rolled up into the Dashboard
 * exportables excel and PDF"). Deliberately category-level, not
 * per-flag — a PDF page can't hold ~130 individual flag rows the way the
 * Excel "Entitlements" sheet does (dataExport.js's addEntitlementsSheet);
 * the full per-flag breakdown lives there instead.
 */
function entitlementsSectionHtml(rollup) {
  if (!rollup?.categories?.length) return '';
  const rows = rollup.categories.map((c) => {
    const avgPct = c.flags.length > 0 ? Math.round((c.flags.reduce((s, f) => s + f.pctEnabled, 0) / c.flags.length) * 10) / 10 : 0;
    return { label: `${c.name} (${c.flags.length})`, pct: avgPct };
  });
  const barRows = rows.map((r) => `
      <div class="bar-row">
        <span class="bar-label" style="width:140px">${esc(r.label)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${r.pct}%; background:#2563eb"></div></div>
        <span class="bar-value">${r.pct}%</span>
      </div>`).join('');
  return `
  <h2>Portfolio Entitlements</h2>
  <p class="subtitle" style="margin-bottom:10px">${esc(rollup.companiesChecked)} account(s) checked — a manual, on-demand ALIS admin scrape. Per-flag detail is in the Excel export's Entitlements sheet.</p>
  <div class="chart-block">${barRows}</div>`;
}

function buildHtml({ companies, totals, kpi, generatedAt, entitlementsRollup }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1c1917; padding: 32px; font-size: 12px; }
  h1 { font-size: 24px; margin: 0 0 2px; color: #1e293b; }
  h2 { font-size: 15px; margin: 28px 0 10px; border-bottom: 2px solid #f97316; padding-bottom: 6px; color: #1e293b; }
  h3 { font-size: 12.5px; margin: 0 0 10px; display: flex; justify-content: space-between; align-items: baseline; }
  .subtitle { color: #78716c; margin: 0 0 24px; font-size: 12px; }
  .tiles { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 8px; }
  .tile { border: 1px solid #e7e5e4; border-radius: 10px; padding: 14px; }
  .tile-accent { background: #fef3e2; border-color: #fbd8a8; }
  .tile-value { font-size: 22px; font-weight: 700; color: #1e293b; }
  .tile-accent .tile-value { color: #c2410c; }
  .tile-label { font-size: 10px; color: #78716c; text-transform: uppercase; letter-spacing: 0.03em; margin-top: 2px; }
  .chart-block { margin-bottom: 22px; page-break-inside: avoid; }
  .chart-total { font-weight: 400; font-size: 11px; color: #78716c; }
  .bar-row { display: flex; align-items: center; gap: 8px; margin-bottom: 5px; }
  .bar-label { width: 68px; font-size: 10.5px; color: #44403c; flex-shrink: 0; }
  .bar-track { flex: 1; background: #f5f5f4; border-radius: 4px; height: 14px; overflow: hidden; }
  .bar-fill { height: 100%; border-radius: 4px; }
  .bar-value { width: 90px; text-align: right; font-size: 10.5px; font-weight: 600; color: #1c1917; flex-shrink: 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e7e5e4; font-size: 11px; }
  th { color: #78716c; text-transform: uppercase; font-size: 9px; letter-spacing: 0.03em; }
  td.num, th:nth-child(3), th:nth-child(4) { text-align: right; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
  .footer { margin-top: 28px; color: #a8a29e; font-size: 9px; }
</style></head>
<body>
  <h1>ALIS Product Hub</h1>
  <p class="subtitle">Portfolio Report — as of ${esc(new Date(generatedAt).toLocaleString())}</p>

  <h2>Overview</h2>
  <div class="tiles">
    ${kpiTileHtml('Portfolio ARR', usd(totals.arrCents))}
    ${kpiTileHtml('Accounts', num(companies.length))}
    ${kpiTileHtml('Communities', num(totals.communities))}
    ${kpiTileHtml('Capacity (beds)', num(totals.capacityBeds))}
    ${kpiTileHtml('Enhancement Requests', num(totals.stagedEnhancements), true)}
    ${kpiTileHtml('— Top 3', num(totals.top3Enhancements), true)}
    ${kpiTileHtml('— Long-Term', num(totals.longTermEnhancements), true)}
    ${kpiTileHtml('Tickets: Escalation', num(totals.escalations), true)}
  </div>

  <h2>Portfolio KPIs by Tier</h2>
  <div class="grid-2">
    ${tierBarChartHtml('ARR by Tier', kpi, 'arrCents', usd)}
    ${tierBarChartHtml('New ARR This Year by Tier', kpi, 'arrAddedThisYearCents', usd)}
    ${tierBarChartHtml('Companies by Tier', kpi, 'companyCount', num)}
    ${tierBarChartHtml('Communities by Tier', kpi, 'communityCount', num)}
  </div>

  <h2>Top 10 Accounts by ARR</h2>
  ${top10TableHtml(companies)}

  ${entitlementsSectionHtml(entitlementsRollup)}

  <p class="footer">Generated ${esc(new Date().toLocaleString())} — ALIS Product Hub</p>
</body></html>`;
}

/** Renders the portfolio Dashboard report to a PDF Buffer. `totals` is the same enhancement/escalation/portfolio rollup dataExport.js's Excel Overview sheet computes — passed in from the client rather than recomputed here so the two exports can never drift apart on methodology. */
async function renderDashboardPdf({ companies, totals, kpi, generatedAt, entitlementsRollup }) {
  const page = await newPage();
  try {
    await page.setContent(buildHtml({ companies, totals, kpi, generatedAt, entitlementsRollup }), { waitUntil: 'networkidle' });
    return await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' } });
  } finally {
    await page.context().close();
  }
}

module.exports = { renderDashboardPdf };
