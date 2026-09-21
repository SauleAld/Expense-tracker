import type { TemplateId } from '../model/cloud-types';

export type CellFormat = 'text' | 'date' | 'currency' | 'percent' | 'change' | 'int';
export type Cell = string | number | null;

export interface Column {
  label: string;
  format: CellFormat;
}

/** `group` rows are headings for display/PDF only; the CSV and JSON skip them. */
export type RowKind = 'data' | 'group' | 'subtotal' | 'total';

export interface ReportRow {
  kind: RowKind;
  cells: Cell[];
}

/** A finished, plain-data report. It is JSON-serialisable so it can be stored as a share snapshot. */
export interface Report {
  template: TemplateId;
  title: string;
  subtitle: string;
  /** File name without extension, e.g. `tax-report-2026`. */
  stem: string;
  columns: Column[];
  rows: ReportRow[];
  /** Number of underlying expenses included. */
  recordCount: number;
  total: number;
  generatedAt: string;
}
