import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { formatDateTime } from '../../../utils/format';
import { formatCell, isNumeric } from './report-render';
import type { Report } from './report-types';

const MARGIN = 40;
const ACCENT: [number, number, number] = [37, 106, 191];

/**
 * jsPDF's built-in fonts only cover Latin-1 plus a few typographic marks; anything
 * else would print as garbage, so each character becomes "?". The `u` flag makes an
 * emoji (a surrogate pair) count as one character.
 */
export function pdfSafe(text: string): string {
  return text.replace(/[^\x20-\x7E\xA0-\xFF‘’“”–—•…€]/gu, '?');
}

export function buildReportPdf(report: Report, exportedAt: Date): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFont('helvetica', 'bold').setFontSize(20).setTextColor(11, 11, 11);
  doc.text(pdfSafe(report.title), MARGIN, 60);
  doc.setFont('helvetica', 'normal').setFontSize(10).setTextColor(82, 81, 78);
  doc.text(pdfSafe(report.subtitle), MARGIN, 80);
  doc.text(`Generated ${formatDateTime(exportedAt)}`, MARGIN, 94);

  const columns = report.columns;
  const align = (i: number) => (isNumeric(columns[i]!.format) ? ({ halign: 'right' } as const) : {});

  const body = report.rows.map((row) => {
    if (row.kind === 'group') {
      return [
        {
          content: pdfSafe(String(row.cells[0] ?? '')),
          colSpan: columns.length,
          styles: { fontStyle: 'bold' as const, fillColor: [230, 239, 251] as [number, number, number] },
        },
      ];
    }
    const bold = row.kind === 'subtotal' || row.kind === 'total';
    return row.cells.map((cell, i) => ({
      content: pdfSafe(cell === null ? '' : formatCell(cell, columns[i]!.format)),
      styles: {
        ...align(i),
        ...(bold ? { fontStyle: 'bold' as const } : {}),
        ...(row.kind === 'total' ? { fillColor: [240, 239, 236] as [number, number, number] } : {}),
      },
    }));
  });

  autoTable(doc, {
    startY: 114,
    head: [columns.map((c, i) => ({ content: c.label, styles: align(i) }))],
    body,
    margin: { left: MARGIN, right: MARGIN, bottom: 48 },
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 6, textColor: [11, 11, 11] },
    headStyles: { fillColor: ACCENT, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 249, 247] },
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
