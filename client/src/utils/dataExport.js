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
      pinnedNote: r.pinnedNote,
    });
  }
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

/** The holistic export — both sheets, one file. `requests` is now the full open+closed ticket history (see server/api/export.js), so this sheet filters to what's still open to match its original "Active Requests" scope. */
export async function exportDataToExcel({ companies, requests, generatedAt }) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);
  addAccountsSheet(workbook, companies);
  addRequestsSheet(workbook, requests.filter((r) => r.isOpen), 'Active Requests');
  await download(workbook, `alis-product-data-${generatedAt.slice(0, 10)}.xlsx`);
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
