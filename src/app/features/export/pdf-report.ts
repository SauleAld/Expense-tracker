import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { Expense } from '../../core/models';
import { sumAmounts } from '../../utils/analytics';
import { formatCurrency, formatDate, formatDateTime } from '../../utils/format';
import { describeCategories, describeRange } from './export-select';
import type { ExportMeta } from './export-types';

const MARGIN = 40;
const ACCENT: [number, number, number] = [37, 106, 191];

/**
 * jsPDF's built-in fonts only cover Latin-1 plus a few typographic marks.
 * Anything else would render as garbage, so each character is replaced with "?".
 * The `u` flag matters: it makes an emoji (a surrogate pair) one character, not two.
 */
export function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—•…€]/gu, '?');
}

export function buildPdf(expenses: readonly Expense[], meta: ExportMeta): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const total = sumAmounts(expenses);

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(11, 11, 11);
  doc.text('Expense Report', MARGIN, 60);

  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(82, 81, 78);
  doc.text(`Period: ${describeRange(meta.filters)}`, MARGIN, 82);
  doc.text(`Categories: ${describeCategories(meta.filters.categories)}`, MARGIN, 96);
  doc.text(`Generated: ${formatDateTime(meta.exportedAt)}`, MARGIN, 110);

  doc.setFont('helvetica', 'bold').setFontSize(11).setTextColor(11, 11, 11);
  doc.text(`${expenses.length} ${expenses.length === 1 ? 'record' : 'records'}`, pageWidth - MARGIN, 82, { align: 'right' });
  doc.text(`Total ${formatCurrency(total)}`, pageWidth - MARGIN, 98, { align: 'right' });

  const right = { halign: 'right' } as const;
  autoTable(doc, {
    startY: 130,
    head: [['Date', 'Category', { content: 'Amount', styles: right }, 'Description']],
    body: expenses.map((e) => [
      formatDate(e.date),
      e.category,
      { content: formatCurrency(e.amount), styles: right },
      pdfSafe(e.description),
    ]),
    foot: [['', 'Total', { content: formatCurrency(total), styles: right }, '']],
    showFoot: 'lastPage',
    margin: { left: MARGIN, right: MARGIN, bottom: 48 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: [11, 11, 11] },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [240, 239, 236], textColor: [11, 11, 11], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 249, 247] },
    columnStyles: { 0: { cellWidth: 82 }, 1: { cellWidth: 92 }, 2: { cellWidth: 72 } },
  });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal').setFontSize(8).setTextColor(137, 135, 129);
    doc.text('Spendwise', MARGIN, pageHeight - 24);
    doc.text(`Page ${page} of ${pages}`, pageWidth - MARGIN, pageHeight - 24, { align: 'right' });
  }

  return doc.output('blob');
}
