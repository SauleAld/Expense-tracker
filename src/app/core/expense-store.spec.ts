import { TestBed } from '@angular/core/testing';
import { EXPENSES_STORAGE_KEY, ExpenseStore } from './expense-store';
import type { ExpenseInput } from './models';

const input: ExpenseInput = { date: '2026-09-10', amount: 12.345, category: 'Food', description: '  Lunch  ' };

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
    expect(created).toMatchObject({ amount: 12.35, description: 'Lunch', category: 'Food' });
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
      JSON.stringify([{ id: '1', date: '2026-09-10', amount: 5, category: 'Food', description: 'x', createdAt: 1, externalId: 42, source: 'other' }]),
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

  it('skips invalid entries and reports how many', () => {
    localStorage.setItem(
      EXPENSES_STORAGE_KEY,
      JSON.stringify([
        { id: '1', date: '2026-09-10', amount: 5, category: 'Food', description: 'ok', createdAt: 1 },
        { id: '2', date: 'not-a-date', amount: 5, category: 'Food', description: 'bad date' },
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
