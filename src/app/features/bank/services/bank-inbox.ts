import { Injectable, computed, inject, signal } from '@angular/core';
import { ExpenseStore } from '../../../core/expense-store';
import { netAmount, parseCategory, type Category, type Expense, type ExpenseInput } from '../../../core/models';
import { isValidISODate } from '../../../utils/dates';
import { formatCurrency } from '../../../utils/format';
import type { BankTransaction, InboxItem, SkipReason } from '../model/bank-transaction';
import { isTransferLike, merchantKey, tidyDescription } from '../utils/categorize';
import { findDuplicate, fromExpense, type Comparable } from '../utils/dedupe';
import { findRefundTarget, isRefundLike, rankRefundTargets, type RankedTarget, type RefundTarget } from '../utils/refunds';
import { CategoryRules } from './category-rules';

export const INBOX_STORAGE_KEY = 'spendwise.bank.inbox.v1';
/** Ids of approved and discarded transactions are remembered so they never come back. */
const SEEN_LIMIT = 5000;

export interface AddResult {
  /** Waiting for your review (purchases, and refunds to match to one). */
  added: number;
  /** Put straight into "Skipped": money in that isn't a refund, transfers and possible duplicates. */
  autoSkipped: number;
  /** Seen before (imported, approved or discarded), so ignored. */
  alreadyKnown: number;
  /** Still pending at the bank, so left out until they post. */
  pending: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function parseItem(value: unknown): InboxItem | null {
  if (!isObject(value)) return null;
  const category = parseCategory(value['category']);
  if (
    typeof value['id'] !== 'string' ||
    typeof value['date'] !== 'string' ||
    !isValidISODate(value['date']) ||
    typeof value['amount'] !== 'number' ||
    !Number.isFinite(value['amount']) ||
    typeof value['description'] !== 'string' ||
    category === null ||
    !['new', 'skipped'].includes(String(value['status'])) ||
    !['expense', 'refund', 'credit', 'transfer'].includes(String(value['kind'])) ||
    !['simplefin', 'csv'].includes(String(value['source']))
  ) {
    return null;
  }
  const refundFor = typeof value['refundFor'] === 'string' ? value['refundFor'] : null;
  return { ...(value as unknown as InboxItem), category, refundFor };
}

const cents = (amount: number) => Math.round(Math.abs(amount) * 100);
/** How a purchase is referred to by a refund; an inbox item keeps its key once approved. */
const expenseKey = (e: Expense) => e.externalId ?? e.id;

/**
 * The review inbox: transactions from a bank sync or a CSV file wait here until you approve them.
 * Approving turns purchases into expenses and attaches refunds to the purchase they give money
 * back for; skipping keeps them out for good.
 */
@Injectable({ providedIn: 'root' })
export class BankInbox {
  private readonly expenses = inject(ExpenseStore);
  private readonly rules = inject(CategoryRules);

  private readonly _items = signal<InboxItem[]>([]);
  private readonly _seen = signal<string[]>([]);

  readonly items = this._items.asReadonly();
  readonly toReview = computed(() => this._items().filter((i) => i.status === 'new'));
  readonly skipped = computed(() => this._items().filter((i) => i.status === 'skipped'));
  readonly reviewCount = computed(() => this.toReview().length);
  /** Waiting items that can be approved now: a refund needs its purchase to be an expense, or approved along with it. */
  readonly approvable = computed(() => this.toReview().filter((i) => this.refundState(i) === 'ready'));
  readonly saveError = signal<string | null>(null);

  constructor() {
    this.load();
  }

  /** Adds transactions to the inbox, working out what to suggest and what to leave out. */
  add(transactions: readonly BankTransaction[], now: number = Date.now()): AddResult {
    const result: AddResult = { added: 0, autoSkipped: 0, alreadyKnown: 0, pending: 0 };
    const known = new Set<string>([
      ...this._seen(),
      ...this._items().map((i) => i.id),
      ...this.expenses.expenses().flatMap((e) => [
        ...(e.externalId ? [e.externalId] : []),
        ...(e.refunds ?? []).map((r) => r.externalId),
      ]),
    ]);
    // What a new transaction could be a duplicate of: what was here before this batch.
    const pool: Comparable[] = [
      ...this.expenses.expenses().map(fromExpense),
      ...this._items().filter((i) => i.amount < 0).map<Comparable>((i) => ({
        key: i.id,
        date: i.date,
        cents: Math.round(Math.abs(i.amount) * 100),
        label: i.description,
        source: i.source,
      })),
    ];
    const created: InboxItem[] = [];

    for (const tx of transactions) {
      if (tx.pending) {
        result.pending++;
        continue;
      }
      if (known.has(tx.id)) {
        result.alreadyKnown++;
        continue;
      }
      known.add(tx.id);

      // Money in starts out as a plain credit; below, the ones that belong to a purchase become refunds.
      const kind = tx.amount > 0 ? 'credit' : isTransferLike(tx.description) ? 'transfer' : 'expense';
      const duplicate = kind === 'expense' ? findDuplicate(tx, pool) : null;
      const skipReason: SkipReason | null = duplicate ? 'duplicate' : kind === 'expense' ? null : kind;

      created.push({
        ...tx,
        kind,
        category: this.rules.suggest(tx.description).category,
        status: skipReason ? 'skipped' : 'new',
        skipReason,
        duplicateOf: duplicate?.label ?? null,
        refundFor: null,
        addedAt: now,
      });
    }

    // Matched after the loop so a refund can find a purchase that arrived in the same batch,
    // and one at a time so two refunds never claim the same money.
    for (let n = 0; n < created.length; n++) {
      const item = created[n]!;
      if (item.kind !== 'credit' || isTransferLike(item.description)) continue;
      const target = findRefundTarget(item, this.refundPool([...this._items(), ...created], item.id));
      if (!target && !isRefundLike(item.description)) continue;
      created[n] = this.asRefund(item, target);
    }
    for (const item of created) item.status === 'skipped' ? result.autoSkipped++ : result.added++;

    if (created.length > 0) this.commit([...this._items(), ...created], this._seen());
    return result;
  }

  /** Purchases a refund could belong to, best first, for choosing by hand. */
  refundOptions(item: InboxItem): RankedTarget[] {
    const options = rankRefundTargets(item, this.refundPool(this._items(), item.id));
    // Keep the current choice listed, even if it no longer fits, so the dropdown never lies.
    const current = item.refundFor && !options.some((o) => o.key === item.refundFor) ? this.describeTarget(item.refundFor) : null;
    return current ? [current, ...options] : options;
  }

  /** Chooses the purchase a refund belongs to, or `null` to leave it unmatched. */
  setRefundTarget(id: string, key: string | null): void {
    const target = key ? this.describeTarget(key) : null;
    this.patch(id, { refundFor: target?.key ?? null, ...(target ? { category: target.category } : {}) });
  }

  /**
   * Whether a waiting item can be approved: purchases always can; a refund needs a purchase chosen
   * (`choose`), and that purchase must be an expense or waiting here too (`waiting` if it was skipped).
   */
  refundState(item: InboxItem): 'ready' | 'choose' | 'waiting' {
    if (item.kind !== 'refund') return 'ready';
    if (!item.refundFor) return 'choose';
    if (this.findExpense(item.refundFor)) return 'ready';
    return this.toReview().some((i) => i.kind !== 'refund' && i.id === item.refundFor) ? 'ready' : 'waiting';
  }

  /** The purchase a refund is matched to, for showing it. */
  describeTarget(key: string): RankedTarget | null {
    const expense = this.findExpense(key);
    const item = expense ? null : this._items().find((i) => i.id === key && i.kind !== 'refund');
    if (!expense && !item) return null;
    return {
      key,
      date: (expense ?? item)!.date,
      remainingCents: expense ? cents(netAmount(expense)) : cents(item!.amount),
      description: expense ? expense.description : tidyDescription(item!.description),
      category: (expense ?? item)!.category,
      sameMerchant: false,
    };
  }

  /** Changes an item's category, remembers the choice for that merchant, and applies it to the rest. */
  setCategory(id: string, category: Category): void {
    const target = this._items().find((i) => i.id === id);
    if (!target) return;
    this.rules.learn(target.description, category);
    const key = merchantKey(target.description);
    this.commit(
      this._items().map((i) =>
        i.id === id || (i.status === 'new' && i.kind !== 'refund' && key !== '' && merchantKey(i.description) === key)
          ? { ...i, category }
          : i,
      ),
      this._seen(),
    );
  }

  skip(id: string): void {
    this.patch(id, { status: 'skipped', skipReason: 'manual' });
  }

  /**
   * Puts a skipped item back for review ("Import anyway" for a possible duplicate). Money in can
   * never be an expense, so a restored credit comes back as a refund to match to a purchase.
   */
  restore(id: string): void {
    const item = this._items().find((i) => i.id === id);
    if (!item) return;
    if (item.kind === 'credit') {
      const refund = this.asRefund(item, findRefundTarget(item, this.refundPool(this._items(), id)));
      this.patch(id, { ...refund, status: 'new', skipReason: null });
    } else {
      this.patch(id, { status: 'new', skipReason: null });
    }
  }

  /**
   * Approves items (all waiting ones by default): purchases become expenses, and refunds are
   * attached to their purchase. A refund whose purchase isn't an expense yet stays. Returns how many.
   */
  approve(ids?: readonly string[]): number {
    const chosen = this.toReview().filter((i) => !ids || ids.includes(i.id));
    if (chosen.length === 0) return 0;

    const purchases = chosen.filter((i) => i.kind !== 'refund');
    const inputs = purchases.map<ExpenseInput>((i) => ({
      date: i.date,
      amount: Math.abs(i.amount),
      category: i.category,
      description: tidyDescription(i.description).slice(0, 80),
      externalId: i.id,
      source: i.source,
    }));
    if (inputs.length > 0) this.expenses.addMany(inputs);

    // After the purchases, so a refund can go on one approved just now.
    const refunds = chosen.filter((i) => {
      const expense = i.kind === 'refund' && i.refundFor ? this.findExpense(i.refundFor) : undefined;
      return (
        !!expense &&
        this.expenses.addRefund(expense.id, {
          externalId: i.id,
          date: i.date,
          amount: Math.abs(i.amount),
          description: tidyDescription(i.description).slice(0, 80),
          source: i.source,
        })
      );
    });

    const approved = new Set([...purchases, ...refunds].map((i) => i.id));
    if (approved.size === 0) return 0;
    this.commit(
      this._items().filter((i) => !approved.has(i.id)),
      [...this._seen(), ...approved],
    );
    return approved.size;
  }

  /** Takes a refund off an expense and puts it back in the inbox, to match to a different purchase. */
  unlinkRefund(expenseId: string, refundId: string, now: number = Date.now()): boolean {
    const expense = this.expenses.expenses().find((e) => e.id === expenseId);
    const refund = this.expenses.removeRefund(expenseId, refundId);
    if (!expense || !refund) return false;
    const item: InboxItem = {
      id: refund.externalId,
      accountName: '',
      date: refund.date,
      amount: refund.amount,
      description: refund.description,
      pending: false,
      source: refund.source ?? 'csv',
      kind: 'refund',
      category: expense.category,
      status: 'new',
      skipReason: null,
      duplicateOf: null,
      refundFor: null,
      addedAt: now,
    };
    this.commit(
      [...this._items().filter((i) => i.id !== item.id), item],
      this._seen().filter((s) => s !== item.id),
    );
    return true;
  }

  /** Clears the "Skipped" list. They are remembered, so they won't reappear on the next sync. */
  discardSkipped(): number {
    const gone = this.skipped();
    if (gone.length === 0) return 0;
    this.commit(
      this._items().filter((i) => i.status !== 'skipped'),
      [...this._seen(), ...gone.map((i) => i.id)],
    );
    return gone.length;
  }

  /** How a skipped item is explained to the user. */
  describeSkip(item: InboxItem): string {
    switch (item.skipReason) {
      case 'credit':
        return 'Money in that doesn’t match a purchase (pay, a deposit, or an unmatched refund)';
      case 'transfer':
        return 'Looks like a transfer or card payment';
      case 'duplicate':
        return `Looks like ${item.duplicateOf ?? 'an entry you already have'}`;
      default:
        return 'Skipped by you';
    }
  }

  formatAmount(item: InboxItem): string {
    return formatCurrency(Math.abs(item.amount));
  }

  // ---- Refund matching ----
  private findExpense(key: string): Expense | undefined {
    return this.expenses.expenses().find((e) => expenseKey(e) === key);
  }

  private asRefund(item: InboxItem, target: RefundTarget | null): InboxItem {
    return {
      ...item,
      kind: 'refund',
      status: 'new',
      skipReason: null,
      refundFor: target?.key ?? null,
      category: target?.category ?? item.category,
    };
  }

  /**
   * Everything a refund could be for: expenses and purchases waiting for review, each with what is
   * left once refunds already on it or matched to it in the inbox (other than `except`) are counted.
   */
  private refundPool(items: readonly InboxItem[], except: string): RefundTarget[] {
    const claimed = new Map<string, number>();
    for (const i of items) {
      if (i.kind === 'refund' && i.refundFor && i.id !== except) {
        claimed.set(i.refundFor, (claimed.get(i.refundFor) ?? 0) + cents(i.amount));
      }
    }
    const left = (key: string, total: number) => total - (claimed.get(key) ?? 0);
    return [
      ...this.expenses.expenses().map<RefundTarget>((e) => ({
        key: expenseKey(e),
        date: e.date,
        remainingCents: left(expenseKey(e), cents(netAmount(e))),
        description: e.description,
        category: e.category,
      })),
      ...items
        .filter((i) => i.kind === 'expense' && i.status === 'new')
        .map<RefundTarget>((i) => ({
          key: i.id,
          date: i.date,
          remainingCents: left(i.id, cents(i.amount)),
          // As it will read once approved.
          description: tidyDescription(i.description),
          category: i.category,
        })),
    ];
  }

  // ---- Persistence ----
  private patch(id: string, patch: Partial<InboxItem>): void {
    this.commit(this._items().map((i) => (i.id === id ? { ...i, ...patch } : i)), this._seen());
  }

  private commit(items: InboxItem[], seen: string[]): void {
    this._items.set(items);
    this._seen.set(seen.slice(-SEEN_LIMIT));
    try {
      localStorage.setItem(INBOX_STORAGE_KEY, JSON.stringify({ items: this._items(), seen: this._seen() }));
      this.saveError.set(null);
    } catch {
      this.saveError.set('Your browser blocked saving the review inbox. It will be empty after a reload.');
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(INBOX_STORAGE_KEY);
      const data: unknown = raw ? JSON.parse(raw) : null;
      if (!isObject(data)) return;
      this._items.set(Array.isArray(data['items']) ? data['items'].map(parseItem).filter((i): i is InboxItem => i !== null) : []);
      this._seen.set(Array.isArray(data['seen']) ? data['seen'].filter((s): s is string => typeof s === 'string') : []);
    } catch {
      this._items.set([]);
      this._seen.set([]);
    }
  }
}
