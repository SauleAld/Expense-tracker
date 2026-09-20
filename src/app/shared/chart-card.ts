import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';

/**
 * Card frame for a chart. Charts are always paired with a table view so every
 * value stays reachable without hovering or relying on color.
 */
@Component({
  selector: 'app-chart-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card block' },
  template: `
    <header class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold text-ink">{{ title() }}</h2>
        @if (subtitle()) {
          <p class="mt-0.5 text-xs text-ink-2">{{ subtitle() }}</p>
        }
      </div>
      @if (tableView()) {
        <div class="flex shrink-0 rounded-lg bg-subtle p-0.5 text-xs font-medium" role="group" [attr.aria-label]="title() + ' view'">
          @for (option of options; track option.value) {
            <button
              type="button"
              class="rounded-md px-2.5 py-1 transition-colors"
              [class]="view() === option.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink'"
              [attr.aria-pressed]="view() === option.value"
              (click)="view.set(option.value)"
            >
              {{ option.label }}
            </button>
          }
        </div>
      }
    </header>
    <div class="mt-4" [class.hidden]="view() !== 'chart'"><ng-content select="[chart]" /></div>
    <div class="mt-4" [class.hidden]="view() !== 'table'"><ng-content select="[table]" /></div>
  `,
})
export class ChartCard {
  readonly title = input.required<string>();
  readonly subtitle = input<string>();
  /** Set false when the chart already carries every value in text (e.g. a legend list). */
  readonly tableView = input(true);

  protected readonly view = signal<'chart' | 'table'>('chart');
  protected readonly options = [
    { value: 'chart', label: 'Chart' },
    { value: 'table', label: 'Table' },
  ] as const;
}
