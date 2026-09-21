import { Injectable, computed, inject, signal } from '@angular/core';
import { ExpenseStore } from '../../../core/expense-store';
import { parseCategory, type Category, type ExpenseInput } from '../../../core/models';
import { isValidISODate } from '../../../utils/dates';
import { formatCurrency } from '../../../utils/format';
import type { BankTransaction, InboxItem, SkipReason } from '../model/bank-transaction';
import { isTransferLike, merchantKey, tidyDescription } from '../utils/categorize';
import { findDuplicate, fromExpense, type Comparable } from '../utils/dedupe';
import { CategoryRules } from './category-rules';

export const INBOX_STORAGE_KEY = 'spendwise.bank.inbox.v1';
/** Ids of approved and discarded transactions are remembered so they never come back. */
const SEEN_LIMIT = 5000;

export interface AddResult {
  /** Waiting for your review. */
  added: number;
  /** Put straight into "Skipped": credits, transfers and possible duplicates. */
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
    !['expense', 'credit', 'transfer'].includes(String(value['kind'])) ||
    !['simplefin', 'csv'].includes(String(value['source']))
  ) {
    return null;
  }
  return { ...(value as unknown as InboxItem), category };
}

/**
 * The review inbox: transactions from a bank sync or a CSV file wait here until you approve them.
 * Approving turns them into expenses; skipping keeps them out for good.
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
      ...this.expenses.expenses().flatMap((e) => (e.externalId ? [e.externalId] : [])),
    ]);
    // What a new transaction could be a duplicate of: what was here before this batch.
    const pool: Comparable[] = [
      ...this.expenses.expenses().map(fromExpense),
      ...this._items().map<Comparable>((i) => ({
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
        addedAt: now,
      });
      skipReason ? result.autoSkipped++ : result.added++;
    }

    if (created.length > 0) this.commit([...this._items(), ...created], this._seen());
    return result;
  }

  /** Changes an item's category, remembers the choice for that merchant, and applies it to the rest. */
  setCategory(id: string, category: Category): void {
    const target = this._items().find((i) => i.id === id);
    if (!target) return;
    this.rules.learn(target.description, category);
    const key = merchantKey(target.description);
    this.commit(
      this._items().map((i) =>
        i.id === id || (i.status === 'new' && key !== '' && merchantKey(i.description) === key) ? { ...i, category } : i,
      ),
      this._seen(),
    );
  }

  skip(id: string): void {
    this.patch(id, { status: 'skipped', skipReason: 'manual' });
  }

  /** Puts a skipped item back for review ("Import anyway" for a possible duplicate). */
  restore(id: string): void {
    this.patch(id, { status: 'new', skipReason: null });
  }

  /** Approves items (all waiting ones by default) and turns them into expenses. Returns how many. */
  approve(ids?: readonly string[]): number {
    const chosen = this.toReview().filter((i) => !ids || ids.includes(i.id));
    if (chosen.length === 0) return 0;

    const inputs = chosen.map<ExpenseInput>((i) => ({
      date: i.date,
      amount: Math.abs(i.amount),
      category: i.category,
      description: tidyDescription(i.description).slice(0, 80),
      externalId: i.id,
      source: i.source,
    }));
    this.expenses.addMany(inputs);

    const approved = new Set(chosen.map((i) => i.id));
    this.commit(
      this._items().filter((i) => !approved.has(i.id)),
      [...this._seen(), ...approved],
    );
    return chosen.length;
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
        return 'Money in (a refund, deposit or payment received)';
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
