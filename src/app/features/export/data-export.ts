import { Injectable } from '@angular/core';
import type { Expense } from '../../core/models';
import { buildCsv, csvBlob } from '../../utils/csv';
import { downloadBlob } from '../../utils/download';
import { buildJson } from './export-formatters';
import type { ExportFilters, ExportFormat } from './export-types';

export interface ExportRequest {
  format: ExportFormat;
  /** Complete file name including extension. */
  filename: string;
  filters: ExportFilters;
}

export interface ExportResult {
  filename: string;
  bytes: number;
}

/**
 * The lazily loaded PDF library could not be fetched. Browsers cache a failed dynamic
 * import, so retrying in place cannot succeed; the page has to be reloaded.
 */
export class ExportLoadError extends Error {
  constructor(cause: unknown) {
    super('The PDF generator could not be loaded', { cause });
    this.name = 'ExportLoadError';
  }
}

/**
 * The busy state is kept on screen at least this long. CSV and JSON are built in
 * a few milliseconds, and a spinner that flashes for one frame reads as a glitch.
 */
const MIN_BUSY_MS = 600;

@Injectable({ providedIn: 'root' })
export class DataExport {
  async export(expenses: readonly Expense[], request: ExportRequest): Promise<ExportResult> {
    const startedAt = performance.now();
    const meta = { filters: request.filters, exportedAt: new Date() };

    const blob = await this.render(request.format, expenses, meta);

    const remaining = MIN_BUSY_MS - (performance.now() - startedAt);
    if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));

    downloadBlob(request.filename, blob);
    return { filename: request.filename, bytes: blob.size };
  }

  private async render(
    format: ExportFormat,
    expenses: readonly Expense[],
    meta: { filters: ExportFilters; exportedAt: Date },
  ): Promise<Blob> {
    switch (format) {
      case 'csv':
        return csvBlob(buildCsv(expenses));
      case 'json':
        return new Blob([buildJson(expenses, meta)], { type: 'application/json' });
      case 'pdf': {
        // The PDF library is ~hundreds of KB, so it is only fetched when a PDF is requested.
        const { buildPdf } = await import('./pdf-report').catch((error: unknown) => {
          throw new ExportLoadError(error);
        });
        return buildPdf(expenses, meta);
      }
    }
  }
}
