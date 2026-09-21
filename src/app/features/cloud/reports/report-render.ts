import { csvBlob, escapeCell } from '../../../utils/csv';
import { formatCurrency, formatDate, formatPercent } from '../../../utils/format';
import type { FormatId } from '../model/cloud-types';
import type { Cell, CellFormat, Column, Report } from './report-types';

/** Cell text for on-screen tables and PDFs. */
export function formatCell(cell: Cell, format: CellFormat): string {
  if (cell === null || cell === '') return '—';
  switch (format) {
    case 'text':
      return String(cell);
    case 'date':
      return formatDate(String(cell));
    case 'currency':
      return formatCurrency(Number(cell));
    case 'int':
      return Number(cell).toLocaleString('en-US');
    case 'percent': {
      const v = Number(cell);
      return v > 0 && v < 0.005 ? '<1%' : formatPercent(v);
    }
    case 'change': {
      const v = Number(cell);
      const pct = Math.round(Math.abs(v) * 100);
      return `${pct === 0 ? '' : v > 0 ? '+' : '-'}${pct}%`;
    }
  }
}

/** Numeric formats are right-aligned in tables. */
export const isNumeric = (format: CellFormat): boolean => format !== 'text' && format !== 'date';

function csvCell(cell: Cell, format: CellFormat): string {
  if (cell === null) return '';
  if (typeof cell === 'number') {
    if (format === 'currency') return cell.toFixed(2);
    if (format === 'percent' || format === 'change') return (cell * 100).toFixed(1);
    return String(cell);
  }
  return escapeCell(cell);
}

const csvHeader = (c: Column): string =>
  escapeCell(c.format === 'percent' || c.format === 'change' ? `${c.label} (%)` : c.label);

/** RFC 4180 CSV. Group headings are display-only, so they are skipped. */
export function reportToCsv(report: Report): string {
  const lines = [report.columns.map(csvHeader).join(',')];
  for (const row of report.rows) {
    if (row.kind === 'group') continue;
    lines.push(row.cells.map((cell, i) => csvCell(cell, report.columns[i]!.format)).join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

export function reportToJson(report: Report, exportedAt: Date): string {
  return JSON.stringify(
    {
      app: 'Spendwise',
      exportedAt: exportedAt.toISOString(),
      report: {
        title: report.title,
        subtitle: report.subtitle,
        generatedAt: report.generatedAt,
        recordCount: report.recordCount,
        total: report.total,
      },
      columns: report.columns.map((c) => c.label),
      rows: report.rows
        .filter((r) => r.kind !== 'group')
        .map((r) => ({
          type: r.kind,
          values: Object.fromEntries(report.columns.map((c, i) => [c.label, r.cells[i] ?? null])),
        })),
    },
    null,
    2,
  );
}

/** The PDF library could not be fetched; browsers cache that failure, so only a reload helps. */
export class ReportLoadError extends Error {
  constructor(cause: unknown) {
    super('The PDF generator could not be loaded', { cause });
    this.name = 'ReportLoadError';
  }
}

export async function renderReport(format: FormatId, report: Report, exportedAt: Date = new Date()): Promise<Blob> {
  switch (format) {
    case 'csv':
      return csvBlob(reportToCsv(report));
    case 'json':
      return new Blob([reportToJson(report, exportedAt)], { type: 'application/json' });
    case 'pdf': {
      // Loaded on demand: the PDF library is several hundred KB.
      const { buildReportPdf } = await import('./report-pdf').catch((error: unknown) => {
        throw new ReportLoadError(error);
      });
      return buildReportPdf(report, exportedAt);
    }
  }
}

export const FORMAT_EXTENSION: Record<FormatId, string> = { csv: 'csv', json: 'json', pdf: 'pdf' };
