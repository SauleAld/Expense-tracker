import { categoryBreakdown, dailyTotals, monthlyTotals, sumAmounts, summarize } from './analytics';
import { makeExpense } from './test-helpers';

const NOW = new Date(2026, 8, 20); // Sep 20, 2026

describe('analytics', () => {
  it('sums in cents without float drift', () => {
    const list = [0.1, 0.2, 0.3].map((amount) => makeExpense({ amount }));
    expect(sumAmounts(list)).toBe(0.6);
  });

  describe('categoryBreakdown', () => {
    it('returns every category in fixed order with shares that add to 1', () => {
      const result = categoryBreakdown([
        makeExpense({ category: 'Bills', amount: 75 }),
        makeExpense({ category: 'Food', amount: 25 }),
      ]);
      expect(result.map((r) => r.category)).toEqual([
        'Food',
        'Transportation',
        'Entertainment',
        'Shopping',
        'Bills',
        'Other',
      ]);
      expect(result[0]).toMatchObject({ total: 25, share: 0.25, count: 1 });
      expect(result[4]).toMatchObject({ total: 75, share: 0.75 });
      expect(result[1]).toMatchObject({ total: 0, share: 0, count: 0 });
    });

    it('has zero shares (not NaN) when there is no spending', () => {
      expect(categoryBreakdown([]).every((r) => r.share === 0)).toBe(true);
    });
  });

  describe('monthlyTotals', () => {
    it('returns the requested number of months ending with the current one', () => {
      const result = monthlyTotals([], 6, NOW);
      expect(result.map((m) => m.key)).toEqual(['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    });

    it('buckets by month and ignores older data', () => {
      const result = monthlyTotals(
        [
          makeExpense({ date: '2026-09-01', amount: 10 }),
          makeExpense({ date: '2026-09-19', amount: 5.5 }),
          makeExpense({ date: '2026-08-31', amount: 7 }),
          makeExpense({ date: '2025-01-01', amount: 999 }),
        ],
        6,
        NOW,
      );
      expect(result.at(-1)).toMatchObject({ key: '2026-09', total: 15.5, count: 2 });
      expect(result.at(-2)).toMatchObject({ key: '2026-08', total: 7 });
      expect(result.reduce((s, m) => s + m.total, 0)).toBe(22.5);
    });

    it('crosses year boundaries', () => {
      const result = monthlyTotals([], 3, new Date(2026, 0, 15));
      expect(result.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01']);
    });
  });

  describe('dailyTotals', () => {
    it('covers exactly `days` days ending today', () => {
      const result = dailyTotals([], 30, NOW);
      expect(result).toHaveLength(30);
      expect(result[0]!.date).toBe('2026-08-22');
      expect(result.at(-1)!.date).toBe('2026-09-20');
    });

    it('includes today and excludes the day before the window', () => {
      const result = dailyTotals(
        [
          makeExpense({ date: '2026-09-20', amount: 4 }),
          makeExpense({ date: '2026-09-20', amount: 6 }),
          makeExpense({ date: '2026-08-21', amount: 100 }),
        ],
        30,
        NOW,
      );
      expect(result.at(-1)).toMatchObject({ total: 10, count: 2 });
      expect(result.reduce((s, d) => s + d.total, 0)).toBe(10);
    });
  });

  describe('summarize', () => {
    const expenses = [
      makeExpense({ date: '2026-09-02', amount: 100, category: 'Bills' }),
      makeExpense({ date: '2026-09-15', amount: 50, category: 'Food' }),
      makeExpense({ date: '2026-08-10', amount: 100, category: 'Food' }),
      makeExpense({ date: '2026-08-25', amount: 400, category: 'Shopping' }), // after day 20: not comparable
    ];

    it('computes month totals and compares against the same days last month', () => {
      const s = summarize(expenses, NOW);
      expect(s.allTimeTotal).toBe(650);
      expect(s.monthTotal).toBe(150);
      expect(s.lastMonthSamePeriod).toBe(100);
      expect(s.monthChange).toBeCloseTo(0.5);
    });

    it('averages over days elapsed and finds the top category', () => {
      const s = summarize(expenses, NOW);
      expect(s.daysElapsed).toBe(20);
      expect(s.dailyAverage).toBe(7.5);
      expect(s.topCategory).toMatchObject({ category: 'Bills', total: 100 });
    });

    it('reports null change and no top category when there is nothing to compare', () => {
      const s = summarize([], NOW);
      expect(s.monthChange).toBeNull();
      expect(s.topCategory).toBeNull();
      expect(s.dailyAverage).toBe(0);
    });

    it('clamps the comparison window when last month is shorter', () => {
      const s = summarize([makeExpense({ date: '2026-02-28', amount: 40 })], new Date(2026, 2, 31));
      expect(s.lastMonthSamePeriod).toBe(40);
    });
  });
});
