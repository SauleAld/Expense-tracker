import { ChangeDetectionStrategy, Component, computed, input, signal, viewChild } from '@angular/core';
import type { MonthlyPoint } from '../../utils/analytics';
import { formatCurrency, formatTick, formatWhole, pluralize } from '../../utils/format';
import { niceScale, roundedTopBar } from '../../utils/scale';
import { ChartCard } from '../../shared/chart-card';
import { ChartTooltip, type TooltipRow } from '../../shared/chart-tooltip';
import { Measure } from '../../shared/measure';

const HEIGHT = 232;
const MARGIN = { top: 24, right: 8, bottom: 28, left: 52 };
const MAX_BAR_WIDTH = 24;

@Component({
  selector: 'app-monthly-chart',
  imports: [ChartCard, ChartTooltip, Measure],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './monthly-chart.html',
})
export class MonthlyChart {
  readonly data = input.required<readonly MonthlyPoint[]>();

  private readonly measure = viewChild(Measure);
  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatWhole = formatWhole;
  protected readonly hover = signal<number | null>(null);

  protected readonly width = computed(() => this.measure()?.width() || 320);

  protected readonly geometry = computed(() => {
    const data = this.data();
    const plotW = Math.max(this.width() - MARGIN.left - MARGIN.right, 10);
    const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;
    const { max, ticks } = niceScale(Math.max(0, ...data.map((d) => d.total)));
    const band = plotW / data.length;
    const baseline = MARGIN.top + plotH;

    const grid = ticks.map((tick) => ({
      label: formatTick(tick),
      y: baseline - (tick / max) * plotH,
      isBaseline: tick === 0,
    }));

    const bars = data.map((d, i) => {
      const barW = Math.min(MAX_BAR_WIDTH, band * 0.6);
      const cx = MARGIN.left + band * (i + 0.5);
      const h = d.total > 0 ? Math.max((d.total / max) * plotH, 2) : 0;
      const y = baseline - h;
      return {
        index: i,
        point: d,
        cx,
        y,
        h,
        bandX: MARGIN.left + band * i,
        path: h > 0 ? roundedTopBar(cx - barW / 2, y, barW, h, 4) : '',
        isCurrent: i === data.length - 1,
        aria: `${d.longLabel}: ${formatCurrency(d.total)}, ${pluralize(d.count, 'expense')}`,
      };
    });

    return { plotW, plotH, band, grid, bars, right: this.width() - MARGIN.right };
  });

  protected readonly summary = computed(() => {
    const data = this.data();
    const peak = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]!);
    return `Monthly spending for the last ${data.length} months. Highest: ${peak.longLabel}, ${formatCurrency(peak.total)}.`;
  });

  protected readonly tooltip = computed(() => {
    const i = this.hover();
    const bar = i === null ? undefined : this.geometry().bars[i];
    if (!bar) return null;
    const rows: TooltipRow[] = [
      { label: pluralize(bar.point.count, 'expense'), value: formatCurrency(bar.point.total), color: 'var(--series-1)' },
    ];
    return { x: `${bar.cx}px`, y: `${bar.y}px`, title: bar.point.longLabel, rows };
  });

  protected onLeave(event: PointerEvent): void {
    // On touch the tooltip stays until another bar is tapped.
    if (event.pointerType === 'mouse') this.hover.set(null);
  }
}
