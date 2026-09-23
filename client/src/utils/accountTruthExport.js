/**
 * Full Account Truth report export — Aaron, Sep 2026: "can we make the
 * full account truth report exportable to excel and pdf." Excel is a
 * multi-sheet ExcelJS workbook built entirely client-side (same download-
 * a-Blob pattern as dataExport.js); PDF is rendered server-side (Playwright,
 * see server/services/accountTruthPdf.js) since there's no client-side PDF
 * renderer in this app — the already-loaded account/truth/liveEntitlements
 * state is POSTed as-is, no re-fetch.
 */
import ExcelJS from 'exceljs';

function usd(cents) {
  return cents == null ? '' : Number((cents / 100).toFixed(2));
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL = {
  sold_not_enabled: 'Sold — nothing enabled',
  enabled_not_sold: 'Enabled — not recorded as sold',
  aligned: 'Sold & enabled',
  not_applicable: 'Not sold',
  uncategorized: 'Uncategorized',
};

export async function exportAccountTruthToExcel(account, truth, liveEntitlements) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();

  const overview = workbook.addWorksheet('Overview');
  overview.columns = [{ header: 'Field', key: 'field', width: 24 }, { header: 'Value', key: 'value', width: 50 }];
  overview.getRow(1).font = { bold: true };
  [
    ['Account', account.name],
    ['Tier', account.tier ?? ''],
    ['ARR', usd(account.arrCents)],
    ['Package', account.package || ''],
    ['Products (HubSpot alis_products)', (account.products || []).join(', ')],
    ['ALIS Subdomain', account.companyHost || ''],
    ['ALIS Admin Company ID', account.alisAdminCompanyId || ''],
  ].forEach(([field, value]) => overview.addRow({ field, value }));

  const deals = workbook.addWorksheet('Deals');
  deals.columns = [
    { header: 'Deal', key: 'name', width: 40 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'ARR', key: 'arr', width: 14 },
    { header: 'Close Date', key: 'closeDate', width: 14 },
    { header: 'Line Items', key: 'lineItems', width: 40 },
    { header: 'Link', key: 'url', width: 40 },
  ];
  deals.getRow(1).font = { bold: true };
  for (const d of truth?.deals || []) {
    deals.addRow({
      name: d.dealName,
      status: d.isClosed ? (d.isWon ? 'Closed Won' : 'Closed Lost') : 'Open',
      arr: d.arrValue ?? '',
      closeDate: d.closeDate ? d.closeDate.slice(0, 10) : '',
      lineItems: d.lineItemsBlocked ? 'blocked (scopes)' : (d.lineItems || []).map((li) => li.name).join(', '),
      url: d.url || '',
    });
  }

  if (liveEntitlements) {
    const sheet = workbook.addWorksheet('Live Entitlements');
    sheet.columns = [
      { header: 'Category', key: 'category', width: 22 },
      { header: 'Category Status', key: 'status', width: 26 },
      { header: 'Flag', key: 'label', width: 34 },
      { header: 'Enabled', key: 'enabled', width: 10 },
    ];
    sheet.getRow(1).font = { bold: true };
    for (const c of liveEntitlements.categories) {
      for (const f of c.items) {
        sheet.addRow({ category: c.name, status: STATUS_LABEL[c.status] || c.status, label: f.label, enabled: f.enabled ? 'Yes' : 'No' });
      }
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${account.name.replace(/[^a-z0-9]+/gi, '-')}-Account-Truth.xlsx`
  );
}

export async function exportAccountTruthToPdf(account, truth, liveEntitlements) {
  const res = await fetch(`/api/accounts/${account.id}/export-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, truth, liveEntitlements }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `PDF export failed (${res.status})`);
  }
  download(await res.blob(), `${account.name.replace(/[^a-z0-9]+/gi, '-')}-Account-Truth.pdf`);
}
