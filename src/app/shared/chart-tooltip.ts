import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export interface TooltipRow {
  label: string;
  value: string;
  /** Series color shown as a short line key. */
  color?: string;
}

/**
 * Positioned inside the nearest `relative` ancestor. `x`/`y` are CSS lengths;
 * horizontal position is clamped so the tooltip stays inside the chart.
 */
@Component({
  selector: 'app-chart-tooltip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div
      class="pointer-events-none absolute z-20 w-max min-w-32 max-w-56 rounded-lg border border-line bg-surface px-3 py-2 shadow-lg"
      [style.left]="'clamp(6.5rem, ' + x() + ', calc(100% - 6.5rem))'"
      [style.top]="y()"
      [style.transform]="placement() === 'above' ? 'translate(-50%, calc(-100% - 10px))' : 'translate(-50%, 10px)'"
    >
      <div class="text-xs text-ink-2">{{ title() }}</div>
      @for (row of rows(); track row.label) {
        <div class="mt-1 flex items-center gap-2">
          @if (row.color) {
            <span class="h-0.5 w-3 shrink-0 rounded-full" [style.background-color]="row.color"></span>
          }
          <span class="text-sm font-semibold text-ink">{{ row.value }}</span>
          <span class="text-xs text-ink-2">{{ row.label }}</span>
        </div>
      }
    </div>
  `,
})
export class ChartTooltip {
  readonly x = input.required<string>();
  readonly y = input.required<string>();
  readonly title = input.required<string>();
  readonly rows = input.required<readonly TooltipRow[]>();
  readonly placement = input<'above' | 'below'>('above');
}
