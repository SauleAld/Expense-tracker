import { TestBed } from '@angular/core/testing';
import { DEPOSITS_STORAGE_KEY, DepositStore } from './deposit-store';
import type { DepositInput } from './models';

const input: DepositInput = { date: '2026-09-15', amount: 1200.004, description: '  Payroll  ', accountName: 'Checking', externalId: 'sf-1', source: 'simplefin' };

function createStore(): DepositStore {
  TestBed.resetTestingModule();
  return TestBed.inject(DepositStore);
}

describe('DepositStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(createStore().deposits()).toEqual([]);
  });

  it('adds deposits, rounding to cents and trimming, and keeps them across a reload', () => {
    const store = createStore();
    store.addMany([input, { ...input, externalId: 'sf-2', amount: 5 }]);
    expect(store.count()).toBe(2);
    expect(store.deposits()[0]).toMatchObject({ amount: 1200, description: 'Payroll', accountName: 'Checking', externalId: 'sf-1' });
    expect(createStore().deposits().map((d) => d.externalId)).toEqual(['sf-1', 'sf-2']);
  });

  it('removes and restores (undo) without duplicating', () => {
    const store = createStore();
    store.addMany([input]);
    const removed = store.remove(store.deposits()[0]!.id)!;
    expect(store.count()).toBe(0);
    expect(store.remove('nope')).toBeUndefined();
    store.restore(removed);
    store.restore(removed);
    expect(store.count()).toBe(1);
  });

  it('drops malformed entries and survives corrupt storage', () => {
    const good = { id: 'a', date: '2026-09-01', amount: 10, description: 'x', accountName: 'y', createdAt: 1, externalId: 'e', source: 'csv' };
    localStorage.setItem(
      DEPOSITS_STORAGE_KEY,
      JSON.stringify([good, { ...good, id: 'b', amount: -5 }, { ...good, id: 'c', source: 'nope' }, { ...good, id: 'd', externalId: '' }, null]),
    );
    expect(createStore().deposits().map((d) => d.id)).toEqual(['a']);
    localStorage.setItem(DEPOSITS_STORAGE_KEY, '{oops');
    expect(createStore().deposits()).toEqual([]);
  });

  it('flags an error, but keeps working, when storage rejects writes', () => {
    const store = createStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.addMany([input]);
    expect(store.count()).toBe(1);
    expect(store.saveError()).toBeTruthy();
    spy.mockRestore();
  });
});
