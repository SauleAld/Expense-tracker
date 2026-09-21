import { makeExpense } from '../../../utils/test-helpers';
import { DEFAULT_PARAMS, availableYears, buildReport } from './report-builders';

const NOW = new Date(2026, 8, 20); // Sep 20, 2026
const params = DEFAULT_PARAMS(NOW);

const data = [
  makeExpense({ date: '2026-09-01', amount: 100, category: 'Bills', description: 'Rent' }),
  makeExpense({ date: '2026-09-15', amount: 50, category: 'Food', description: 'Dinner' }),
  makeExpense({ date: '2026-08-10', amount: 200, category: 'Food', description: 'Groceries' }),
  makeExpense({ date: '2026-07-03', amount: 100, category: 'Shopping', description: 'Shoes' }),
  makeExpense({ date: '2025-12-31', amount: 999, category: 'Other', description: 'Last year' }),
];

describe('availableYears', () => {
  it('lists years with data, newest first, always including the current year', () => {
    expect(availableYears(data, NOW)).toEqual([2026, 2025]);
    expect(availableYears([], NOW)).toEqual([2026]);
  });
});

describe('Tax Report', () => {
  const report = buildReport('tax', data, { ...params, year: 2026 }, NOW);

  it('covers only the chosen year and counts its expenses', () => {
    expect(report.recordCount).toBe(4);
    expect(report.total).toBe(450);
    expect(report.title).toBe('Tax Report 2026');
    expect(report.subtitle).toContain('Jan 1, 2026 – Dec 31, 2026');
  });

  it('groups by category in fixed order with subtotals, then a yearly total', () => {
    const kinds = report.rows.map((r) => r.kind);
    expect(kinds).toEqual(['group', 'data', 'data', 'subtotal', 'group', 'data', 'subtotal', 'group', 'data', 'subtotal', 'total']);
    expect(report.rows[0]!.cells[0]).toBe('Food');
    expect(report.rows[3]!.cells).toEqual([null, null, 'Subtotal · Food', 250]);
    expect(report.rows.at(-1)!.cells).toEqual([null, null, 'Total 2026', 450]);
  });

  it('sorts items within a category by date, oldest first', () => {
    expect(report.rows[1]!.cells[0]).toBe('2026-08-10');
    expect(report.rows[2]!.cells[0]).toBe('2026-09-15');
  });

  it('produces just a zero total for a year with no data', () => {
    const empty = buildReport('tax', data, { ...params, year: 2024 }, NOW);
    expect(empty.recordCount).toBe(0);
    expect(empty.rows).toEqual([{ kind: 'total', cells: [null, null, 'Total 2024', 0] }]);
  });
});

describe('Monthly Summary', () => {
  const report = buildReport('monthly', data, { ...params, months: 3 }, NOW);
  const rows = report.rows.filter((r) => r.kind === 'data');

  it('has one row per month, oldest first, ending with the current month', () => {
    expect(rows.map((r) => r.cells[0])).toEqual(['July 2026', 'August 2026', 'September 2026']);
  });

  it('computes totals, counts and the top category', () => {
    expect(rows[2]!.cells.slice(1, 3)).toEqual([2, 150]);
    expect(rows[2]!.cells[4]).toBe('Bills');
  });

  it('averages the current month over the days elapsed, and past months over their length', () => {
    expect(rows[2]!.cells[3]).toBe(150 / 20);
    expect(rows[1]!.cells[3]).toBe(200 / 31);
  });

  it('computes change against the previous month, or null when there is nothing to compare', () => {
    expect(rows[0]!.cells[5]).toBeNull(); // June had no spending
    expect(rows[1]!.cells[5]).toBe(1); // 100 -> 200
    expect(rows[2]!.cells[5]).toBe(-0.25); // 200 -> 150
  });

  it('ends with totals that match the rows', () => {
    expect(report.rows.at(-1)!.cells.slice(0, 3)).toEqual(['Total', 4, 450]);
    expect(report.recordCount).toBe(4);
  });
});

describe('Category Analysis', () => {
  it('ranks categories by total with share, average and largest expense', () => {
    const report = buildReport('category', data, { ...params, period: 'all' }, NOW);
    const rows = report.rows.filter((r) => r.kind === 'data');
    // Bills and Shopping tie at $100; ties keep the fixed category order, so the output is deterministic.
    expect(rows.map((r) => r.cells[0])).toEqual(['Other', 'Food', 'Shopping', 'Bills']);
    const food = rows.find((r) => r.cells[0] === 'Food')!;
    expect(food.cells.slice(1, 6)).toEqual([2, 250, 250 / 1449, 125, 200]);
    expect(food.cells[6]).toBe('Groceries');
    expect(rows.reduce((s, r) => s + (r.cells[3] as number), 0)).toBeCloseTo(1);
  });

  it('respects the period', () => {
    const year = buildReport('category', data, { ...params, period: 'year' }, NOW);
    expect(year.recordCount).toBe(4);
    const recent = buildReport('category', data, { ...params, period: '90d' }, NOW); // Jun 23 onward
    expect(recent.recordCount).toBe(4);
    const old = buildReport('category', [makeExpense({ date: '2026-01-01' })], { ...params, period: '90d' }, NOW);
    expect(old.recordCount).toBe(0);
  });
});

describe('Full Ledger', () => {
  it('lists everything newest first with a grand total', () => {
    const report = buildReport('ledger', data, params, NOW);
    expect(report.rows.filter((r) => r.kind === 'data').map((r) => r.cells[0])).toEqual([
      '2026-09-15',
      '2026-09-01',
      '2026-08-10',
      '2026-07-03',
      '2025-12-31',
    ]);
    expect(report.total).toBe(1449);
    expect(report.stem).toBe('expense-ledger-2026-09-20');
  });
});
