import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ExpenseDialog } from '../../core/expense-dialog';
import { ExpenseStore } from '../../core/expense-store';
import { CATEGORIES, isCategory, netAmount, type Expense, type Refund } from '../../core/models';
import { ToastService } from '../../core/toast';
import { CategoryBadge } from '../../shared/category-badge';
import { BankInbox } from '../bank/services/bank-inbox';
import { Icon } from '../../shared/icon';
import { sumAmounts } from '../../utils/analytics';
import { buildCsv, downloadCsv } from '../../utils/csv';
import { PRESETS, presetRange, type PresetId } from '../../utils/date-presets';
import { isValidISODate, todayISO } from '../../utils/dates';
import {
  DEFAULT_FILTERS,
  filterExpenses,
  hasActiveFilters,
  type ExpenseFilters,
  type SortKey,
} from '../../utils/filter';
import { formatCurrency, formatDate, pluralize } from '../../utils/format';
import { generateSampleExpenses } from '../../utils/sample-data';

const PAGE_SIZE = 25;

const SORT_OPTIONS: readonly { value: SortKey; label: string }[] = [
  { value: 'date-desc', label: 'Newest first' },
  { value: 'date-asc', label: 'Oldest first' },
  { value: 'amount-desc', label: 'Highest amount' },
  { value: 'amount-asc', label: 'Lowest amount' },
];

@Component({
  selector: 'app-expenses',
  imports: [Icon, CategoryBadge],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expenses.html',
})
export class Expenses {
  private readonly store = inject(ExpenseStore);
  private readonly toast = inject(ToastService);
  protected readonly dialog = inject(ExpenseDialog);
  private readonly inbox = inject(BankInbox);
  private readonly route = inject(ActivatedRoute);

  protected readonly categories = CATEGORIES;
  protected readonly presets = PRESETS;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly netAmount = netAmount;
  protected readonly today = todayISO();

  // Filter state
  protected readonly search = signal(DEFAULT_FILTERS.search);
  protected readonly category = signal<ExpenseFilters['category']>(DEFAULT_FILTERS.category);
  protected readonly from = signal(DEFAULT_FILTERS.from);
  protected readonly to = signal(DEFAULT_FILTERS.to);
  protected readonly sort = signal<SortKey>(DEFAULT_FILTERS.sort);

  private readonly filters = computed<ExpenseFilters>(() => ({
    search: this.search(),
    category: this.category(),
    from: this.from(),
    to: this.to(),
    sort: this.sort(),
  }));

  protected readonly hasAny = computed(() => this.store.count() > 0);
  protected readonly isFiltered = computed(() => hasActiveFilters(this.filters()));
  protected readonly rangeInvalid = computed(() => !!this.from() && !!this.to() && this.from() > this.to());

  protected readonly filtered = computed(() => filterExpenses(this.store.expenses(), this.filters()));
  protected readonly total = computed(() => sumAmounts(this.filtered()));

  /** How many rows are rendered; resets to one page whenever the filters change. */
  protected readonly limit = linkedSignal({
    source: () => JSON.stringify(this.filters()),
    computation: () => PAGE_SIZE,
  });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));
  protected readonly remaining = computed(() => this.filtered().length - this.visible().length);

  protected readonly activePreset = computed<PresetId | null>(() => {
    const from = this.from();
    const to = this.to();
    return PRESETS.find((p) => {
      const range = presetRange(p.id);
      return range.from === from && range.to === to;
    })?.id ?? null;
  });

  protected pluralize = pluralize;

  constructor() {
    // Links from the dashboard open the page already filtered: ?category=…&from=…&to=…
    const params = this.route.snapshot.queryParamMap;
    const category = params.get('category');
    const from = params.get('from') ?? '';
    const to = params.get('to') ?? '';
    if (isCategory(category)) this.category.set(category);
    if (isValidISODate(from)) this.from.set(from);
    if (isValidISODate(to)) this.to.set(to);
  }

  protected applyPreset(id: PresetId): void {
    const { from, to } = presetRange(id);
    this.from.set(from);
    this.to.set(to);
  }

  protected setCategory(value: string): void {
    this.category.set(isCategory(value) ? value : 'all');
  }

  protected setSort(value: string): void {
    this.sort.set(SORT_OPTIONS.find((o) => o.value === value)?.value ?? 'date-desc');
  }

  protected clearFilters(): void {
    this.search.set(DEFAULT_FILTERS.search);
    this.category.set(DEFAULT_FILTERS.category);
    this.from.set(DEFAULT_FILTERS.from);
    this.to.set(DEFAULT_FILTERS.to);
    // Sorting is a view preference, not a filter, so it is left alone.
  }

  protected remove(expense: Expense): void {
    const removed = this.store.remove(expense.id);
    if (!removed) return;
    this.toast.show(`Deleted “${removed.description}”`, {
      action: { label: 'Undo', run: () => this.store.restore(removed) },
    });
  }

  /** For a refund matched to the wrong purchase: it goes back to Bank sync to be matched again. */
  protected unlinkRefund(expense: Expense, refund: Refund): void {
    if (!this.inbox.unlinkRefund(expense.id, refund.externalId)) return;
    this.toast.show(`Moved the ${formatCurrency(refund.amount)} refund back to Bank sync, to match to another purchase`);
  }

  protected exportCsv(): void {
    const rows = this.filtered();
    if (rows.length === 0) return;
    try {
      downloadCsv(`spendwise-expenses-${todayISO()}.csv`, buildCsv(rows));
      this.toast.show(`Exported ${pluralize(rows.length, 'expense')} to CSV`);
    } catch {
      this.toast.error('Export failed. Please try again.');
    }
  }

  protected loadSample(): void {
    this.store.addMany(generateSampleExpenses());
    this.toast.show('Loaded sample expenses');
  }
}
