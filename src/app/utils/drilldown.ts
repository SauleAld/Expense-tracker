import { netAmount, type Category, type Expense } from '../core/models';
import { formatMonth } from './format';
import { startOfMonth, toISODate } from './dates';

/** What was clicked on the dashboard: a category (this month's spending in it) or a month. */
export type Drilldown = { kind: 'category'; category: Category } | { kind: 'month'; key: string };

/**
 * The inclusive date range behind a selection. A category covers this month up to today, like
 * the category breakdown; a month covers the whole month, like the monthly chart.
 */
export function drilldownRange(selection: Drilldown, now: Date = new Date()): { from: string; to: string } {
  if (selection.kind === 'category') return { from: toISODate(startOfMonth(now)), to: toISODate(now) };
  const [year, month] = selection.key.split('-').map(Number) as [number, number];
  return { from: `${selection.key}-01`, to: toISODate(new Date(year, month, 0)) };
}

/** The expenses behind a selection, biggest first (after refunds), then newest. */
export function drilldownExpenses(expenses: readonly Expense[], selection: Drilldown, now: Date = new Date()): Expense[] {
  const { from, to } = drilldownRange(selection, now);
  return expenses
    .filter((e) => e.date >= from && e.date <= to && (selection.kind === 'month' || e.category === selection.category))
    .sort((a, b) => netAmount(b) - netAmount(a) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** A heading for the selection, such as "Groceries · September 2026" or "May 2026". */
export function drilldownTitle(selection: Drilldown, now: Date = new Date()): string {
  if (selection.kind === 'category') return `${selection.category} · ${formatMonth(now, 'long')}`;
  const [year, month] = selection.key.split('-').map(Number) as [number, number];
  return formatMonth(new Date(year, month - 1, 1), 'long');
}

/** Query parameters that open the Expenses page with the same filter. */
export function drilldownQuery(selection: Drilldown, now: Date = new Date()): Record<string, string> {
  const range = drilldownRange(selection, now);
  return selection.kind === 'category' ? { category: selection.category, ...range } : range;
}
