import { CATEGORIES, netAmount, type Category, type Expense } from '../core/models';
import { addDays, addMonths, monthKey, startOfMonth, toISODate } from './dates';
import { formatMonth } from './format';

const toCents = (amount: number) => Math.round(amount * 100);

/** Sums what expenses cost after refunds, in integer cents so 0.1 + 0.2 style float drift never reaches the UI. */
export function sumAmounts(expenses: readonly Expense[]): number {
  return expenses.reduce((sum, e) => sum + toCents(netAmount(e)), 0) / 100;
}

export interface CategoryTotal {
  category: Category;
  total: number;
  count: number;
  /** 0–1 share of the grand total. */
  share: number;
}

/** One entry per category, in the fixed CATEGORIES order (zeros included). */
export function categoryBreakdown(expenses: readonly Expense[]): CategoryTotal[] {
  const cents = new Map<Category, { cents: number; count: number }>(
    CATEGORIES.map((c) => [c, { cents: 0, count: 0 }]),
  );
  for (const e of expenses) {
    const entry = cents.get(e.category)!;
    entry.cents += toCents(netAmount(e));
    entry.count += 1;
  }
  const grand = [...cents.values()].reduce((s, v) => s + v.cents, 0);
  return CATEGORIES.map((category) => {
    const { cents: c, count } = cents.get(category)!;
    return { category, total: c / 100, count, share: grand > 0 ? c / grand : 0 };
  });
}

export interface MonthlyPoint {
  key: string;
  label: string;
  longLabel: string;
  total: number;
  count: number;
}

/** The last `months` calendar months ending with the month of `now`, oldest first. */
export function monthlyTotals(
  expenses: readonly Expense[],
  months = 6,
  now: Date = new Date(),
): MonthlyPoint[] {
  const first = addMonths(now, -(months - 1));
  const buckets = new Map<string, MonthlyPoint>();
  for (let i = 0; i < months; i++) {
    const d = addMonths(first, i);
    buckets.set(monthKey(d), {
      key: monthKey(d),
      label: formatMonth(d, 'short'),
      longLabel: formatMonth(d, 'long'),
      total: 0,
      count: 0,
    });
  }
  const cents = new Map<string, number>();
  for (const e of expenses) {
    const key = e.date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.count += 1;
    cents.set(key, (cents.get(key) ?? 0) + toCents(netAmount(e)));
  }
  for (const [key, c] of cents) buckets.get(key)!.total = c / 100;
  return [...buckets.values()];
}

export interface DailyPoint {
  date: string;
  total: number;
  count: number;
}

/** The last `days` days ending today (inclusive), oldest first. */
export function dailyTotals(
  expenses: readonly Expense[],
  days = 30,
  now: Date = new Date(),
): DailyPoint[] {
  const points = new Map<string, DailyPoint>();
  for (let i = days - 1; i >= 0; i--) {
    const date = toISODate(addDays(now, -i));
    points.set(date, { date, total: 0, count: 0 });
  }
  const cents = new Map<string, number>();
  for (const e of expenses) {
    const point = points.get(e.date);
    if (!point) continue;
    point.count += 1;
    cents.set(e.date, (cents.get(e.date) ?? 0) + toCents(netAmount(e)));
  }
  for (const [date, c] of cents) points.get(date)!.total = c / 100;
  return [...points.values()];
}

export interface Summary {
  allTimeTotal: number;
  allTimeCount: number;
  monthTotal: number;
  monthCount: number;
  /** Month-to-date vs the same days of last month, or null when last month had no spending. */
  monthChange: number | null;
  lastMonthSamePeriod: number;
  dailyAverage: number;
  daysElapsed: number;
  topCategory: CategoryTotal | null;
  monthBreakdown: CategoryTotal[];
}

export function summarize(expenses: readonly Expense[], now: Date = new Date()): Summary {
  const monthStart = toISODate(startOfMonth(now));
  const lastMonthStartDate = addMonths(now, -1);
  const lastMonthStart = toISODate(lastMonthStartDate);
  const daysElapsed = now.getDate();
  // Same window last month, clamped so e.g. Mar 31 compares against all of a 28-day Feb.
  const lastMonthEnd = toISODate(
    new Date(
      lastMonthStartDate.getFullYear(),
      lastMonthStartDate.getMonth(),
      Math.min(daysElapsed, daysInMonth(lastMonthStartDate)),
    ),
  );

  const thisMonth = expenses.filter((e) => e.date >= monthStart && e.date <= toISODate(now));
  const lastPeriod = expenses.filter((e) => e.date >= lastMonthStart && e.date <= lastMonthEnd);

  const monthTotal = sumAmounts(thisMonth);
  const lastMonthSamePeriod = sumAmounts(lastPeriod);
  const monthBreakdown = categoryBreakdown(thisMonth);
  const top = [...monthBreakdown].sort((a, b) => b.total - a.total)[0];

  return {
    allTimeTotal: sumAmounts(expenses),
    allTimeCount: expenses.length,
    monthTotal,
    monthCount: thisMonth.length,
    monthChange: lastMonthSamePeriod > 0 ? (monthTotal - lastMonthSamePeriod) / lastMonthSamePeriod : null,
    lastMonthSamePeriod,
    dailyAverage: monthTotal / daysElapsed,
    daysElapsed,
    topCategory: top && top.total > 0 ? top : null,
    monthBreakdown,
  };
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}
