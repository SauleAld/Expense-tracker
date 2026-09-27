import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { netAmount, type Expense } from '../../core/models';
import { CategoryBadge } from '../../shared/category-badge';
import { Icon } from '../../shared/icon';
import { sumAmounts } from '../../utils/analytics';
import { formatCurrency, formatDate, pluralize } from '../../utils/format';

/** How many expenses the panel lists before pointing to the Expenses page. */
const SHOWN = 8;

/** The expenses behind a clicked category or month, shown right under the chart. */
@Component({
  selector: 'app-drilldown-panel',
  imports: [RouterLink, Icon, CategoryBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Full width under the category row; beside the monthly chart it fills the two columns next to it.
  host: { class: 'card block', '[class.lg:col-span-3]': 'span() === 3', '[class.lg:col-span-2]': 'span() === 2' },
  template: `
    <div class="flex items-start justify-between gap-3">
      <div aria-live="polite">
        <h2 class="text-sm font-semibold">{{ title() }}</h2>
        <p class="text-sm text-ink-2">
          {{ pluralize(expenses().length, 'expense') }} · <span class="font-medium text-ink tabular-nums">{{ formatCurrency(total()) }}</span>
          @if (expenses().length > 1) { · biggest first }
        </p>
      </div>
      <button type="button" class="icon-btn -mt-1 -mr-2" [attr.aria-label]="'Close ' + title()" (click)="closed.emit()">
        <app-icon name="close" />
      </button>
    </div>

    @if (expenses().length === 0) {
      <p class="py-6 text-center text-sm text-ink-2">No expenses here.</p>
    } @else {
      <ul class="mt-2 divide-y divide-line">
        @for (expense of shown(); track expense.id) {
          <li class="flex items-center gap-3 py-2.5">
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ expense.description }}</p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-2">
                {{ formatDate(expense.date, 'medium') }}
                @if (showCategory()) {
                  <app-category-badge [category]="expense.category" />
                }
                @if (expense.refunds?.length) {
                  <span class="text-success">refunded {{ formatCurrency(expense.amount - netAmount(expense)) }}</span>
                }
              </p>
            </div>
            <p class="text-sm font-semibold tabular-nums">{{ formatCurrency(netAmount(expense)) }}</p>
          </li>
        }
      </ul>
      <div class="mt-2 border-t border-line pt-3 text-right">
        <a routerLink="/expenses" [queryParams]="query()" class="text-sm font-medium text-accent-text hover:underline">
          {{ expenses().length > shown().length ? 'See all ' + expenses().length + ' on the Expenses page' : 'Open on the Expenses page' }}
        </a>
      </div>
    }
  `,
})
export class DrilldownPanel {
  readonly title = input.required<string>();
  readonly expenses = input.required<readonly Expense[]>();
  /** Filters for the Expenses page link. */
  readonly query = input.required<Record<string, string>>();
  /** Whether rows show their category (a month mixes them; a category doesn't). */
  readonly showCategory = input(false);
  /** How many of the dashboard's three columns it spans on wide screens. */
  readonly span = input<2 | 3>(3);
  readonly closed = output<void>();

  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly pluralize = pluralize;
  protected readonly netAmount = netAmount;

  protected readonly shown = computed(() => this.expenses().slice(0, SHOWN));
  protected readonly total = computed(() => sumAmounts(this.expenses()));
}
