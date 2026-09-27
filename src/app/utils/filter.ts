import { netAmount, type Category, type Expense } from '../core/models';
import { formatCurrency } from './format';

export type SortKey = 'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc';

export interface ExpenseFilters {
  search: string;
  category: Category | 'all';
  /** Inclusive `YYYY-MM-DD` bounds; empty string means unbounded. */
  from: string;
  to: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: ExpenseFilters = {
  search: '',
  category: 'all',
  from: '',
  to: '',
  sort: 'date-desc',
};

export function filterExpenses(
  expenses: readonly Expense[],
  filters: ExpenseFilters,
): Expense[] {
  const query = filters.search.trim().toLowerCase();
  const result = expenses.filter((e) => {
    if (filters.category !== 'all' && e.category !== filters.category) return false;
    if (filters.from && e.date < filters.from) return false;
    if (filters.to && e.date > filters.to) return false;
    if (query) {
      const haystack = `${e.description} ${e.category} ${e.amount.toFixed(2)} ${formatCurrency(e.amount)}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
  return result.sort(comparators[filters.sort]);
}

const byDateDesc = (a: Expense, b: Expense) =>
  b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

const comparators: Record<SortKey, (a: Expense, b: Expense) => number> = {
  'date-desc': byDateDesc,
  'date-asc': (a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt,
  'amount-desc': (a, b) => netAmount(b) - netAmount(a) || byDateDesc(a, b),
  'amount-asc': (a, b) => netAmount(a) - netAmount(b) || byDateDesc(a, b),
};

export function hasActiveFilters(filters: ExpenseFilters): boolean {
  return (
    filters.search.trim() !== '' ||
    filters.category !== 'all' ||
    filters.from !== '' ||
    filters.to !== ''
  );
}
