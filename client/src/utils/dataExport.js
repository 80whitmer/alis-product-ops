/**
 * V1 "just serve up the data" export — same ExcelJS + Blob-download
 * pattern as alis-hub's client/src/utils/accountHealthExport.js. The
 * column builders are shared by the holistic export (both sheets) and
 * the per-section exports (one sheet each) so they can't drift apart.
 */
import ExcelJS from 'exceljs';

function usd(cents) {
  return cents == null ? '' : Number((cents / 100).toFixed(2));
}

function download(workbook, filename) {
  return workbook.xlsx.writeBuffer().then((buffer) => {
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });
}

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

/**
 * One general client-accessible ALIS link per account for exports (Sep
 * 2026, Aaron: "the ALIS links anchored by their subdomain would be great
 * -- not the admin links though those are not accessible to clients").
 * Deliberately just the bare subdomain root, not any of AlisQuickLinks'
 * six more specific pages — a report row gets one clickable link, not a
 * menu. `companyHost` can be a comma-separated multi-host string (a
 * handful of accounts run more than one ALIS subdomain); only the first
 * is used here, same "one representative host" simplification a static
 * report needs (the on-screen AlisQuickLinks menu is where every host
 * still gets its own full set of links).
 */
function alisPortalUrl(companyHost) {
  const first = String(companyHost || '').split(',')[0].trim();
  return first ? `https://${first}.alisonline.com` : null;
}

/** An ExcelJS hyperlink cell value, or plain '' when there's no host to link to — keeps every ALIS Portal column typed consistently instead of mixing strings and hyperlink objects. */
function alisPortalCell(companyHost) {
  const url = alisPortalUrl(companyHost);
  return url ? { text: 'Open ALIS →', hyperlink: url } : '';
}

const TIER_ORDER = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Unassigned'];
const TIER_COLOR_ARGB = { 'Tier 1': 'FF16A34A', 'Tier 2': 'FF2563EB', 'Tier 3': 'FFEA580C', 'Tier 4': 'FFDC2626', Unassigned: 'FF737373' };

/** A single-row visual bar via a data-bar conditional format, same idea as the on-screen tier charts' color coding — the closest ExcelJS gets to an embedded chart without a much heavier native-chart integration. */
// Fixed 0-1 bounds, not 'min'/'max' auto-scaling — each bar is applied to a
// single cell (one tier's own row) so its "share of total" value could
// itself BE the min or max of its own one-cell range, which would either
// crash ExcelJS's renderer or always fill 100%. Column C already holds a
// 0-1 fraction (that tier's share of the portfolio total), so explicit
// numeric bounds of 0 and 1 make the bar length mean what it should.
// Excel's conditional-formatting schema requires each rule's priority to be
// unique within a worksheet; every call here used to hardcode priority: 1,
// which is what triggered the "Repaired Records" corruption dialog on open
// (Sep 2026 — a workbook with 15 same-priority dataBar rules on one sheet).
// A per-sheet counter keeps every rule's priority distinct.
let dataBarPriorityCounter = 0;

function resetDataBarPriority() {
  dataBarPriorityCounter = 0;
}

function addDataBar(sheet, ref, argb, min = 0, max = 1) {
  dataBarPriorityCounter += 1;
  sheet.addConditionalFormatting({
    ref,
    rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: min }, { type: 'num', value: max }], color: { argb }, priority: dataBarPriorityCounter }],
  });
}

/**
 * "Thorough, robust, illustrative, engaging, graphical where appropriate,
 * punchy — value delivered!!" (Sep 2026, Aaron) — the exports before this
 * were a pure "just serve up the data" raw dump (V1's own doc comment):
 * flat account/ticket rows with no summary, no visual weight, nothing a
 * leadership audience could open and immediately understand. This Overview
 * sheet leads the workbook with the same KPI/by-tier story the on-screen
 * Dashboard tells — portfolio totals, ARR/Companies/Communities by tier
 * with data-bar visualizations colored to match the app's own tier
 * palette, and a Top 10 by ARR leaderboard — before the reader ever gets
 * to the raw Accounts/Requests sheets.
 */
function addOverviewSheet(workbook, { companies, kpi, totals, generatedAt }) {
  resetDataBarPriority();
  const sheet = workbook.addWorksheet('Overview', { views: [{ state: 'frozen', ySplit: 0 }] });
  sheet.columns = [{ width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }];

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'ALIS Product Hub — Portfolio Overview';
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1E293B' } };
  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `As of ${new Date(generatedAt).toLocaleString()}`;
  sheet.getCell('A2').font = { italic: true, color: { argb: 'FF78716C' } };

  let row = 4;
  sheet.getCell(`A${row}`).value = 'Portfolio KPIs';
  sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  const kpiRows = [
    ['Portfolio ARR', usd(totals.arrCents)],
    ['Active Accounts', companies.length],
    ['Communities', totals.communities],
    ['Capacity (beds)', totals.capacityBeds],
    ['Enhancement Requests (Top 3 + Long-Term)', totals.stagedEnhancements],
    ['  — Top 3', totals.top3Enhancements],
    ['  — Long-Term', totals.longTermEnhancements],
    ['  — Other open (categorized, not yet staged)', totals.otherOpenEnhancements],
    ['Tickets: Escalation (open)', totals.escalations],
  ];
  for (const [label, value] of kpiRows) {
    sheet.getCell(`A${row}`).value = label;
    sheet.getCell(`B${row}`).value = value;
    sheet.getCell(`B${row}`).font = { bold: true };
    if (label === 'Portfolio ARR') sheet.getCell(`B${row}`).numFmt = '$#,##0';
    row += 1;
  }

  row += 1;
  function byTierBlock(title, metricKey, formatFn, isCurrency) {
    sheet.getCell(`A${row}`).value = title;
    sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
    row += 1;
    const headerRow = row;
    sheet.getCell(`A${row}`).value = 'Tier';
    sheet.getCell(`B${row}`).value = 'Value';
    sheet.getCell(`C${row}`).value = 'Share';
    sheet.getRow(row).font = { bold: true, color: { argb: 'FF78716C' } };
    row += 1;
    const startDataRow = row;
    const values = TIER_ORDER.map((t) => kpi?.byTier?.[t]?.[metricKey] ?? 0);
    const total = values.reduce((s, v) => s + v, 0);
    TIER_ORDER.forEach((tier, i) => {
      sheet.getCell(`A${row}`).value = tier;
      sheet.getCell(`B${row}`).value = formatFn ? formatFn(values[i]) : values[i];
      if (isCurrency) sheet.getCell(`B${row}`).numFmt = '$#,##0';
      sheet.getCell(`C${row}`).value = total > 0 ? values[i] / total : 0;
      sheet.getCell(`C${row}`).numFmt = '0.0%';
      row += 1;
    });
    const endDataRow = row - 1;
    sheet.getCell(`A${row}`).value = 'Total';
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = formatFn ? formatFn(total) : total;
    sheet.getCell(`B${row}`).font = { bold: true };
    if (isCurrency) sheet.getCell(`B${row}`).numFmt = '$#,##0';
    row += 2;
    // One data-bar block per tier row's own color would need per-row conditional
    // formats (ExcelJS doesn't support per-cell color in one dataBar rule) —
    // applied per-tier-row below so each bar matches that tier's on-screen color.
    for (let r = startDataRow; r <= endDataRow; r++) {
      const tier = TIER_ORDER[r - startDataRow];
      addDataBar(sheet, `C${r}:C${r}`, TIER_COLOR_ARGB[tier]);
    }
    void headerRow;
  }

  byTierBlock('ARR by Tier', 'arrCents', (v) => usd(v), true);
  byTierBlock('Companies by Tier', 'companyCount');
  byTierBlock('Communities by Tier', 'communityCount');

  sheet.getCell(`A${row}`).value = 'Top 10 Accounts by ARR';
  sheet.getCell(`A${row}`).font = { bold: true, size: 12 };
  row += 1;
  sheet.getCell(`A${row}`).value = 'Company';
  sheet.getCell(`B${row}`).value = 'Tier';
  sheet.getCell(`C${row}`).value = 'ARR';
  sheet.getCell(`D${row}`).value = 'ALIS Portal';
  sheet.getRow(row).font = { bold: true, color: { argb: 'FF78716C' } };
  row += 1;
  const top10 = [...companies].sort((a, b) => (b.arrCents || 0) - (a.arrCents || 0)).slice(0, 10);
  for (const c of top10) {
    sheet.getCell(`A${row}`).value = c.name;
    sheet.getCell(`B${row}`).value = c.tier ?? '—';
    sheet.getCell(`C${row}`).value = usd(c.arrCents);
    sheet.getCell(`C${row}`).numFmt = '$#,##0';
    sheet.getCell(`D${row}`).value = alisPortalCell(c.companyHost);
    row += 1;
  }

  return sheet;
}

function addAccountsSheet(workbook, companies, sheetName = 'Accounts') {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Company', key: 'name', width: 34 },
    { header: 'HubSpot ID', key: 'id', width: 14 },
    { header: 'Account Manager', key: 'accountManagerName', width: 18 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'ARR ($)', key: 'arr', width: 14 },
    { header: 'Communities', key: 'communityCount', width: 12 },
    { header: 'Capacity (beds)', key: 'totalCapacity', width: 14 },
    { header: 'Open Deals', key: 'openDealsCount', width: 11 },
    { header: 'Open Deal Value ($)', key: 'openDealValue', width: 16 },
    { header: `ARR Added (${new Date().getFullYear()}) ($)`, key: 'arrAdded', width: 16 },
    { header: 'Open Enhancement Requests', key: 'openEnhancementCount', width: 14 },
    { header: 'Closed Enhancement Requests', key: 'closedEnhancementCount', width: 14 },
    { header: 'Last Activity', key: 'lastActivityDate', width: 14 },
    { header: 'Lifecycle Stage (raw)', key: 'lifecycleStage', width: 20 },
    { header: 'ALIS Portal', key: 'alisPortal', width: 16 },
  ];
  for (const c of companies) {
    sheet.addRow({
      name: c.name,
      id: c.id,
      accountManagerName: c.accountManagerName,
      tier: c.tier,
      arr: usd(c.arrCents),
      communityCount: c.communityCount,
      totalCapacity: c.totalCapacity,
      openDealsCount: c.openDealsCount,
      openDealValue: usd(c.openDealValueCents),
      arrAdded: usd(c.arrAddedThisYearCents),
      openEnhancementCount: c.openEnhancementCount ?? 0,
      closedEnhancementCount: c.closedEnhancementCount ?? 0,
      lastActivityDate: c.lastActivityDate ? c.lastActivityDate.slice(0, 10) : '',
      lifecycleStage: c.lifecycleStage,
      alisPortal: alisPortalCell(c.companyHost),
    });
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

function addRequestsSheet(workbook, requests, sheetName) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Company', key: 'companyName', width: 30 },
    { header: 'Account Manager', key: 'accountManagerName', width: 18 },
    { header: 'Issue Type (raw)', key: 'category', width: 18 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'ARR ($)', key: 'arr', width: 14 },
    { header: 'Subject', key: 'subject', width: 50 },
    { header: 'ALIS Module', key: 'module', width: 18 },
    { header: 'ALIS Module (inferred)', key: 'moduleInferred', width: 18 },
    { header: 'Enhancement Focus', key: 'enhancementFocus', width: 24 },
    { header: 'Pipeline', key: 'pipeline', width: 18 },
    { header: 'Stage', key: 'stage', width: 18 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Age (days)', key: 'ageDays', width: 10 },
    { header: 'Created', key: 'createdAt', width: 12 },
    { header: 'Last Modified', key: 'lastModifiedAt', width: 12 },
    { header: 'Ticket ID', key: 'ticketId', width: 14 },
    { header: 'Link', key: 'url', width: 40 },
    { header: 'ALIS Portal', key: 'alisPortal', width: 16 },
    { header: 'Pinned Note', key: 'pinnedNote', width: 60 },
  ];
  for (const r of requests) {
    sheet.addRow({
      companyName: r.companyName,
      accountManagerName: r.accountManagerName,
      category: r.category,
      tier: r.tier,
      arr: usd(r.arrCents),
      subject: r.subject,
      module: r.module,
      moduleInferred: r.moduleInferred,
      enhancementFocus: r.enhancementFocus,
      pipeline: r.pipeline,
      stage: r.stage,
      priority: r.priority,
      ageDays: r.ageDays,
      createdAt: r.createdAt ? r.createdAt.slice(0, 10) : '',
      lastModifiedAt: r.lastModifiedAt ? r.lastModifiedAt.slice(0, 10) : '',
      ticketId: r.ticketId,
      url: r.url,
      alisPortal: alisPortalCell(r.companyHost),
      pinnedNote: r.pinnedNote,
    });
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

/** The holistic export — both sheets, one file. `requests` is now the full open+closed ticket history (see server/api/export.js), so this sheet filters to what's still open to match its original "Active Requests" scope. */
/**
 * Same active-account ticket scoping as Dashboard.jsx's own `accountTickets`
 * (see its doc comment) — kept in sync by convention, not import, same as
 * this codebase's other client-side by-tier color/order constants. Shared
 * by the Excel Overview sheet and the PDF export (server/services/
 * dashboardPdf.js) so the two can never drift apart on methodology — Aaron,
 * Sep 2026, already got burned once by two dashboards computing "Enhancement
 * Requests" two different ways.
 */
export function computeExportTotals(companies, requests) {
  const activeIds = new Set(companies.map((c) => c.id));
  const accountTickets = requests.filter((r) => r.companyId && activeIds.has(r.companyId));
  const top3Enhancements = accountTickets.filter((r) => r.isOpen && r.isTopThree).length;
  const longTermEnhancements = accountTickets.filter((r) => r.isOpen && r.isLongTermEnhancement && !r.isTopThree).length;
  const stagedEnhancements = top3Enhancements + longTermEnhancements;
  const otherOpenEnhancements = accountTickets.filter((r) => r.isOpen && r.isEnhancementRequest && !r.isTopThree && !r.isLongTermEnhancement).length;
  const escalations = accountTickets.filter((r) => r.isOpen && r.isEscalation).length;
  return {
    arrCents: companies.reduce((s, c) => s + (c.arrCents || 0), 0),
    communities: companies.reduce((s, c) => s + (c.communityCount || 0), 0),
    capacityBeds: companies.reduce((s, c) => s + (c.totalCapacity || 0), 0),
    top3Enhancements, longTermEnhancements, stagedEnhancements, otherOpenEnhancements, escalations,
  };
}

/**
 * "Entitlements" sheet — one row per (category, flag), same rollup the
 * on-screen Portfolio Entitlements section shows (Sep 2026, Aaron: "make
 * sure the Portfolio entitlements are exportable... rolled up into the
 * Dashboard exportables"). `rollup` is the same shape
 * getPortfolioEntitlementRollup() returns ({ companiesChecked, categories:
 * [{ name, flags: [{ label, enabledCount, totalCount, pctEnabled }] }] }) —
 * only added when a check has actually been run (categories.length > 0),
 * since an empty sheet with no data would just be noise.
 */
function addEntitlementsSheet(workbook, rollup, sheetName = 'Entitlements') {
  resetDataBarPriority();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [{ width: 22 }, { width: 32 }, { width: 14 }, { width: 12 }, { width: 14 }];

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'Portfolio Entitlements';
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF1E293B' } };
  sheet.mergeCells('A2:E2');
  sheet.getCell('A2').value = `${rollup.companiesChecked} account(s) checked — a manual, on-demand ALIS admin scrape, not part of the regular Refresh.`;
  sheet.getCell('A2').font = { size: 10.5, color: { argb: 'FF78716C' } };

  const headerRow = sheet.addRow(['Category', 'Flag', 'Enabled', 'Total Checked', '% Enabled']);
  headerRow.font = { bold: true };

  let r = 4;
  for (const category of rollup.categories) {
    for (const flag of category.flags) {
      sheet.getCell(`A${r}`).value = category.name;
      sheet.getCell(`B${r}`).value = flag.label;
      sheet.getCell(`C${r}`).value = flag.enabledCount;
      sheet.getCell(`D${r}`).value = flag.totalCount;
      sheet.getCell(`E${r}`).value = flag.pctEnabled / 100;
      sheet.getCell(`E${r}`).numFmt = '0.0%';
      addDataBar(sheet, `E${r}:E${r}`, 'FF2563EB');
      r += 1;
    }
  }
}

export async function exportDataToExcel({ companies, requests, generatedAt, kpi, entitlementsRollup }) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  const totals = computeExportTotals(companies, requests);
  addOverviewSheet(workbook, { companies, kpi, totals, generatedAt });
  addAccountsSheet(workbook, companies);
  // ALIS Pay / Support Pipeline tickets are excluded portfolio-wide at the
  // source (server/services/hubspotRequests.js) — `requests` here is
  // already Account Management only.
  addRequestsSheet(workbook, requests.filter((r) => r.isOpen), 'Active Requests');
  if (entitlementsRollup?.categories?.length) {
    addEntitlementsSheet(workbook, entitlementsRollup);
  }
  await download(workbook, `alis-product-data-${generatedAt.slice(0, 10)}.xlsx`);
}

/** Per-section export — the Portfolio Entitlements section's own button. */
export async function exportEntitlementsToExcel(rollup, generatedAt) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  addEntitlementsSheet(workbook, rollup);
  await download(workbook, `alis-product-hub-entitlements-${generatedAt.slice(0, 10)}.xlsx`);
}

/** Per-section export — the Accounts section's own button. */
export async function exportAccountsToExcel(companies, generatedAt) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  addAccountsSheet(workbook, companies);
  await download(workbook, `alis-product-hub-accounts-${generatedAt.slice(0, 10)}.xlsx`);
}

/** Per-section export — one sheet named after whichever request section (Top 3 Enhancements, Escalations, Open Tickets, Enhancement Tickets, Active Requests) called it. */
export async function exportRequestsToExcel(requests, sectionTitle, generatedAt) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  // Worksheet names cap at 31 chars and can't hold : \ / ? * [ ] — none of
  // our section titles hit that today, but truncate defensively rather
  // than let ExcelJS throw on some future longer title.
  addRequestsSheet(workbook, requests, sectionTitle.slice(0, 31));
  await download(workbook, `alis-product-hub-${slugify(sectionTitle)}-${generatedAt.slice(0, 10)}.xlsx`);
}

function addProjectsSheet(workbook, projects, sheetName) {
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = [
    { header: 'Company', key: 'companyName', width: 30 },
    { header: 'Account Manager', key: 'accountManagerName', width: 18 },
    { header: 'Project', key: 'name', width: 40 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'ARR ($)', key: 'arr', width: 14 },
    { header: 'Status', key: 'projectStatus', width: 16 },
    { header: 'RAG', key: 'projectHealthRag', width: 8 },
    { header: 'Progress (%)', key: 'projectProgress', width: 12 },
    { header: 'Owner', key: 'projectOwner', width: 18 },
    { header: 'Projected Go-Live', key: 'projectedGoLiveDate', width: 14 },
    { header: 'Created', key: 'createdAt', width: 12 },
    { header: 'Deal ID', key: 'dealId', width: 14 },
    { header: 'Link', key: 'url', width: 40 },
    { header: 'ALIS Portal', key: 'alisPortal', width: 16 },
    { header: 'Pinned Note', key: 'pinnedNote', width: 60 },
  ];
  for (const p of projects) {
    sheet.addRow({
      companyName: p.companyName,
      accountManagerName: p.accountManagerName,
      name: p.name,
      tier: p.tier,
      arr: usd(p.arrCents),
      projectStatus: p.projectStatus,
      projectHealthRag: p.projectHealthRag,
      projectProgress: p.projectProgress,
      projectOwner: p.projectOwner,
      projectedGoLiveDate: p.projectedGoLiveDate ? p.projectedGoLiveDate.slice(0, 10) : '',
      createdAt: p.createdAt ? p.createdAt.slice(0, 10) : '',
      dealId: p.dealId,
      url: p.url,
      alisPortal: alisPortalCell(p.companyHost),
      pinnedNote: p.pinnedNote,
    });
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

/** Per-section export for the Onboarding section's implementation-tracked deals. */
export async function exportProjectsToExcel(projects, generatedAt) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  addProjectsSheet(workbook, projects, 'Onboarding');
  await download(workbook, `alis-product-hub-onboarding-${generatedAt.slice(0, 10)}.xlsx`);
}

function addKeyContactsSheet(workbook, rows) {
  const sheet = workbook.addWorksheet('Key Contacts');
  sheet.columns = [
    { header: 'Name', key: 'name', width: 24 },
    { header: 'Title', key: 'title', width: 22 },
    { header: 'Company', key: 'companyName', width: 30 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'Label(s)', key: 'roles', width: 34 },
    { header: 'Email', key: 'email', width: 28 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Link', key: 'url', width: 40 },
    { header: 'ALIS Portal', key: 'alisPortal', width: 16 },
  ];
  for (const r of rows) {
    sheet.addRow({
      name: r.name,
      title: r.title,
      companyName: r.companyName,
      tier: r.tier,
      roles: (r.roles || []).join(', '),
      email: r.email,
      phone: r.phone,
      url: r.url,
      alisPortal: alisPortalCell(r.companyHost),
    });
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

/** Per-section export for the Key Contacts section's flattened contact-per-row list. */
export async function exportKeyContactsToExcel(rows, generatedAt) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  addKeyContactsSheet(workbook, rows);
  await download(workbook, `alis-product-hub-key-contacts-${generatedAt.slice(0, 10)}.xlsx`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * The whole-portfolio PDF report (server/services/dashboardPdf.js) — same
 * "client already has the data, server just renders it" convention as
 * accountTruthExport.js's exportAccountTruthToPdf. `totals`/`kpi` travel in
 * the request body rather than being recomputed server-side, via the same
 * computeExportTotals() the Excel Overview sheet uses, so the two exports
 * can never tell a different story about the same numbers.
 */
export async function exportDashboardToPdf({ companies, requests, kpi, generatedAt, entitlementsRollup }) {
  const totals = computeExportTotals(companies, requests);
  const res = await fetch('/api/export/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ companies, totals, kpi, generatedAt, entitlementsRollup }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PDF export failed (${res.status})`);
  }
  downloadBlob(await res.blob(), `ALIS-Product-Hub-Portfolio-Report-${generatedAt.slice(0, 10)}.pdf`);
}
