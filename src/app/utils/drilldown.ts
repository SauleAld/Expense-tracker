import { netAmount, type Category, type Expense } from '../core/models';
import { formatMonth } from './format';
import { toISODate } from './dates';

/**
 * What was clicked on the dashboard: a category in the month the category chart shows, or a
 * month on the monthly chart. Months are `YYYY-MM`.
 */
export type Drilldown = { kind: 'category'; category: Category; month: string } | { kind: 'month'; key: string };

const monthStart = (key: string) => {
  const [year, month] = key.split('-').map(Number) as [number, number];
  return new Date(year, month - 1, 1);
};

/** A whole month, `YYYY-MM`, as an inclusive date range. */
export function monthRange(key: string): { from: string; to: string } {
  const start = monthStart(key);
  return { from: `${key}-01`, to: toISODate(new Date(start.getFullYear(), start.getMonth() + 1, 0)) };
}

/** Like `monthRange`, but the current month stops at today, like the category breakdown. */
export function monthToDate(key: string, now: Date = new Date()): { from: string; to: string } {
  const range = monthRange(key);
  const today = toISODate(now);
  return range.to > today ? { ...range, to: today } : range;
}

/** Moves a `YYYY-MM` month by `delta` months. */
export function shiftMonth(key: string, delta: number): string {
  const start = monthStart(key);
  const d = new Date(start.getFullYear(), start.getMonth() + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** A month's name, such as "September 2026". */
export const monthName = (key: string): string => formatMonth(monthStart(key), 'long');

/**
 * The inclusive date range behind a selection. A category covers its month up to today, like
 * the category breakdown; a month covers the whole month, like the monthly chart.
 */
export function drilldownRange(selection: Drilldown, now: Date = new Date()): { from: string; to: string } {
  return selection.kind === 'category' ? monthToDate(selection.month, now) : monthRange(selection.key);
}

/** The expenses behind a selection, biggest first (after refunds), then newest. */
export function drilldownExpenses(expenses: readonly Expense[], selection: Drilldown, now: Date = new Date()): Expense[] {
  const { from, to } = drilldownRange(selection, now);
  return expenses
    .filter((e) => e.date >= from && e.date <= to && (selection.kind === 'month' || e.category === selection.category))
    .sort((a, b) => netAmount(b) - netAmount(a) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** A heading for the selection, such as "Groceries · September 2026" or "May 2026". */
export function drilldownTitle(selection: Drilldown): string {
  return selection.kind === 'category' ? `${selection.category} · ${monthName(selection.month)}` : monthName(selection.key);
}

/** Query parameters that open the Expenses page with the same filter. */
export function drilldownQuery(selection: Drilldown, now: Date = new Date()): Record<string, string> {
  const range = drilldownRange(selection, now);
  return selection.kind === 'category' ? { category: selection.category, ...range } : range;
}
