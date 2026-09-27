import { drilldownExpenses, drilldownQuery, drilldownRange, drilldownTitle } from './drilldown';
import { makeExpense } from './test-helpers';

const NOW = new Date(2026, 8, 20); // Sep 20, 2026

describe('drilldownRange', () => {
  it('covers this month up to today for a category, like the category breakdown', () => {
    expect(drilldownRange({ kind: 'category', category: 'Dining' }, NOW)).toEqual({ from: '2026-09-01', to: '2026-09-20' });
  });

  it('covers the whole month for a month, including short months and leap years', () => {
    expect(drilldownRange({ kind: 'month', key: '2026-04' }, NOW)).toEqual({ from: '2026-04-01', to: '2026-04-30' });
    expect(drilldownRange({ kind: 'month', key: '2028-02' }, NOW)).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });
});

describe('drilldownExpenses', () => {
  const refund = { externalId: 'r', date: '2026-09-06', amount: 90, description: 'Refund' };
  const list = [
    makeExpense({ id: 'small', date: '2026-09-02', amount: 12, category: 'Dining' }),
    makeExpense({ id: 'big', date: '2026-09-05', amount: 60, category: 'Dining' }),
    makeExpense({ id: 'refunded', date: '2026-09-04', amount: 100, category: 'Dining', refunds: [refund] }),
    makeExpense({ id: 'other-cat', date: '2026-09-05', amount: 500, category: 'Bills' }),
    makeExpense({ id: 'last-month', date: '2026-08-31', amount: 40, category: 'Dining' }),
    makeExpense({ id: 'future', date: '2026-09-25', amount: 40, category: 'Dining' }),
  ];
  const ids = (l: { id: string }[]) => l.map((e) => e.id);

  it('lists a category’s expenses this month, biggest first after refunds', () => {
    expect(ids(drilldownExpenses(list, { kind: 'category', category: 'Dining' }, NOW))).toEqual(['big', 'small', 'refunded']);
  });

  it('lists every category in a month, the whole month', () => {
    expect(ids(drilldownExpenses(list, { kind: 'month', key: '2026-09' }, NOW))).toEqual(['other-cat', 'big', 'future', 'small', 'refunded']);
    expect(ids(drilldownExpenses(list, { kind: 'month', key: '2026-08' }, NOW))).toEqual(['last-month']);
  });

  it('breaks ties by the newest date', () => {
    const tie = [makeExpense({ id: 'old', date: '2026-09-01', amount: 5 }), makeExpense({ id: 'new', date: '2026-09-09', amount: 5 })];
    expect(ids(drilldownExpenses(tie, { kind: 'month', key: '2026-09' }, NOW))).toEqual(['new', 'old']);
  });
});

describe('drilldownTitle and drilldownQuery', () => {
  it('names the selection', () => {
    expect(drilldownTitle({ kind: 'category', category: 'Travel' }, NOW)).toBe('Travel · September 2026');
    expect(drilldownTitle({ kind: 'month', key: '2026-05' }, NOW)).toBe('May 2026');
  });

  it('builds the Expenses page filters', () => {
    expect(drilldownQuery({ kind: 'category', category: 'Travel' }, NOW)).toEqual({ category: 'Travel', from: '2026-09-01', to: '2026-09-20' });
    expect(drilldownQuery({ kind: 'month', key: '2026-05' }, NOW)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });
});
