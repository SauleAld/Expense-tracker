import { Injectable, computed, signal } from '@angular/core';
import { isValidISODate } from '../utils/dates';
import { isRenamedCategory, parseCategory, type Expense, type ExpenseInput, type Refund } from './models';

export const EXPENSES_STORAGE_KEY = 'spendwise.expenses.v1';
const BACKUP_KEY = `${EXPENSES_STORAGE_KEY}.corrupt-backup`;

const roundCents = (amount: number) => Math.round(amount * 100) / 100;

function newId(): string {
  // randomUUID needs a secure context; fall back for plain-http LAN testing.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseRefund(value: unknown): Refund | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['externalId'] !== 'string' ||
    !v['externalId'] ||
    typeof v['date'] !== 'string' ||
    !isValidISODate(v['date']) ||
    typeof v['amount'] !== 'number' ||
    !Number.isFinite(v['amount']) ||
    v['amount'] <= 0 ||
    typeof v['description'] !== 'string'
  ) {
    return null;
  }
  return {
    externalId: v['externalId'],
    date: v['date'],
    amount: roundCents(v['amount']),
    description: v['description'],
    ...(v['source'] === 'simplefin' || v['source'] === 'csv' ? { source: v['source'] } : {}),
  };
}

function parseExpense(value: unknown): Expense | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const category = parseCategory(v['category']);
  const refunds = Array.isArray(v['refunds'])
    ? v['refunds'].map(parseRefund).filter((r): r is Refund => r !== null)
    : [];
  if (
    typeof v['id'] !== 'string' ||
    typeof v['date'] !== 'string' ||
    !isValidISODate(v['date']) ||
    typeof v['amount'] !== 'number' ||
    !Number.isFinite(v['amount']) ||
    v['amount'] < 0 ||
    category === null ||
    typeof v['description'] !== 'string'
  ) {
    return null;
  }
  return {
    id: v['id'],
    date: v['date'],
    amount: roundCents(v['amount']),
    category,
    description: v['description'],
    createdAt: typeof v['createdAt'] === 'number' ? v['createdAt'] : Date.now(),
    ...(typeof v['externalId'] === 'string' && v['externalId'] ? { externalId: v['externalId'] } : {}),
    ...(v['source'] === 'simplefin' || v['source'] === 'csv' ? { source: v['source'] } : {}),
    ...(refunds.length > 0 ? { refunds } : {}),
  };
}

/**
 * Single source of truth for expenses. State lives in a signal and is mirrored
 * to localStorage after every mutation.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseStore {
  private readonly _expenses = signal<Expense[]>([]);

  readonly expenses = this._expenses.asReadonly();
  readonly count = computed(() => this._expenses().length);

  /** Set when stored data was unreadable or partly skipped on load. */
  readonly loadError = signal<string | null>(null);
  /** Set when the browser refused a write (quota, private mode, storage disabled). */
  readonly saveError = signal<string | null>(null);

  constructor() {
    this.load();
    // Keep multiple tabs in sync.
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key === EXPENSES_STORAGE_KEY || event.key === null) this.load();
    });
  }

  add(input: ExpenseInput): Expense {
    const expense: Expense = {
      ...input,
      description: input.description.trim(),
      amount: roundCents(input.amount),
      id: newId(),
      createdAt: Date.now(),
    };
    this.commit([...this._expenses(), expense]);
    return expense;
  }

  addMany(inputs: readonly ExpenseInput[]): void {
    const now = Date.now();
    const created = inputs.map<Expense>((input, i) => ({
      ...input,
      description: input.description.trim(),
      amount: roundCents(input.amount),
      id: newId(),
      createdAt: now + i,
    }));
    this.commit([...this._expenses(), ...created]);
  }

  update(id: string, input: ExpenseInput): boolean {
    const current = this._expenses();
    if (!current.some((e) => e.id === id)) return false;
    this.commit(
      current.map((e) =>
        e.id === id
          ? { ...e, ...input, description: input.description.trim(), amount: roundCents(input.amount) }
          : e,
      ),
    );
    return true;
  }

  remove(id: string): Expense | undefined {
    const removed = this._expenses().find((e) => e.id === id);
    if (removed) this.commit(this._expenses().filter((e) => e.id !== id));
    return removed;
  }

  /** Attaches a refund to an expense, which then counts for less. */
  addRefund(id: string, refund: Refund): boolean {
    const current = this._expenses();
    if (!current.some((e) => e.id === id)) return false;
    const clean = { ...refund, amount: roundCents(refund.amount) };
    this.commit(current.map((e) => (e.id === id ? { ...e, refunds: [...(e.refunds ?? []), clean] } : e)));
    return true;
  }

  /** Detaches a refund from an expense and returns it. */
  removeRefund(id: string, refundId: string): Refund | undefined {
    const expense = this._expenses().find((e) => e.id === id);
    const refund = expense?.refunds?.find((r) => r.externalId === refundId);
    if (!expense || !refund) return undefined;
    const rest = expense.refunds!.filter((r) => r !== refund);
    this.commit(
      this._expenses().map((e) => {
        if (e.id !== id) return e;
        const { refunds: _, ...plain } = e;
        return rest.length > 0 ? { ...plain, refunds: rest } : plain;
      }),
    );
    return refund;
  }

  /** Puts a previously removed expense back (used by "Undo"). */
  restore(expense: Expense): void {
    if (this._expenses().some((e) => e.id === expense.id)) return;
    this.commit([...this._expenses(), expense]);
  }

  clear(): void {
    this.commit([]);
  }

  private commit(next: Expense[]): void {
    this._expenses.set(next);
    this.persist(next);
  }

  private persist(expenses: Expense[]): void {
    try {
      localStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(expenses));
      this.saveError.set(null);
    } catch {
      this.saveError.set(
        'Your browser blocked saving. Changes are kept for this session but will be lost on reload.',
      );
    }
  }

  private load(): void {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(EXPENSES_STORAGE_KEY);
      if (raw === null) {
        this._expenses.set([]);
        return;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('Expected an array');

      const valid = parsed.map(parseExpense).filter((e): e is Expense => e !== null);
      this._expenses.set(valid);
      // Data saved under an old category name is stored again under the new one, once.
      const migrated = parsed.some((e) => typeof e === 'object' && e !== null && isRenamedCategory((e as Record<string, unknown>)['category']));
      if (migrated) this.persist(valid);
      const skipped = parsed.length - valid.length;
      this.loadError.set(
        skipped > 0
          ? `${skipped} saved ${skipped === 1 ? 'entry was' : 'entries were'} unreadable and skipped.`
          : null,
      );
    } catch {
      this._expenses.set([]);
      this.loadError.set(
        'Saved data could not be read, so the app started empty. A copy of the original was kept in your browser storage.',
      );
      try {
        if (raw !== null) localStorage.setItem(BACKUP_KEY, raw);
      } catch {
        // Nothing more we can do.
      }
    }
  }
}
