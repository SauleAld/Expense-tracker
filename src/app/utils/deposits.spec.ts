import type { Deposit } from '../core/models';
import { filterDeposits, sumDeposits } from './deposits';

let n = 0;
const deposit = (over: Partial<Deposit> = {}): Deposit => ({
  id: `d${++n}`,
  date: '2026-09-10',
  amount: 100,
  description: 'Payroll',
  accountName: 'Checking',
  createdAt: n,
  externalId: `x${n}`,
  source: 'simplefin',
  ...over,
});

describe('filterDeposits', () => {
  const list = [
    deposit({ id: 'a', date: '2026-09-01', description: 'Payroll', accountName: 'Checking' }),
    deposit({ id: 'b', date: '2026-09-20', description: 'Interest', accountName: 'Savings', amount: 3.21 }),
    deposit({ id: 'c', date: '2026-08-15', description: 'Venmo from Sam' }),
  ];
  const ids = (d: Deposit[]) => d.map((x) => x.id);
  const none = { search: '', from: '', to: '' };

  it('returns everything, newest first', () => {
    expect(ids(filterDeposits(list, none))).toEqual(['b', 'a', 'c']);
  });

  it('filters by an inclusive date range', () => {
    expect(ids(filterDeposits(list, { ...none, from: '2026-09-01', to: '2026-09-20' }))).toEqual(['b', 'a']);
  });

  it('searches description, account and amount, ignoring case', () => {
    expect(ids(filterDeposits(list, { ...none, search: 'savings' }))).toEqual(['b']);
    expect(ids(filterDeposits(list, { ...none, search: 'VENMO' }))).toEqual(['c']);
    expect(ids(filterDeposits(list, { ...none, search: '3.21' }))).toEqual(['b']);
  });

  it('does not change its input', () => {
    const copy = [...list];
    filterDeposits(list, none);
    expect(list).toEqual(copy);
  });
});

describe('sumDeposits', () => {
  it('adds in cents without float drift', () => {
    expect(sumDeposits([0.1, 0.2].map((amount) => deposit({ amount })))).toBe(0.3);
    expect(sumDeposits([])).toBe(0);
  });
});
