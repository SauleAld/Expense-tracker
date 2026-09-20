import { DEFAULT_FILTERS, filterExpenses, hasActiveFilters } from './filter';
import { makeExpense } from './test-helpers';

const list = [
  makeExpense({ id: 'a', date: '2026-09-01', amount: 12.5, category: 'Food', description: 'Coffee beans' }),
  makeExpense({ id: 'b', date: '2026-09-05', amount: 60, category: 'Transportation', description: 'Gas' }),
  makeExpense({ id: 'c', date: '2026-08-20', amount: 1450, category: 'Bills', description: 'Rent' }),
  makeExpense({ id: 'd', date: '2026-09-05', amount: 9, category: 'Food', description: 'Lunch' }),
];
const ids = (r: { id: string }[]) => r.map((e) => e.id);

describe('filterExpenses', () => {
  it('returns everything, newest first, by default', () => {
    expect(ids(filterExpenses(list, DEFAULT_FILTERS))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('filters by category', () => {
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, category: 'Food' }))).toEqual(['d', 'a']);
  });

  it('treats the date range as inclusive on both ends', () => {
    const result = filterExpenses(list, { ...DEFAULT_FILTERS, from: '2026-09-01', to: '2026-09-05' });
    expect(ids(result).sort()).toEqual(['a', 'b', 'd']);
  });

  it('supports open-ended ranges', () => {
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, to: '2026-08-31' }))).toEqual(['c']);
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, from: '2026-09-05' }))).toEqual(['d', 'b']);
  });

  it('returns nothing when from is after to', () => {
    expect(filterExpenses(list, { ...DEFAULT_FILTERS, from: '2026-09-30', to: '2026-09-01' })).toEqual([]);
  });

  it('searches description, category and amount case-insensitively', () => {
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, search: 'COFFEE' }))).toEqual(['a']);
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, search: 'bills' }))).toEqual(['c']);
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, search: '12.50' }))).toEqual(['a']);
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, search: '  rent ' }))).toEqual(['c']);
  });

  it('combines filters with AND', () => {
    const result = filterExpenses(list, { ...DEFAULT_FILTERS, category: 'Food', from: '2026-09-02' });
    expect(ids(result)).toEqual(['d']); // 'a' is Food but before the range; 'b' is in range but not Food
  });

  it('sorts by amount both ways', () => {
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, sort: 'amount-desc' }))).toEqual(['c', 'b', 'a', 'd']);
    expect(ids(filterExpenses(list, { ...DEFAULT_FILTERS, sort: 'amount-asc' }))).toEqual(['d', 'a', 'b', 'c']);
  });

  it('does not mutate its input', () => {
    const copy = [...list];
    filterExpenses(list, { ...DEFAULT_FILTERS, sort: 'amount-asc' });
    expect(list).toEqual(copy);
  });
});

describe('hasActiveFilters', () => {
  it('ignores sort and whitespace-only search', () => {
    expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, sort: 'amount-asc', search: '   ' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_FILTERS, category: 'Bills' })).toBe(true);
  });
});
