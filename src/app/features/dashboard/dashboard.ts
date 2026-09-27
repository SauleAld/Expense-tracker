import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpenseDialog } from '../../core/expense-dialog';
import { ExpenseStore } from '../../core/expense-store';
import { BankInbox } from '../bank/services/bank-inbox';
import { categoryColor, netAmount } from '../../core/models';
import { ToastService } from '../../core/toast';
import { CategoryBadge } from '../../shared/category-badge';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';
import { dailyTotals, monthlyTotals, summarize } from '../../utils/analytics';
import { todayISO } from '../../utils/dates';
import { DEFAULT_FILTERS, filterExpenses } from '../../utils/filter';
import { formatCurrency, formatDate, formatMonth, formatPercent, pluralize } from '../../utils/format';
import { generateSampleExpenses } from '../../utils/sample-data';
import { CategoryBreakdown } from './category-breakdown';
import { MonthlyChart } from './monthly-chart';
import { TrendChart } from './trend-chart';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, Icon, StatCard, CategoryBadge, MonthlyChart, TrendChart, CategoryBreakdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard.html',
})
export class Dashboard {
  private readonly store = inject(ExpenseStore);
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
  protected readonly daily = computed(() => dailyTotals(this.store.expenses(), 30, new Date()));
  protected readonly recent = computed(() =>
    filterExpenses(this.store.expenses(), DEFAULT_FILTERS).slice(0, 6),
  );

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
