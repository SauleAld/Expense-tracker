import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { categoryColor, type Category } from '../../core/models';
import { ChartCard } from '../../shared/chart-card';
import { ChartTooltip } from '../../shared/chart-tooltip';
import type { CategoryTotal } from '../../utils/analytics';
import { formatCurrency, formatPercent, pluralize } from '../../utils/format';

@Component({
  selector: 'app-category-breakdown',
  imports: [ChartCard, ChartTooltip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './category-breakdown.html',
})
export class CategoryBreakdown {
  /** One entry per category in the fixed CATEGORIES order. */
  readonly items = input.required<readonly CategoryTotal[]>();
  readonly periodLabel = input.required<string>();
  /** The category whose expenses are open below the chart, if any. */
  readonly selected = input<Category | null>(null);
  /** Clicking a category asks to show (or hide) its expenses. */
  readonly select = output<Category>();

  protected readonly formatCurrency = formatCurrency;
  protected readonly active = signal<Category | null>(null);

  protected readonly total = computed(() => this.items().reduce((s, i) => s + Math.round(i.total * 100), 0) / 100);

  /** Stack order is fixed so neighbours match the validated palette order. */
  protected readonly segments = computed(() => {
    const items = this.items().filter((i) => i.total > 0);
    let offset = 0;
    return items.map((item) => {
      const center = (offset + item.share / 2) * 100;
      offset += item.share;
      return { ...item, color: categoryColor(item.category), center };
    });
  });

  /** The legend list is ranked by spend. */
  protected readonly ranked = computed(() =>
    this.segments()
      .slice()
      .sort((a, b) => b.total - a.total),
  );

  protected readonly summary = computed(() =>
    this.ranked()
      .map((s) => `${s.category} ${formatCurrency(s.total)}`)
      .join(', '),
  );

  protected readonly tooltip = computed(() => {
    const active = this.segments().find((s) => s.category === this.active());
    if (!active) return null;
    return {
      x: `${active.center}%`,
      title: active.category,
      rows: [
        { label: `${this.percent(active.share)} · ${pluralize(active.count, 'expense')}`, value: formatCurrency(active.total), color: active.color },
      ],
    };
  });

  protected percent(share: number): string {
    return share > 0 && share < 0.005 ? '<1%' : formatPercent(share);
  }

  protected onLeave(event: PointerEvent): void {
    if (event.pointerType === 'mouse') this.active.set(null);
  }
}
