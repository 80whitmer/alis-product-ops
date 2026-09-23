/**
 * Download/Upload template for bulk-filling ALIS subdomains — same file
 * shape as alis-hub's own exportCompanyHostTemplate/parseCompanyHostTemplate
 * (Company Name / HubSpot Company ID / ALIS Subdomain(s)), so a template
 * already completed there can be uploaded here as-is, and vice versa.
 */
import ExcelJS from 'exceljs';

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

export async function exportCompanyHostTemplate(accounts) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'alis-product-ops';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('ALIS Subdomains');
  sheet.columns = [
    { header: 'Company Name', key: 'companyName', width: 34 },
    { header: 'HubSpot Company ID', key: 'hubspotCompanyId', width: 20 },
    { header: 'ALIS Subdomain(s) — comma-separate multiple, e.g. "vivaeast,vivawest"', key: 'companyHost', width: 55 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const a of accounts) {
    sheet.addRow({ companyName: a.name, hubspotCompanyId: a.id, companyHost: a.companyHost || '' });
  }
  await download(workbook, `alis-subdomains-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function parseCompanyHostTemplate(file) {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer);
  } catch (err) {
    if (/reading 'comments'/.test(err.message)) {
      throw new Error("This file has an Excel comment ExcelJS can't read back. Please re-download a fresh template and re-enter your changes.");
    }
    throw err;
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('No worksheet found in this file.');

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    const companyName = row.getCell(1).text?.trim();
    const hubspotCompanyId = row.getCell(2).text?.trim();
    const companyHost = row.getCell(3).text?.trim();
    if (companyHost) rows.push({ companyName, hubspotCompanyId, companyHost });
  });
  return rows;
}
