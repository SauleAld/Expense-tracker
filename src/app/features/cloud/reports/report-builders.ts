import { CATEGORIES, type Expense } from '../../../core/models';
import { categoryBreakdown, monthlyTotals, sumAmounts } from '../../../utils/analytics';
import { addDays, monthKey, toISODate } from '../../../utils/dates';
import { byDateDesc } from '../../../utils/filter';
import { formatDate, pluralize } from '../../../utils/format';
import type { TemplateId, TemplateParams } from '../model/cloud-types';
import type { Report, ReportRow } from './report-types';

const byDateAsc = (a: Expense, b: Expense) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt;

export const DEFAULT_PARAMS = (now: Date = new Date()): TemplateParams => ({
  year: now.getFullYear(),
  months: 6,
  period: 'all',
});

/** Years that have expenses, newest first, always including the current year. */
export function availableYears(expenses: readonly Expense[], now: Date = new Date()): number[] {
  const years = new Set<number>([now.getFullYear()]);
  for (const e of expenses) years.add(Number(e.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

export function buildReport(
  template: TemplateId,
  expenses: readonly Expense[],
  params: TemplateParams,
  now: Date = new Date(),
): Report {
  switch (template) {
    case 'tax':
      return taxReport(expenses, params.year, now);
    case 'monthly':
      return monthlyReport(expenses, params.months, now);
    case 'category':
      return categoryReport(expenses, params.period, now);
    case 'ledger':
      return ledgerReport(expenses, now);
  }
}

// ---- Tax Report: itemised by category for one calendar year, with subtotals ----

function taxReport(expenses: readonly Expense[], year: number, now: Date): Report {
  const inYear = expenses.filter((e) => e.date.startsWith(`${year}-`));
  const rows: ReportRow[] = [];

  for (const category of CATEGORIES) {
    const items = inYear.filter((e) => e.category === category).sort(byDateAsc);
    if (items.length === 0) continue;
    rows.push({ kind: 'group', cells: [category, null, null, null] });
    for (const e of items) rows.push({ kind: 'data', cells: [e.date, e.category, e.description, e.amount] });
    rows.push({ kind: 'subtotal', cells: [null, null, `Subtotal · ${category}`, sumAmounts(items)] });
  }
  const total = sumAmounts(inYear);
  rows.push({ kind: 'total', cells: [null, null, `Total ${year}`, total] });

  return {
    template: 'tax',
    title: `Tax Report ${year}`,
    subtitle: `${formatDate(`${year}-01-01`)} – ${formatDate(`${year}-12-31`)} · ${pluralize(inYear.length, 'expense')}`,
    stem: `tax-report-${year}`,
    columns: [
      { label: 'Date', format: 'date' },
      { label: 'Category', format: 'text' },
      { label: 'Description', format: 'text' },
      { label: 'Amount', format: 'currency' },
    ],
    rows,
    recordCount: inYear.length,
    total,
    generatedAt: now.toISOString(),
  };
}

// ---- Monthly Summary: one line per month with trend ----

function monthlyReport(expenses: readonly Expense[], months: number, now: Date): Report {
  // One extra month at the front is only used to compute the first month's change.
  const series = monthlyTotals(expenses, months + 1, now);
  const currentKey = monthKey(now);
  const rows: ReportRow[] = [];
  let count = 0;

  series.slice(1).forEach((month, i) => {
    const previous = series[i]!;
    const items = expenses.filter((e) => e.date.startsWith(month.key));
    const top = categoryBreakdown(items).sort((a, b) => b.total - a.total)[0]!;
    const [y, m] = month.key.split('-').map(Number) as [number, number];
    const days = month.key === currentKey ? now.getDate() : new Date(y, m, 0).getDate();
    count += month.count;
    rows.push({
      kind: 'data',
      cells: [
        month.longLabel,
        month.count,
        month.total,
        month.total / days,
        top.total > 0 ? top.category : null,
        previous.total > 0 ? (month.total - previous.total) / previous.total : null,
      ],
    });
  });
  const total = rows.reduce((s, r) => s + Math.round((r.cells[2] as number) * 100), 0) / 100;
  rows.push({ kind: 'total', cells: ['Total', count, total, null, null, null] });

  return {
    template: 'monthly',
    title: 'Monthly Summary',
    subtitle: `Last ${months} months · ${pluralize(count, 'expense')}`,
    stem: `monthly-summary-${monthKey(now)}`,
    columns: [
      { label: 'Month', format: 'text' },
      { label: 'Expenses', format: 'int' },
      { label: 'Total', format: 'currency' },
      { label: 'Daily average', format: 'currency' },
      { label: 'Top category', format: 'text' },
      { label: 'Change vs previous', format: 'change' },
    ],
    rows,
    recordCount: count,
    total,
    generatedAt: now.toISOString(),
  };
}

// ---- Category Analysis: where the money goes ----

const PERIOD_LABEL: Record<TemplateParams['period'], string> = {
  all: 'All time',
  year: 'This year',
  '90d': 'Last 90 days',
};

function categoryReport(expenses: readonly Expense[], period: TemplateParams['period'], now: Date): Report {
  const from =
    period === 'year' ? `${now.getFullYear()}-01-01` : period === '90d' ? toISODate(addDays(now, -89)) : '';
  const inPeriod = expenses.filter((e) => !from || e.date >= from);

  const breakdown = categoryBreakdown(inPeriod)
    .filter((c) => c.count > 0)
    .sort((a, b) => b.total - a.total);

  const rows: ReportRow[] = breakdown.map((c) => {
    const items = inPeriod.filter((e) => e.category === c.category);
    const largest = items.reduce((a, b) => (b.amount > a.amount ? b : a));
    return {
      kind: 'data',
      cells: [c.category, c.count, c.total, c.share, c.total / c.count, largest.amount, largest.description],
    };
  });

  const total = sumAmounts(inPeriod);
  const biggest = inPeriod.reduce<Expense | null>((a, b) => (!a || b.amount > a.amount ? b : a), null);
  rows.push({
    kind: 'total',
    cells: [
      'Total',
      inPeriod.length,
      total,
      inPeriod.length ? 1 : null,
      inPeriod.length ? total / inPeriod.length : null,
      biggest?.amount ?? null,
      biggest?.description ?? null,
    ],
  });

  return {
    template: 'category',
    title: 'Category Analysis',
    subtitle: `${PERIOD_LABEL[period]} · ${pluralize(inPeriod.length, 'expense')}`,
    stem: `category-analysis-${toISODate(now)}`,
    columns: [
      { label: 'Category', format: 'text' },
      { label: 'Expenses', format: 'int' },
      { label: 'Total', format: 'currency' },
      { label: 'Share', format: 'percent' },
      { label: 'Average', format: 'currency' },
      { label: 'Largest', format: 'currency' },
      { label: 'Largest expense', format: 'text' },
    ],
    rows,
    recordCount: inPeriod.length,
    total,
    generatedAt: now.toISOString(),
  };
}

// ---- Full Ledger: every record ----

function ledgerReport(expenses: readonly Expense[], now: Date): Report {
  const sorted = [...expenses].sort(byDateDesc);
  const total = sumAmounts(sorted);
  const rows: ReportRow[] = sorted.map((e) => ({
    kind: 'data',
    cells: [e.date, e.category, e.amount, e.description],
  }));
  rows.push({ kind: 'total', cells: [null, null, total, `${pluralize(sorted.length, 'expense')}`] });

  return {
    template: 'ledger',
    title: 'Full Ledger',
    subtitle: `Every expense, newest first · ${pluralize(sorted.length, 'expense')}`,
    stem: `expense-ledger-${toISODate(now)}`,
    columns: [
      { label: 'Date', format: 'date' },
      { label: 'Category', format: 'text' },
      { label: 'Amount', format: 'currency' },
      { label: 'Description', format: 'text' },
    ],
    rows,
    recordCount: sorted.length,
    total,
    generatedAt: now.toISOString(),
  };
}

