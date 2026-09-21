import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCell, isNumeric } from '../reports/report-render';
import type { Report, RowKind } from '../reports/report-types';

/** Renders any report. Used for the live preview and for shared snapshots. */
@Component({
  selector: 'app-report-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './report-table.html',
})
export class ReportTable {
  readonly report = input.required<Report>();
  /** Show at most this many body rows (totals are always kept). */
  readonly limit = input<number | null>(null);
  /** Tighter padding and smaller text, for narrow cards. */
  readonly compact = input(false);

  protected readonly pad = computed(() => (this.compact() ? 'px-2 py-1.5' : 'px-3 py-2'));
  protected readonly formatCell = formatCell;
  protected readonly isNumeric = isNumeric;

  private readonly split = computed(() => {
    const rows = this.report().rows;
    return { body: rows.filter((r) => r.kind !== 'total'), totals: rows.filter((r) => r.kind === 'total') };
  });

  protected readonly rows = computed(() => {
    const { body, totals } = this.split();
    const limit = this.limit();
    return [...(limit === null ? body : body.slice(0, limit)), ...totals];
  });

  protected readonly hidden = computed(() => {
    const limit = this.limit();
    return limit === null ? 0 : Math.max(this.split().body.length - limit, 0);
  });

  protected rowClass(kind: RowKind): string {
    if (kind === 'total') return 'bg-subtle font-semibold';
    if (kind === 'subtotal') return 'font-medium bg-subtle/50';
    return '';
  }
}
