import { TestBed } from '@angular/core/testing';
import { ExpenseStore } from '../../../core/expense-store';
import type { BankTransaction } from '../model/bank-transaction';
import { BankInbox, INBOX_STORAGE_KEY } from './bank-inbox';
import { CategoryRules, RULES_STORAGE_KEY } from './category-rules';

let counter = 0;
const tx = (over: Partial<BankTransaction> = {}): BankTransaction => ({
  id: `bank-${++counter}`,
  accountName: 'Checking',
  date: '2026-09-10',
  amount: -20,
  description: 'MYSTERY MERCHANT',
  pending: false,
  source: 'simplefin',
  ...over,
});

function setup() {
  TestBed.resetTestingModule();
  return { inbox: TestBed.inject(BankInbox), expenses: TestBed.inject(ExpenseStore), rules: TestBed.inject(CategoryRules) };
}

describe('BankInbox', () => {
  beforeEach(() => localStorage.clear());

  describe('add', () => {
    it('puts spending in the review list with a suggested category', () => {
      const { inbox } = setup();
      const result = inbox.add([tx({ description: 'STARBUCKS #55', amount: -6.5 }), tx({ description: 'NETFLIX.COM', amount: -15.99 })]);
      expect(result).toEqual({ added: 2, autoSkipped: 0, alreadyKnown: 0, pending: 0 });
      expect(inbox.toReview().map((i) => i.category)).toEqual(['Food', 'Entertainment']);
    });

    it('skips credits and transfers automatically, and says why', () => {
      const { inbox } = setup();
      const result = inbox.add([
        tx({ amount: 1500, description: 'PAYROLL' }),
        tx({ amount: -500, description: 'PAYMENT THANK YOU' }),
        tx({ amount: -9, description: 'COFFEE' }),
      ]);
      expect(result).toMatchObject({ added: 1, autoSkipped: 2 });
      expect(inbox.skipped().map((i) => i.skipReason)).toEqual(['credit', 'transfer']);
      expect(inbox.describeSkip(inbox.skipped()[0]!)).toMatch(/Money in/);
    });

    it('leaves pending transactions out until they post', () => {
      const { inbox } = setup();
      expect(inbox.add([tx({ pending: true })])).toMatchObject({ pending: 1, added: 0 });
      expect(inbox.items()).toEqual([]);
    });

    it('never adds the same transaction twice', () => {
      const { inbox } = setup();
      const t = tx();
      inbox.add([t]);
      expect(inbox.add([t])).toMatchObject({ added: 0, alreadyKnown: 1 });
      expect(inbox.items()).toHaveLength(1);
    });

    it('recognises a transaction that is already an expense by its bank id', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-10', amount: 20, category: 'Other', description: 'x', externalId: 'sf-1', source: 'simplefin' });
      expect(inbox.add([tx({ id: 'sf-1' })])).toMatchObject({ added: 0, alreadyKnown: 1 });
    });

    it('holds back a possible duplicate of something you typed in, instead of dropping it', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-09', amount: 20, category: 'Food', description: 'Lunch' });
      expect(inbox.add([tx({ amount: -20 })])).toMatchObject({ added: 0, autoSkipped: 1 });
      const item = inbox.skipped()[0]!;
      expect(item.skipReason).toBe('duplicate');
      expect(inbox.describeSkip(item)).toBe('Looks like Lunch · $20.00');
    });

    it('spots the same purchase arriving from two sources (CSV then sync)', () => {
      const { inbox } = setup();
      inbox.add([tx({ id: 'csv:1:1', source: 'csv', amount: -33.3 })]);
      inbox.add([tx({ id: 'sf-99', source: 'simplefin', amount: -33.3 })]);
      expect(inbox.skipped()).toHaveLength(1);
      expect(inbox.skipped()[0]!.skipReason).toBe('duplicate');
    });

    it('keeps two identical same-day purchases from the same bank feed (two coffees are two purchases)', () => {
      const { inbox } = setup();
      const result = inbox.add([tx({ description: 'COFFEE', amount: -5 }), tx({ description: 'COFFEE', amount: -5 })]);
      expect(result).toMatchObject({ added: 2, autoSkipped: 0 });
    });

    it('does not treat two purchases in one batch with different amounts as duplicates', () => {
      const { inbox } = setup();
      expect(inbox.add([tx({ amount: -5 }), tx({ amount: -6 })])).toMatchObject({ added: 2, autoSkipped: 0 });
    });
  });

  describe('categories and learning', () => {
    it('learns your choice and applies it to the same merchant, without touching others', () => {
      const { inbox } = setup();
      inbox.add([
        tx({ description: 'ACME HARDWARE 001' }),
        tx({ description: 'ACME HARDWARE 002' }),
        tx({ description: 'OTHER PLACE 9' }),
      ]);
      const first = inbox.toReview()[0]!;
      inbox.setCategory(first.id, 'Shopping');
      expect(inbox.toReview().map((i) => i.category)).toEqual(['Shopping', 'Shopping', 'Other']);
    });

    it('uses what it learned for later syncs, and remembers it across a reload', () => {
      const a = setup();
      a.inbox.add([tx({ description: 'ACME HARDWARE 001' })]);
      a.inbox.setCategory(a.inbox.toReview()[0]!.id, 'Bills');
      expect(localStorage.getItem(RULES_STORAGE_KEY)).toContain('ACME HARDWARE');

      const b = setup();
      b.inbox.add([tx({ description: 'ACME HARDWARE 777 OAKLAND' })]);
      expect(b.inbox.toReview()[0]!.category).toBe('Bills');
    });
  });

  describe('approve', () => {
    it('turns waiting items into expenses with the bank id, source and a tidy description', () => {
      const { inbox, expenses } = setup();
      inbox.add([tx({ id: 'sf-7', description: 'TRADER JOES #123', amount: -45.2, date: '2026-09-03' })]);
      expect(inbox.approve()).toBe(1);
      expect(expenses.expenses()[0]).toMatchObject({
        date: '2026-09-03',
        amount: 45.2,
        category: 'Food',
        description: 'Trader Joes #123',
        externalId: 'sf-7',
        source: 'simplefin',
      });
      expect(inbox.items()).toEqual([]);
    });

    it('approves only the chosen ids, and never touches skipped items', () => {
      const { inbox, expenses } = setup();
      inbox.add([tx({ description: 'A' }), tx({ description: 'B' }), tx({ amount: 100, description: 'PAYROLL' })]);
      const [a] = inbox.toReview();
      expect(inbox.approve([a!.id])).toBe(1);
      expect(expenses.count()).toBe(1);
      expect(inbox.reviewCount()).toBe(1);
      expect(inbox.approve()).toBe(1);
      expect(expenses.count()).toBe(2);
      expect(inbox.skipped()).toHaveLength(1); // the credit is still skipped
    });

    it('remembers approved transactions, even if you delete the expense later', () => {
      const { inbox, expenses } = setup();
      const t = tx();
      inbox.add([t]);
      inbox.approve();
      expenses.remove(expenses.expenses()[0]!.id);
      expect(inbox.add([t])).toMatchObject({ added: 0, alreadyKnown: 1 });
    });

    it('does nothing when there is nothing to approve', () => {
      expect(setup().inbox.approve()).toBe(0);
    });
  });

  describe('skip, restore and discard', () => {
    it('lets you skip an item, then bring it back', () => {
      const { inbox } = setup();
      inbox.add([tx()]);
      const id = inbox.toReview()[0]!.id;
      inbox.skip(id);
      expect(inbox.skipped()[0]).toMatchObject({ skipReason: 'manual' });
      inbox.restore(id);
      expect(inbox.toReview()).toHaveLength(1);
      expect(inbox.toReview()[0]!.skipReason).toBeNull();
    });

    it('"Import anyway" turns a flagged duplicate into a normal item that can be approved', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-10', amount: 20, category: 'Food', description: 'Lunch' });
      inbox.add([tx({ amount: -20 })]);
      inbox.restore(inbox.skipped()[0]!.id);
      expect(inbox.approve()).toBe(1);
      expect(expenses.count()).toBe(2);
    });

    it('discarding the skipped list keeps them from coming back on the next sync', () => {
      const { inbox } = setup();
      const t = tx({ amount: 500, description: 'DEPOSIT' });
      inbox.add([t]);
      expect(inbox.discardSkipped()).toBe(1);
      expect(inbox.items()).toEqual([]);
      expect(inbox.add([t])).toMatchObject({ added: 0, autoSkipped: 0, alreadyKnown: 1 });
    });
  });

  describe('persistence', () => {
    it('restores the inbox and the seen list after a reload', () => {
      const a = setup();
      const t = tx();
      a.inbox.add([t, tx({ description: 'OTHER' })]);
      a.inbox.approve([a.inbox.toReview()[0]!.id]);
      const b = setup();
      expect(b.inbox.toReview()).toHaveLength(1);
      expect(b.inbox.add([t])).toMatchObject({ alreadyKnown: 1 });
    });

    it('drops malformed entries and survives corrupt storage', () => {
      localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify({ items: [{ id: 'x' }, null, 5], seen: ['a', 3] }));
      expect(setup().inbox.items()).toEqual([]);
      localStorage.setItem(INBOX_STORAGE_KEY, '{oops');
      expect(setup().inbox.items()).toEqual([]);
    });

    it('flags an error, but keeps working, when storage rejects writes', () => {
      const { inbox } = setup();
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      inbox.add([tx()]);
      expect(inbox.toReview()).toHaveLength(1);
      expect(inbox.saveError()).toBeTruthy();
      spy.mockRestore();
    });
  });
});

describe('CategoryRules', () => {
  beforeEach(() => localStorage.clear());

  it('ignores invalid stored rules', () => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ GOOD: 'Food', BAD: 'Nonsense', WORSE: 5 }));
    TestBed.resetTestingModule();
    expect(TestBed.inject(CategoryRules).learned()).toEqual({ GOOD: 'Food' });
  });

  it('can forget a rule, and ignores descriptions with no merchant name', () => {
    const { rules } = setup();
    rules.learn('12345 678', 'Food');
    expect(rules.learned()).toEqual({});
    rules.learn('ACME 1', 'Bills');
    rules.forget('ACME');
    expect(rules.learned()).toEqual({});
  });
});
