/**
 * V1 "just serve up the data" export — two raw, unscored sheets built
 * client-side from GET /api/export, same ExcelJS + Blob-download pattern
 * as alis-hub's client/src/utils/accountHealthExport.js. No queue, no
 * scoring: Trisha's/BI's team plug this into whatever they already use.
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

export async function exportDataToExcel({ companies, requests, generatedAt }) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(generatedAt);

  const accountsSheet = workbook.addWorksheet('Accounts');
  accountsSheet.columns = [
    { header: 'Company', key: 'name', width: 34 },
    { header: 'HubSpot ID', key: 'id', width: 14 },
    { header: 'Account Manager', key: 'accountManagerName', width: 18 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'ARR ($)', key: 'arr', width: 14 },
    { header: 'Lifecycle Stage (raw)', key: 'lifecycleStage', width: 20 },
  ];
  for (const c of companies) {
    accountsSheet.addRow({ name: c.name, id: c.id, accountManagerName: c.accountManagerName, tier: c.tier, arr: usd(c.arrCents), lifecycleStage: c.lifecycleStage });
  }
  accountsSheet.getRow(1).font = { bold: true };

  const requestsSheet = workbook.addWorksheet('Active Requests');
  requestsSheet.columns = [
    { header: 'Company', key: 'companyName', width: 30 },
    { header: 'Account Manager', key: 'accountManagerName', width: 18 },
    { header: 'Issue Type (raw)', key: 'category', width: 18 },
    { header: 'Tier', key: 'tier', width: 8 },
    { header: 'ARR ($)', key: 'arr', width: 14 },
    { header: 'Subject', key: 'subject', width: 50 },
    { header: 'Pipeline', key: 'pipeline', width: 18 },
    { header: 'Stage', key: 'stage', width: 18 },
    { header: 'Priority', key: 'priority', width: 10 },
    { header: 'Age (days)', key: 'ageDays', width: 10 },
    { header: 'Created', key: 'createdAt', width: 12 },
    { header: 'Last Modified', key: 'lastModifiedAt', width: 12 },
    { header: 'Ticket ID', key: 'ticketId', width: 14 },
    { header: 'Link', key: 'url', width: 40 },
  ];
  for (const r of requests) {
    requestsSheet.addRow({
      companyName: r.companyName,
      accountManagerName: r.accountManagerName,
      category: r.category,
      tier: r.tier,
      arr: usd(r.arrCents),
      subject: r.subject,
      pipeline: r.pipeline,
      stage: r.stage,
      priority: r.priority,
      ageDays: r.ageDays,
      createdAt: r.createdAt ? r.createdAt.slice(0, 10) : '',
      lastModifiedAt: r.lastModifiedAt ? r.lastModifiedAt.slice(0, 10) : '',
      ticketId: r.ticketId,
      url: r.url,
    });
  }
  requestsSheet.getRow(1).font = { bold: true };

  await download(workbook, `alis-product-data-${generatedAt.slice(0, 10)}.xlsx`);
}
