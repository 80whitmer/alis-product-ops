/**
 * Excel export for the Decision Log — the full capture context (subject,
 * outcome, evidence, who/when, related link) in one sheet, for rolling up
 * into a QBR deck, a leadership report, or another tool entirely (Aaron,
 * Sep 2026: "export to excel of the capture context for easy roll up and
 * feed out to other tools"). Same ExcelJS pattern as
 * client/src/utils/dataExport.js.
 */
import ExcelJS from 'exceljs';

export async function exportDecisionsToExcel(decisions) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'alis-product-ops';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Decision Log');
  sheet.columns = [
    { header: 'Subject', key: 'subject', width: 40 },
    { header: 'Outcome', key: 'outcome', width: 30 },
    { header: 'Evidence', key: 'evidence', width: 50 },
    { header: 'Decided By', key: 'decidedBy', width: 20 },
    { header: 'Decided At', key: 'decidedAt', width: 14 },
    { header: 'Related Link', key: 'relatedUrl', width: 40 },
    { header: 'Logged At', key: 'createdAt', width: 20 },
  ];
  sheet.getRow(1).font = { bold: true };
  for (const d of decisions) {
    sheet.addRow({
      subject: d.subject,
      outcome: d.outcome,
      evidence: d.evidence || '',
      decidedBy: d.decided_by,
      decidedAt: d.decided_at,
      relatedUrl: d.related_url || '',
      createdAt: d.created_at || '',
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `decision-log-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
