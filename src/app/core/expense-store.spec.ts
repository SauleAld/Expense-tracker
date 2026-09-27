import { TestBed } from '@angular/core/testing';
import { EXPENSES_STORAGE_KEY, ExpenseStore } from './expense-store';
import type { ExpenseInput } from './models';

const input: ExpenseInput = { date: '2026-09-10', amount: 12.345, category: 'Groceries', description: '  Lunch  ' };

function createStore(): ExpenseStore {
  TestBed.resetTestingModule();
  return TestBed.inject(ExpenseStore);
}

describe('ExpenseStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty with no errors', () => {
    const store = createStore();
    expect(store.expenses()).toEqual([]);
    expect(store.loadError()).toBeNull();
  });

  it('adds an expense, normalising amount and description, and persists it', () => {
    const store = createStore();
    const created = store.add(input);
    expect(created).toMatchObject({ amount: 12.35, description: 'Lunch', category: 'Groceries' });
    expect(created.id).toBeTruthy();

    const saved = JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY)!);
    expect(saved).toHaveLength(1);
    expect(saved[0].id).toBe(created.id);
  });

  it('reloads persisted data in a fresh instance', () => {
    createStore().add(input);
    expect(createStore().expenses()).toHaveLength(1);
  });

  it('updates in place and reports unknown ids', () => {
    const store = createStore();
    const { id } = store.add(input);
    expect(store.update(id, { ...input, amount: 99, description: 'Dinner' })).toBe(true);
    expect(store.expenses()[0]).toMatchObject({ id, amount: 99, description: 'Dinner' });
    expect(store.update('missing', input)).toBe(false);
  });

  it('removes and restores (undo) without duplicating', () => {
    const store = createStore();
    const { id } = store.add(input);
    const removed = store.remove(id)!;
    expect(store.expenses()).toHaveLength(0);
    store.restore(removed);
    store.restore(removed);
    expect(store.expenses()).toHaveLength(1);
    expect(store.remove('missing')).toBeUndefined();
  });

  it('keeps the bank id and source of imported expenses across a reload, and ignores a bad source', () => {
    const store = createStore();
    store.add({ ...input, externalId: 'sf-123', source: 'simplefin' });
    const reloaded = createStore().expenses()[0]!;
    expect(reloaded).toMatchObject({ externalId: 'sf-123', source: 'simplefin' });

    localStorage.setItem(
      EXPENSES_STORAGE_KEY,
      JSON.stringify([{ id: '1', date: '2026-09-10', amount: 5, category: 'Groceries', description: 'x', createdAt: 1, externalId: 42, source: 'other' }]),
    );
    const cleaned = createStore().expenses()[0]!;
    expect(cleaned.externalId).toBeUndefined();
    expect(cleaned.source).toBeUndefined();
  });

  it('editing an imported expense keeps its bank id', () => {
    const store = createStore();
    const { id } = store.add({ ...input, externalId: 'sf-9', source: 'csv' });
    store.update(id, { ...input, amount: 99 }); // the edit form knows nothing about bank ids
    expect(store.expenses()[0]).toMatchObject({ amount: 99, externalId: 'sf-9', source: 'csv' });
  });

  describe('refunds', () => {
    const refund = { externalId: 'sf-r1', date: '2026-09-12', amount: 20.004, description: 'Refund', source: 'simplefin' as const };

    it('attaches a refund to an expense and keeps it across a reload', () => {
      const store = createStore();
      const { id } = store.add({ ...input, amount: 50 });
      expect(store.addRefund(id, refund)).toBe(true);
      expect(store.addRefund('nope', refund)).toBe(false);
      expect(createStore().expenses()[0]!.refunds).toEqual([{ ...refund, amount: 20 }]);
    });

    it('detaches a refund, leaving no empty list behind', () => {
      const store = createStore();
      const { id } = store.add({ ...input, amount: 50 });
      store.addRefund(id, refund);
      expect(store.removeRefund(id, 'sf-r1')).toMatchObject({ externalId: 'sf-r1' });
      expect(store.removeRefund(id, 'sf-r1')).toBeUndefined();
      expect(store.expenses()[0]).not.toHaveProperty('refunds');
    });

    it('keeps refunds when the expense is edited, and drops malformed ones on load', () => {
      const store = createStore();
      const { id } = store.add({ ...input, amount: 50 });
      store.addRefund(id, refund);
      store.update(id, { ...input, amount: 60 });
      expect(store.expenses()[0]!.refunds).toHaveLength(1);

      const saved = JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY)!);
      saved[0].refunds.push({ externalId: 'bad', date: 'x', amount: 5, description: 'y' }, { externalId: 'neg', date: '2026-09-01', amount: -5, description: 'y' });
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(saved));
      expect(createStore().expenses()[0]!.refunds!.map((r) => r.externalId)).toEqual(['sf-r1']);
    });
  });

  describe('categories that were renamed', () => {
    const old = (over: object = {}) => ({ id: 'e1', date: '2026-09-10', amount: 12.5, category: 'Food', description: 'Lunch', createdAt: 1, ...over });

    it('keeps expenses saved as "Food" and shows them as "Groceries" (nothing is lost)', () => {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify([old(), old({ id: 'e2', category: 'Bills' })]));
      const store = createStore();
      expect(store.expenses().map((e) => e.category)).toEqual(['Groceries', 'Bills']);
      expect(store.loadError()).toBeNull(); // not reported as unreadable
    });

    it('stores them under the new name from then on, without losing anything else', () => {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify([old({ externalId: 'sf-1', source: 'simplefin' })]));
      createStore();
      const saved = JSON.parse(localStorage.getItem(EXPENSES_STORAGE_KEY)!);
      expect(saved).toHaveLength(1);
      expect(saved[0]).toMatchObject({ category: 'Groceries', amount: 12.5, description: 'Lunch', externalId: 'sf-1' });
      expect(localStorage.getItem(EXPENSES_STORAGE_KEY)).not.toContain('Food');
    });

    it('does not rewrite storage when nothing needed migrating', () => {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify([old({ category: 'Bills' })]));
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      createStore();
      expect(setItem).not.toHaveBeenCalled();
      setItem.mockRestore();
    });

    it('still drops a category it has never heard of', () => {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify([old({ category: 'Pets' })]));
      const store = createStore();
      expect(store.expenses()).toEqual([]);
      expect(store.loadError()).toMatch(/1 saved entry was unreadable/);
    });

    it('accepts every new category', () => {
      const store = createStore();
      for (const category of ['Dining', 'Subscriptions', 'Travel', 'Home Improvement'] as const) {
        store.add({ ...input, category });
      }
      expect(createStore().expenses().map((e) => e.category)).toEqual(['Dining', 'Subscriptions', 'Travel', 'Home Improvement']);
    });
  });

  it('skips invalid entries and reports how many', () => {
    localStorage.setItem(
      EXPENSES_STORAGE_KEY,
      JSON.stringify([
        { id: '1', date: '2026-09-10', amount: 5, category: 'Groceries', description: 'ok', createdAt: 1 },
        { id: '2', date: 'not-a-date', amount: 5, category: 'Groceries', description: 'bad date' },
        { id: '3', date: '2026-09-10', amount: 5, category: 'Pets', description: 'bad category' },
        null,
      ]),
    );
    const store = createStore();
    expect(store.expenses().map((e) => e.id)).toEqual(['1']);
    expect(store.loadError()).toMatch(/3 saved entries were unreadable/);
  });

  it('recovers from corrupt JSON, reports it, and keeps a backup', () => {
    localStorage.setItem(EXPENSES_STORAGE_KEY, '{oops');
    const store = createStore();
    expect(store.expenses()).toEqual([]);
    expect(store.loadError()).toBeTruthy();
    expect(localStorage.getItem(`${EXPENSES_STORAGE_KEY}.corrupt-backup`)).toBe('{oops');
  });

  it('keeps working in memory and flags an error when storage rejects writes', () => {
    const store = createStore();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.add(input);
    expect(store.expenses()).toHaveLength(1);
    expect(store.saveError()).toBeTruthy();
    spy.mockRestore();

    store.add(input);
    expect(store.saveError()).toBeNull();
  });
});
