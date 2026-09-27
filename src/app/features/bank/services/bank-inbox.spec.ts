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
      expect(inbox.toReview().map((i) => i.category)).toEqual(['Dining', 'Subscriptions']);
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
      expenses.add({ date: '2026-09-09', amount: 20, category: 'Groceries', description: 'Lunch' });
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
        category: 'Groceries',
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

  describe('refunds', () => {
    it('matches a refund to the purchase it came from, and takes it off that expense when approved', () => {
      const { inbox, expenses } = setup();
      inbox.add([tx({ id: 'sf-buy', description: 'TARGET 00012', amount: -50, date: '2026-09-01' })]);
      inbox.approve();
      const result = inbox.add([tx({ id: 'sf-back', description: 'REFUND TARGET 00012', amount: 50, date: '2026-09-08' })]);
      expect(result).toMatchObject({ added: 1, autoSkipped: 0 });
      const [refund] = inbox.toReview();
      expect(refund).toMatchObject({ kind: 'refund', refundFor: 'sf-buy', category: 'Shopping' });

      expect(inbox.approve()).toBe(1);
      expect(expenses.count()).toBe(1);
      expect(expenses.expenses()[0]!.refunds).toEqual([
        { externalId: 'sf-back', date: '2026-09-08', amount: 50, description: 'Refund Target 00012', source: 'simplefin' },
      ]);
      expect(inbox.add([tx({ id: 'sf-back', amount: 50 })])).toMatchObject({ alreadyKnown: 1 });
    });

    it('matches a purchase and its refund that arrive in the same sync, and approves them together', () => {
      const { inbox, expenses } = setup();
      inbox.add([
        tx({ id: 'r', description: 'AMAZON.COM RETURN', amount: 19.99, date: '2026-09-05' }),
        tx({ id: 'p', description: 'AMAZON.COM*AB12CD', amount: -19.99, date: '2026-09-02' }),
      ]);
      expect(inbox.toReview().find((i) => i.id === 'r')!.refundFor).toBe('p');
      expect(inbox.approve()).toBe(2);
      expect(expenses.expenses()[0]!.refunds).toHaveLength(1);
      expect(inbox.items()).toEqual([]);
    });

    it('never lets two refunds claim more than a purchase cost', () => {
      const { inbox } = setup();
      inbox.add([
        tx({ id: 'p', description: 'NIKE 55', amount: -30, date: '2026-09-01' }),
        tx({ id: 'r1', description: 'NIKE 55 REFUND', amount: 30, date: '2026-09-03' }),
        tx({ id: 'r2', description: 'NIKE 55 REFUND', amount: 30, date: '2026-09-04' }),
      ]);
      expect(inbox.toReview().filter((i) => i.kind === 'refund').map((i) => i.refundFor)).toEqual(['p', null]);
    });

    it('asks you to choose when a refund does not match a purchase on its own, and waits until you do', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-01', amount: 80, category: 'Travel', description: 'Hotel' });
      inbox.add([tx({ id: 'r', description: 'REFUND 7781', amount: 25, date: '2026-09-03' })]);
      const [refund] = inbox.toReview();
      expect(refund).toMatchObject({ kind: 'refund', refundFor: null });
      expect(inbox.refundState(refund!)).toBe('choose');
      expect(inbox.approvable()).toEqual([]);
      expect(inbox.approve()).toBe(0);

      const [option] = inbox.refundOptions(refund!);
      expect(option).toMatchObject({ description: 'Hotel', sameMerchant: false });
      inbox.setRefundTarget('r', option!.key);
      expect(inbox.toReview()[0]).toMatchObject({ refundFor: option!.key, category: 'Travel' });
      expect(inbox.approve()).toBe(1);
      expect(expenses.expenses()[0]!.refunds![0]!.amount).toBe(25);
    });

    it('leaves money in that is not a refund (pay, deposits) in Skipped, and "It\'s a refund" brings it back to match', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-01', amount: 40, category: 'Shopping', description: 'Gift shop' });
      inbox.add([tx({ id: 'c', description: 'VENMO CASHOUT', amount: 40, date: '2026-09-04' })]);
      expect(inbox.skipped()[0]).toMatchObject({ kind: 'credit', skipReason: 'credit' });
      inbox.restore('c');
      expect(inbox.toReview()[0]).toMatchObject({ kind: 'refund', status: 'new', refundFor: null });
      expect(inbox.approve()).toBe(0); // money in never becomes an expense
      expect(expenses.count()).toBe(1);
    });

    it('holds a refund whose purchase was skipped, rather than dropping it', () => {
      const { inbox } = setup();
      inbox.add([
        tx({ id: 'p', description: 'IKEA 12', amount: -100, date: '2026-09-01' }),
        tx({ id: 'r', description: 'IKEA 12 RETURN', amount: 40, date: '2026-09-06' }),
      ]);
      inbox.skip('p');
      const refund = inbox.toReview()[0]!;
      expect(inbox.refundState(refund)).toBe('waiting');
      expect(inbox.approve()).toBe(0);
      expect(inbox.refundOptions(refund)[0]).toMatchObject({ key: 'p' }); // still shown as chosen
    });

    it('unmatching puts the refund back in the inbox to be matched again', () => {
      const { inbox, expenses } = setup();
      inbox.add([
        tx({ id: 'p', description: 'IKEA 12', amount: -100, date: '2026-09-01' }),
        tx({ id: 'r', description: 'IKEA 12 RETURN', amount: 40, date: '2026-09-06' }),
      ]);
      inbox.approve();
      const expense = expenses.expenses()[0]!;
      expect(inbox.unlinkRefund(expense.id, 'r')).toBe(true);
      expect(expenses.expenses()[0]!.refunds).toBeUndefined();
      expect(inbox.toReview()[0]).toMatchObject({ id: 'r', kind: 'refund', refundFor: null, amount: 40 });
      expect(inbox.unlinkRefund(expense.id, 'r')).toBe(false);
    });

    it('picks the purchase by itself when you say a skipped deposit is a refund and the store matches', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-01', amount: 60, category: 'Shopping', description: 'Best Buy #44', externalId: 'sf-bb', source: 'simplefin' });
      inbox.add([tx({ id: 'c', description: 'BEST BUY 44', amount: 60, date: '2026-09-09' })]);
      // No refund wording, but the store matches, so it is recognised on the way in.
      expect(inbox.toReview()[0]).toMatchObject({ kind: 'refund', refundFor: 'sf-bb' });
      inbox.skip('c');
      inbox.restore('c');
      expect(inbox.toReview()[0]).toMatchObject({ kind: 'refund', refundFor: 'sf-bb' });
    });

    it('does not turn a transfer in into a refund', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-09-01', amount: 500, category: 'Bills', description: 'Rent' });
      inbox.add([tx({ description: 'TRANSFER FROM SAVINGS REFUND', amount: 200 })]);
      expect(inbox.skipped()[0]).toMatchObject({ kind: 'credit', skipReason: 'credit' });
    });

    it('does not match a refund to a purchase more than 6 months earlier', () => {
      const { inbox, expenses } = setup();
      expenses.add({ date: '2026-01-02', amount: 50, category: 'Shopping', description: 'Target 12', externalId: 'old', source: 'csv' });
      inbox.add([tx({ description: 'TARGET 12 REFUND', amount: 50, date: '2026-09-10' })]);
      expect(inbox.toReview()[0]).toMatchObject({ kind: 'refund', refundFor: null });
    });

    it('changing a purchase category never rewrites a refund from the same store', () => {
      const { inbox } = setup();
      inbox.add([
        tx({ id: 'p', description: 'ACME STORE 1', amount: -30, date: '2026-09-01' }),
        tx({ id: 'r', description: 'ACME STORE 1 REFUND', amount: 10, date: '2026-09-02' }),
      ]);
      const before = inbox.toReview().find((i) => i.id === 'r')!.category;
      inbox.setCategory('p', 'Bills');
      expect(inbox.toReview().find((i) => i.id === 'r')!.category).toBe(before);
    });

    it('clearing the chosen purchase puts the refund back to "choose"', () => {
      const { inbox } = setup();
      inbox.add([
        tx({ id: 'p', description: 'IKEA 12', amount: -100, date: '2026-09-01' }),
        tx({ id: 'r', description: 'IKEA 12 RETURN', amount: 40, date: '2026-09-06' }),
      ]);
      inbox.setRefundTarget('r', null);
      expect(inbox.refundState(inbox.toReview().find((i) => i.id === 'r')!)).toBe('choose');
      inbox.setRefundTarget('r', 'no-such-purchase');
      expect(inbox.toReview().find((i) => i.id === 'r')!.refundFor).toBeNull();
    });

    it('describes the chosen purchase, whether it is an expense or still in the inbox', () => {
      const { inbox, expenses } = setup();
      const e = expenses.add({ date: '2026-09-01', amount: 25, category: 'Dining', description: 'Pizza' });
      inbox.add([tx({ id: 'p', description: 'NIKE 55', amount: -30, date: '2026-09-01' })]);
      expect(inbox.describeTarget(e.id)).toMatchObject({ key: e.id, description: 'Pizza', remainingCents: 2500, category: 'Dining' });
      expect(inbox.describeTarget('p')).toMatchObject({ key: 'p', description: 'Nike 55', remainingCents: 3000 });
      expect(inbox.describeTarget('missing')).toBeNull();
    });

    it('offers only what is left of a partly refunded purchase', () => {
      const { inbox, expenses } = setup();
      const e = expenses.add({ date: '2026-09-01', amount: 100, category: 'Shopping', description: 'Zara 3', externalId: 'z', source: 'csv' });
      expenses.addRefund(e.id, { externalId: 'r0', date: '2026-09-02', amount: 70, description: 'Zara refund' });
      inbox.add([tx({ id: 'r1', description: 'ZARA 3 REFUND', amount: 40, date: '2026-09-05' })]);
      expect(inbox.toReview()[0]!.refundFor).toBeNull(); // $30 left can't cover $40
      inbox.add([tx({ id: 'r2', description: 'ZARA 3 REFUND', amount: 30, date: '2026-09-06' })]);
      expect(inbox.toReview().find((i) => i.id === 'r2')!.refundFor).toBe('z');
    });

    it('remembers refunds and their chosen purchase across a reload, and reads old items without one', () => {
      const a = setup();
      a.inbox.add([
        tx({ id: 'p', description: 'IKEA 12', amount: -100, date: '2026-09-01' }),
        tx({ id: 'r', description: 'IKEA 12 RETURN', amount: 40, date: '2026-09-06' }),
      ]);
      const b = setup();
      expect(b.inbox.toReview().find((i) => i.id === 'r')).toMatchObject({ kind: 'refund', refundFor: 'p' });
      expect(b.inbox.toReview().find((i) => i.id === 'p')!.refundFor).toBeNull();
    });

    it('does not flag a purchase as a duplicate of a refund with the same amount', () => {
      const { inbox } = setup();
      inbox.add([tx({ id: 'r', source: 'csv', description: 'SHOP REFUND', amount: 20 })]);
      expect(inbox.add([tx({ id: 'p', amount: -20 })])).toMatchObject({ added: 1, autoSkipped: 0 });
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
      expenses.add({ date: '2026-09-10', amount: 20, category: 'Groceries', description: 'Lunch' });
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

describe('categories that were renamed', () => {
  beforeEach(() => localStorage.clear());

  it('keeps inbox items saved as "Food" and shows them as "Groceries"', () => {
    const item = { id: 'sf:1', accountName: 'x', date: '2026-09-10', amount: -20, description: 'TRADER JOES', pending: false, source: 'simplefin', kind: 'expense', category: 'Food', status: 'new', skipReason: null, duplicateOf: null, addedAt: 1 }; // saved before refunds existed
    localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify({ items: [item], seen: [] }));
    const { inbox, expenses } = setup();
    expect(inbox.toReview().map((i) => i.category)).toEqual(['Groceries']);
    inbox.approve();
    expect(expenses.expenses()[0]!.category).toBe('Groceries');
  });

  it('carries a learned rule for "Food" over to "Groceries", and drops unknown ones', () => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ TRADER: 'Food', GOOD: 'Dining', BAD: 'Nonsense' }));
    TestBed.resetTestingModule();
    expect(TestBed.inject(CategoryRules).learned()).toEqual({ TRADER: 'Groceries', GOOD: 'Dining' });
  });
});

describe('CategoryRules', () => {
  beforeEach(() => localStorage.clear());

  it('ignores invalid stored rules', () => {
    localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify({ GOOD: 'Groceries', BAD: 'Nonsense', WORSE: 5 }));
    TestBed.resetTestingModule();
    expect(TestBed.inject(CategoryRules).learned()).toEqual({ GOOD: 'Groceries' });
  });

  it('can forget a rule, and ignores descriptions with no merchant name', () => {
    const { rules } = setup();
    rules.learn('12345 678', 'Groceries');
    expect(rules.learned()).toEqual({});
    rules.learn('ACME 1', 'Bills');
    rules.forget('ACME');
    expect(rules.learned()).toEqual({});
  });
});
