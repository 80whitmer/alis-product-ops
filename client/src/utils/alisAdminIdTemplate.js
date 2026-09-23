/**
 * Download/Upload template for bulk-filling ALIS Admin Company IDs — the
 * one piece of data server/services/alisEntitlements.js needs that this
 * app has no automated way to resolve (see docs on server/db/database.js's
 * alis_admin_ids table). Same ExcelJS pattern as alis-hub's
 * exportCompanyHostTemplate/parseCompanyHostTemplate for its own
 * ALIS-subdomain mapping — plain header text for guidance, not a cell
 * .note, since ExcelJS has a known bug reading comments back out of a
 * workbook once Excel has re-saved it.
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

/** Every account, pre-filled with whatever ALIS Admin Company ID is already known — fill in the blanks gradually, not all at once. */
export async function exportAlisAdminIdTemplate(accounts) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'alis-product-ops';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('ALIS Admin IDs');
  sheet.columns = [
    { header: 'Company Name', key: 'companyName', width: 34 },
    { header: 'HubSpot Company ID', key: 'hubspotCompanyId', width: 20 },
    { header: 'ALIS Admin Company ID — from the URL of admin.alisonline.com/Customers/EntitlementSets/EditCompany/{id}', key: 'alisAdminCompanyId', width: 70 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const a of accounts) {
    sheet.addRow({ companyName: a.name, hubspotCompanyId: a.id, alisAdminCompanyId: a.alisAdminCompanyId || '' });
  }
  await download(workbook, `alis-admin-ids-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** Parses a completed template back into rows — skips any row with no ID filled in. */
export async function parseAlisAdminIdTemplate(file) {
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
    const alisAdminCompanyId = row.getCell(3).text?.trim();
    if (alisAdminCompanyId) rows.push({ companyName, hubspotCompanyId, alisAdminCompanyId });
  });
  return rows;
}
