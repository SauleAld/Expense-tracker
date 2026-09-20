import { CATEGORIES } from '../../core/models';
import { makeExpense } from '../../utils/test-helpers';
import { describeCategories, describeRange, selectExpenses, summarizeSelection } from './export-select';

const list = [
  makeExpense({ id: 'a', date: '2026-09-01', amount: 10, category: 'Food' }),
  makeExpense({ id: 'b', date: '2026-09-05', amount: 20.5, category: 'Bills' }),
  makeExpense({ id: 'c', date: '2026-08-20', amount: 30, category: 'Food' }),
  makeExpense({ id: 'd', date: '2026-09-05', amount: 5, category: 'Other' }),
];
const all = { from: '', to: '', categories: CATEGORIES };
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe('selectExpenses', () => {
  it('returns everything newest first when unfiltered', () => {
    expect(ids(selectExpenses(list, all))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('filters by any of the chosen categories', () => {
    expect(ids(selectExpenses(list, { ...all, categories: ['Food', 'Other'] }))).toEqual(['d', 'a', 'c']);
  });

  it('returns nothing when no category is selected', () => {
    expect(selectExpenses(list, { ...all, categories: [] })).toEqual([]);
  });

  it('treats both date bounds as inclusive', () => {
    const rows = selectExpenses(list, { ...all, from: '2026-09-01', to: '2026-09-05' });
    expect(ids(rows).sort()).toEqual(['a', 'b', 'd']);
  });

  it('supports open-ended ranges', () => {
    expect(ids(selectExpenses(list, { ...all, from: '2026-09-05' }))).toEqual(['d', 'b']);
    expect(ids(selectExpenses(list, { ...all, to: '2026-08-31' }))).toEqual(['c']);
  });

  it('combines date range and categories', () => {
    expect(ids(selectExpenses(list, { from: '2026-09-01', to: '', categories: ['Food'] }))).toEqual(['a']);
  });

  it('does not mutate the input array', () => {
    const copy = [...list];
    selectExpenses(list, all);
    expect(list).toEqual(copy);
  });
});

describe('summarizeSelection', () => {
  it('reports count, exact total and date span', () => {
    const rows = selectExpenses(list, all);
    expect(summarizeSelection(rows)).toEqual({ count: 4, total: 65.5, first: '2026-08-20', last: '2026-09-05' });
  });

  it('handles an empty selection', () => {
    expect(summarizeSelection([])).toEqual({ count: 0, total: 0, first: null, last: null });
  });
});

describe('descriptions', () => {
  it('describes ranges', () => {
    expect(describeRange({ from: '', to: '' })).toBe('All dates');
    expect(describeRange({ from: '2026-09-01', to: '' })).toBe('From Sep 1, 2026');
    expect(describeRange({ from: '', to: '2026-09-20' })).toBe('Until Sep 20, 2026');
    expect(describeRange({ from: '2026-09-01', to: '2026-09-20' })).toBe('Sep 1, 2026 – Sep 20, 2026');
  });

  it('describes categories in canonical order', () => {
    expect(describeCategories(CATEGORIES)).toBe('All categories');
    expect(describeCategories(['Bills', 'Food'])).toBe('Food, Bills');
    expect(describeCategories([])).toBe('None');
  });
});
