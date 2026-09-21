import { makeExpense } from '../../../utils/test-helpers';
import { findDuplicate, fromExpense, type Comparable } from './dedupe';

const item = (over: Partial<Comparable> = {}): Comparable => ({ key: 'a', date: '2026-09-10', cents: 1250, label: 'Lunch · $12.50', ...over });
const tx = (over: Partial<{ id: string; date: string; amount: number }> = {}) => ({ id: 'bank-1', date: '2026-09-10', amount: -12.5, ...over });

describe('findDuplicate', () => {
  it('flags the same amount on the same day', () => {
    expect(findDuplicate(tx(), [item()])?.key).toBe('a');
  });

  it('allows a day either side, since banks post late', () => {
    expect(findDuplicate(tx({ date: '2026-09-11' }), [item()])).not.toBeNull();
    expect(findDuplicate(tx({ date: '2026-09-09' }), [item()])).not.toBeNull();
  });

  it('does not flag two days apart, or a different amount', () => {
    expect(findDuplicate(tx({ date: '2026-09-12' }), [item()])).toBeNull();
    expect(findDuplicate(tx({ amount: -12.51 }), [item()])).toBeNull();
  });

  it('never matches a record against itself', () => {
    expect(findDuplicate(tx({ id: 'a' }), [item({ key: 'a' })])).toBeNull();
  });

  it('prefers the closest date when several match', () => {
    const pool = [item({ key: 'far', date: '2026-09-11' }), item({ key: 'near', date: '2026-09-10' })];
    expect(findDuplicate(tx(), pool)?.key).toBe('near');
  });

  it('compares magnitudes, so a debit matches a positive manual expense', () => {
    expect(findDuplicate(tx({ amount: 12.5 }), [item()])).not.toBeNull();
  });

  it('never flags records from the same source: each has its own bank id, so they are separate purchases', () => {
    const csvItem = item({ key: 'csv:1:1', source: 'csv' });
    expect(findDuplicate({ ...tx(), source: 'csv' }, [csvItem])).toBeNull();
    expect(findDuplicate({ ...tx(), source: 'simplefin' }, [csvItem])).not.toBeNull();
  });

  it('flags a bank record against something typed by hand (no source)', () => {
    expect(findDuplicate({ ...tx(), source: 'simplefin' }, [item()])).not.toBeNull();
  });

  it('works across a month boundary', () => {
    expect(findDuplicate(tx({ date: '2026-10-01' }), [item({ date: '2026-09-30' })])).not.toBeNull();
  });
});

describe('fromExpense', () => {
  it('uses the bank id when there is one, and describes the entry', () => {
    const imported = makeExpense({ externalId: 'sf-1', amount: 12.5, description: 'Lunch', source: 'simplefin' });
    expect(fromExpense(imported)).toMatchObject({ key: 'sf-1', cents: 1250, label: 'Lunch · $12.50', source: 'simplefin' });
    const manual = makeExpense({ id: 'manual-1' });
    expect(fromExpense(manual).key).toBe('manual-1');
  });
});
