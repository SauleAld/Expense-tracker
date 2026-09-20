import type { Category } from '../../core/models';
import type { IconName } from '../../shared/icon';

export type ExportFormat = 'csv' | 'json' | 'pdf';

export interface ExportFilters {
  /** Inclusive `YYYY-MM-DD` bounds; an empty string means unbounded. */
  from: string;
  to: string;
  categories: readonly Category[];
}

export interface ExportMeta {
  filters: ExportFilters;
  exportedAt: Date;
}

export interface FormatInfo {
  id: ExportFormat;
  label: string;
  extension: string;
  icon: IconName;
  description: string;
}

export const FORMATS: readonly FormatInfo[] = [
  {
    id: 'csv',
    label: 'CSV',
    extension: 'csv',
    icon: 'table',
    description: 'Spreadsheet-ready. Opens in Excel, Numbers and Google Sheets.',
  },
  {
    id: 'json',
    label: 'JSON',
    extension: 'json',
    icon: 'code',
    description: 'Structured data with a summary and the filters used. Good for backups and developers.',
  },
  {
    id: 'pdf',
    label: 'PDF',
    extension: 'pdf',
    icon: 'document',
    description: 'A formatted, print-ready report with a totals row and page numbers.',
  },
];
