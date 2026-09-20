import { ChangeDetectionStrategy, Component, computed, input, signal, viewChild } from '@angular/core';
import { ChartCard } from '../../shared/chart-card';
import { ChartTooltip, type TooltipRow } from '../../shared/chart-tooltip';
import { Measure } from '../../shared/measure';
import type { DailyPoint } from '../../utils/analytics';
import { formatCurrency, formatDate, formatTick, pluralize } from '../../utils/format';
import { niceScale } from '../../utils/scale';

const HEIGHT = 232;
const MARGIN = { top: 16, right: 20, bottom: 28, left: 52 };

@Component({
  selector: 'app-trend-chart',
  imports: [ChartCard, ChartTooltip, Measure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trend-chart.html',
})
export class TrendChart {
  readonly data = input.required<readonly DailyPoint[]>();

  private readonly measure = viewChild(Measure);
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly hover = signal<number | null>(null);

  protected readonly width = computed(() => this.measure()?.width() || 320);

  protected readonly subtitle = computed(() => {
    const data = this.data();
    const total = data.reduce((sum, d) => sum + Math.round(d.total * 100), 0) / 100;
    return `${formatCurrency(total)} over ${data.length} days · ${formatCurrency(total / data.length)} / day`;
  });

  protected readonly geometry = computed(() => {
    const data = this.data();
    const n = data.length;
    const plotW = Math.max(this.width() - MARGIN.left - MARGIN.right, 10);
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const baseline = MARGIN.top + plotH;
    const { max, ticks } = niceScale(Math.max(0, ...data.map((d) => d.total)));
    const step = plotW / Math.max(n - 1, 1);

    const points = data.map((d, i) => ({
      index: i,
      point: d,
      x: MARGIN.left + i * step,
      y: baseline - (d.total / max) * plotH,
    }));

    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
    const first = points[0]!;
    const last = points[n - 1]!;
    const area = `${line}L${last.x.toFixed(1)},${baseline}L${first.x.toFixed(1)},${baseline}Z`;

    const grid = ticks.map((tick) => ({
      label: formatTick(tick),
      y: baseline - (tick / max) * plotH,
      isBaseline: tick === 0,
    }));

    // Label every 7th day (14th on narrow screens), counting back from today.
    const every = this.width() < 480 ? 14 : 7;
    const xTicks = points
      .filter((p) => (n - 1 - p.index) % every === 0)
      .map((p) => ({ x: p.x, label: formatDate(p.point.date, 'short') }));

    return { step, plotW, plotH, baseline, points, line, area, grid, xTicks, right: this.width() - MARGIN.right };
  });

  protected readonly active = computed(() => {
    const i = this.hover();
    return i === null ? null : (this.geometry().points[i] ?? null);
  });

  protected readonly tooltip = computed(() => {
    const p = this.active();
    if (!p) return null;
    const rows: TooltipRow[] = [
      { label: pluralize(p.point.count, 'expense'), value: formatCurrency(p.point.total), color: 'var(--series-1)' },
    ];
    return { x: `${p.x}px`, y: `${p.y}px`, title: formatDate(p.point.date, 'medium'), rows };
  });

  /** Screen-reader announcement for the day under the cursor / keyboard focus. */
  protected readonly announcement = computed(() => {
    const p = this.active();
    return p ? `${formatDate(p.point.date, 'medium')}: ${formatCurrency(p.point.total)}` : '';
  });

  protected readonly tableRows = computed(() => [...this.data()].reverse());

  protected onMove(event: PointerEvent): void {
    const rect = (event.currentTarget as SVGRectElement).getBoundingClientRect();
    this.hover.set(this.indexAt(event.clientX - rect.left));
  }

  protected onLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.hover.set(null);
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.data().length - 1;
    const current = this.hover() ?? last;
    const next =
      event.key === 'ArrowLeft' ? current - 1
      : event.key === 'ArrowRight' ? current + 1
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    this.hover.set(Math.min(Math.max(next, 0), last));
  }

  protected onFocus(): void {
    if (this.hover() === null) this.hover.set(this.data().length - 1);
  }

  private indexAt(offsetX: number): number {
    const { step } = this.geometry();
    const i = Math.round(offsetX / step);
    return Math.min(Math.max(i, 0), this.data().length - 1);
  }
}
