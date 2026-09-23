/**
 * Renders one account's full Contract Truth report (products, ALIS
 * subdomain/admin id, live entitlements if a check has been run, deals) to
 * PDF — Aaron, Sep 2026: "can we make the full account truth report
 * exportable to excel and pdf." Same approach as alis-hub's
 * accountHealthPdf.js: a plain HTML string rendered via Playwright's own
 * page.pdf(), not a PDF-specific library (already a dependency here via
 * server/automation/playwright — no login/live-site navigation needed
 * since this only ever renders data the client already fetched and sent
 * in the request body).
 */
const { newPage } = require('../automation/playwright/browser');

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function usd(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

function pillsHtml(items, cls = 'pill') {
  if (!items || items.length === 0) return '<p class="muted">None recorded.</p>';
  return `<div class="pills">${items.map((p) => `<span class="${cls}">${esc(p)}</span>`).join('')}</div>`;
}

function dealsTableHtml(deals) {
  if (!deals || deals.length === 0) return '<p class="muted">No deals found for this account.</p>';
  const rows = deals.map((d) => `
    <tr>
      <td>${esc(d.dealName)}</td>
      <td>${d.isClosed ? (d.isWon ? 'Closed Won' : 'Closed Lost') : 'Open'}</td>
      <td>${usd(d.arrValue)}</td>
      <td>${d.closeDate ? esc(d.closeDate.slice(0, 10)) : '—'}</td>
      <td>${d.lineItemsBlocked ? 'blocked (scopes)' : (d.lineItems?.length ? esc(d.lineItems.map((li) => li.name).join(', ')) : '—')}</td>
    </tr>`).join('');
  return `
    <table>
      <thead><tr><th>Deal</th><th>Status</th><th>ARR</th><th>Close Date</th><th>Line Items</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

const STATUS_LABEL = {
  sold_not_enabled: 'Sold — nothing enabled',
  enabled_not_sold: 'Enabled — not recorded as sold',
  aligned: 'Sold & enabled',
  not_applicable: 'Not sold',
  uncategorized: 'Uncategorized',
};

function entitlementsHtml(liveEntitlements) {
  if (!liveEntitlements) return '<p class="muted">No live ALIS Admin check has been run for this account.</p>';
  const captured = new Date(liveEntitlements.capturedAt).toLocaleString();
  const categories = liveEntitlements.categories.map((c) => `
    <div class="category">
      <p class="category-head"><strong>${esc(c.name)}</strong> — ${c.enabledCount} of ${c.totalCount} on
        <span class="status">${esc(STATUS_LABEL[c.status] || c.status)}</span>
      </p>
      ${pillsHtml(c.items.filter((f) => f.enabled).map((f) => f.label), 'pill pill-on')}
    </div>`).join('');
  return `
    <p class="muted">${liveEntitlements.enabledCount} of ${liveEntitlements.totalFlagCount} entitlements on, as of ${esc(captured)}.</p>
    ${categories}`;
}

function buildHtml({ account, truth, liveEntitlements }) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, Arial, sans-serif; color: #1c1917; padding: 32px; font-size: 12px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 1px solid #e7e5e4; padding-bottom: 4px; }
  .subtitle { color: #78716c; margin: 0 0 20px; }
  .meta { display: flex; gap: 24px; margin-bottom: 16px; }
  .meta div { flex: 1; }
  .meta .label { color: #78716c; font-size: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
  .meta .value { font-size: 15px; font-weight: 600; }
  .pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .pill { font-size: 11px; padding: 2px 9px; border-radius: 999px; background: #fef3e2; border: 1px solid #e7e5e4; }
  .pill-on { background: #e8f5ec; border-color: #b7dfc3; }
  .muted { color: #78716c; font-style: italic; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th, td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #e7e5e4; font-size: 11px; }
  th { color: #78716c; text-transform: uppercase; font-size: 9px; letter-spacing: 0.03em; }
  .category { margin-bottom: 10px; }
  .category-head { margin: 0 0 4px; font-size: 11.5px; }
  .status { color: #78716c; font-weight: normal; margin-left: 6px; }
  .footer { margin-top: 28px; color: #a8a29e; font-size: 9px; }
</style></head>
<body>
  <h1>${esc(account.name)}</h1>
  <p class="subtitle">Account Truth report</p>

  <div class="meta">
    <div><div class="label">Tier</div><div class="value">${account.tier ?? '—'}</div></div>
    <div><div class="label">ARR</div><div class="value">${usd(account.arrCents != null ? account.arrCents / 100 : null)}</div></div>
    <div><div class="label">Package</div><div class="value">${esc(account.package) || '—'}</div></div>
    <div><div class="label">ALIS Subdomain</div><div class="value">${esc(account.companyHost) || '—'}</div></div>
    <div><div class="label">ALIS Admin Company ID</div><div class="value">${esc(account.alisAdminCompanyId) || '—'}</div></div>
  </div>

  <h2>Enabled — per HubSpot's alis_products field</h2>
  ${pillsHtml(account.products)}

  <h2>Live ALIS Admin Check</h2>
  ${entitlementsHtml(liveEntitlements)}

  <h2>Deals</h2>
  ${dealsTableHtml(truth?.deals)}

  <p class="footer">Generated ${new Date().toLocaleString()} — ALIS Product Hub</p>
</body></html>`;
}

/** Renders the report to a PDF Buffer. No login/navigation — everything needed is already in `account`/`truth`/`liveEntitlements`, passed in from the client's own already-loaded state. */
async function renderAccountTruthPdf({ account, truth, liveEntitlements }) {
  const page = await newPage();
  try {
    await page.setContent(buildHtml({ account, truth, liveEntitlements }), { waitUntil: 'networkidle' });
    return await page.pdf({ format: 'Letter', printBackground: true, margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' } });
  } finally {
    await page.context().close();
  }
}

module.exports = { renderAccountTruthPdf };
