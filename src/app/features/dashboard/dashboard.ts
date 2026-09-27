import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpenseDialog } from '../../core/expense-dialog';
import { DepositStore } from '../../core/deposit-store';
import { ExpenseStore } from '../../core/expense-store';
import { BankInbox } from '../bank/services/bank-inbox';
import { categoryColor, netAmount } from '../../core/models';
import { ToastService } from '../../core/toast';
import { CategoryBadge } from '../../shared/category-badge';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';
import { cashFlow, categoryBreakdown, dailyTotals, monthlyTotals, summarize } from '../../utils/analytics';
import { monthKey, todayISO } from '../../utils/dates';
import { drilldownExpenses, drilldownQuery, drilldownTitle, monthName, monthToDate, shiftMonth, type Drilldown } from '../../utils/drilldown';
import { DEFAULT_FILTERS, filterExpenses } from '../../utils/filter';
import { formatCurrency, formatDate, formatMonth, formatPercent, pluralize } from '../../utils/format';
import { generateSampleExpenses } from '../../utils/sample-data';
import { CategoryBreakdown } from './category-breakdown';
import { DrilldownPanel } from './drilldown-panel';
import { MonthlyChart } from './monthly-chart';
import { TrendChart } from './trend-chart';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, StatCard, CategoryBadge, MonthlyChart, TrendChart, CategoryBreakdown, DrilldownPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly store = inject(ExpenseStore);
  private readonly deposits = inject(DepositStore);
  private readonly toast = inject(ToastService);
  protected readonly dialog = inject(ExpenseDialog);
  /** Imported transactions waiting for review, so they are not forgotten. */
  protected readonly toReview = inject(BankInbox).reviewCount;

  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly formatPercent = formatPercent;
  protected readonly categoryColor = categoryColor;
  protected readonly netAmount = netAmount;
  protected readonly pluralize = pluralize;

  protected readonly hasData = computed(() => this.store.count() > 0);
  protected readonly today = computed(() => formatDate(todayISO(), 'long'));
  protected readonly monthLabel = computed(() => formatMonth(new Date(), 'long'));

  protected readonly summary = computed(() => summarize(this.store.expenses(), new Date()));
  protected readonly monthly = computed(() => monthlyTotals(this.store.expenses(), 6, new Date()));
  protected readonly hasDeposits = computed(() => this.deposits.count() > 0);
  protected readonly cashFlow = computed(() => cashFlow(this.store.expenses(), this.deposits.deposits(), new Date()));
  /** Bar widths in percent of the larger of the two, so they compare at a glance. */
  protected readonly flowBars = computed(() => {
    const { moneyIn, spent } = this.cashFlow();
    const max = Math.max(moneyIn, spent);
    return max === 0 ? { moneyIn: 0, spent: 0 } : { moneyIn: (moneyIn / max) * 100, spent: (spent / max) * 100 };
  });
  protected readonly daily = computed(() => dailyTotals(this.store.expenses(), 30, new Date()));
  protected readonly recent = computed(() =>
    filterExpenses(this.store.expenses(), DEFAULT_FILTERS).slice(0, 6),
  );

  /** The month the category chart shows (`YYYY-MM`); it starts on this month. */
  protected readonly currentMonth = computed(() => monthKey(new Date()));
  protected readonly categoryMonth = signal(monthKey(new Date()));
  /** The month of your first expense, so stepping back stops where the data does. */
  protected readonly earliestMonth = computed(() =>
    this.store.expenses().reduce((min, e) => (e.date.slice(0, 7) < min ? e.date.slice(0, 7) : min), this.currentMonth()),
  );
  protected readonly categoryMonthLabel = computed(() => monthName(this.categoryMonth()));
  protected readonly categoryItems = computed(() => {
    const { from, to } = monthToDate(this.categoryMonth(), new Date());
    return categoryBreakdown(this.store.expenses().filter((e) => e.date >= from && e.date <= to));
  });

  /** Steps the category chart a month back or forward; an open category list follows it. */
  protected stepCategoryMonth(delta: -1 | 1): void {
    const next = shiftMonth(this.categoryMonth(), delta);
    if (next < this.earliestMonth() || next > this.currentMonth()) return;
    this.categoryMonth.set(next);
    const s = this.selection();
    if (s?.kind === 'category') this.selection.set({ ...s, month: next });
  }

  /** The category or month clicked on a chart, whose expenses are listed under it. */
  protected readonly selection = signal<Drilldown | null>(null);
  protected readonly selectedCategory = computed(() => {
    const s = this.selection();
    return s?.kind === 'category' ? s.category : null;
  });
  protected readonly selectedMonth = computed(() => {
    const s = this.selection();
    return s?.kind === 'month' ? s.key : null;
  });
  protected readonly drilldown = computed(() => {
    const selection = this.selection();
    if (!selection) return null;
    const now = new Date();
    return {
      selection,
      title: drilldownTitle(selection),
      expenses: drilldownExpenses(this.store.expenses(), selection, now),
      query: drilldownQuery(selection, now),
    };
  });

  /** Clicking the open category or month again closes it. */
  protected toggle(next: Drilldown): void {
    const current = this.selection();
    const same =
      current?.kind === next.kind &&
      (next.kind === 'category' ? this.selectedCategory() === next.category : this.selectedMonth() === next.key);
    this.selection.set(same ? null : next);
  }

  /** Direction of month-over-month change; spending going up is the "bad" direction. */
  protected readonly change = computed(() => {
    const change = this.summary().monthChange;
    if (change === null) return null;
    const rounded = Math.round(Math.abs(change) * 100);
    return { rounded, direction: rounded === 0 ? 'flat' : change > 0 ? 'up' : 'down' } as const;
  });

  protected loadSample(): void {
    this.store.addMany(generateSampleExpenses());
    this.toast.show('Loaded sample expenses');
  }
}
