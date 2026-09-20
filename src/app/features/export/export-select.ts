import { CATEGORIES, type Category, type Expense } from '../../core/models';
import { sumAmounts } from '../../utils/analytics';
import { byDateDesc } from '../../utils/filter';
import { formatDate } from '../../utils/format';
import type { ExportFilters } from './export-types';

/** Expenses matching the date range and any of the chosen categories, newest first. */
export function selectExpenses(expenses: readonly Expense[], filters: ExportFilters): Expense[] {
  const allowed = new Set<Category>(filters.categories);
  return expenses
    .filter(
      (e) =>
        allowed.has(e.category) &&
        (!filters.from || e.date >= filters.from) &&
        (!filters.to || e.date <= filters.to),
    )
    .sort(byDateDesc);
}

export interface SelectionSummary {
  count: number;
  total: number;
  /** Earliest / latest expense date in the selection. */
  first: string | null;
  last: string | null;
}

export function summarizeSelection(rows: readonly Expense[]): SelectionSummary {
  if (rows.length === 0) return { count: 0, total: 0, first: null, last: null };
  // Rows are sorted newest first.
  return { count: rows.length, total: sumAmounts(rows), first: rows.at(-1)!.date, last: rows[0]!.date };
}

export function describeRange({ from, to }: Pick<ExportFilters, 'from' | 'to'>): string {
  if (from && to) return `${formatDate(from)} – ${formatDate(to)}`;
  if (from) return `From ${formatDate(from)}`;
  if (to) return `Until ${formatDate(to)}`;
  return 'All dates';
}

export function describeCategories(categories: readonly Category[]): string {
  if (categories.length === CATEGORIES.length) return 'All categories';
  return categories.length === 0 ? 'None' : CATEGORIES.filter((c) => categories.includes(c)).join(', ');
}
