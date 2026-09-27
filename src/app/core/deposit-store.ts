import { Injectable, computed, signal } from '@angular/core';
import { isValidISODate } from '../utils/dates';
import type { Deposit, DepositInput } from './models';

export const DEPOSITS_STORAGE_KEY = 'spendwise.deposits.v1';

const roundCents = (amount: number) => Math.round(amount * 100) / 100;

function newId(): string {
  // randomUUID needs a secure context; fall back for plain-http LAN testing.
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function parseDeposit(value: unknown): Deposit | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (
    typeof v['id'] !== 'string' ||
    typeof v['date'] !== 'string' ||
    !isValidISODate(v['date']) ||
    typeof v['amount'] !== 'number' ||
    !Number.isFinite(v['amount']) ||
    v['amount'] <= 0 ||
    typeof v['description'] !== 'string' ||
    typeof v['externalId'] !== 'string' ||
    !v['externalId'] ||
    (v['source'] !== 'simplefin' && v['source'] !== 'csv')
  ) {
    return null;
  }
  return {
    id: v['id'],
    date: v['date'],
    amount: roundCents(v['amount']),
    description: v['description'],
    accountName: typeof v['accountName'] === 'string' ? v['accountName'] : '',
    createdAt: typeof v['createdAt'] === 'number' ? v['createdAt'] : Date.now(),
    externalId: v['externalId'],
    source: v['source'],
  };
}

/**
 * Deposits approved from the bank. State lives in a signal and is mirrored to localStorage after
 * every change, like expenses.
 */
@Injectable({ providedIn: 'root' })
export class DepositStore {
  private readonly _deposits = signal<Deposit[]>([]);

  readonly deposits = this._deposits.asReadonly();
  readonly count = computed(() => this._deposits().length);
  readonly saveError = signal<string | null>(null);

  constructor() {
    this.load();
    // Keep multiple tabs in sync.
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key === DEPOSITS_STORAGE_KEY || event.key === null) this.load();
    });
  }

  addMany(inputs: readonly DepositInput[]): void {
    const now = Date.now();
    const created = inputs.map<Deposit>((input, i) => ({
      ...input,
      description: input.description.trim(),
      amount: roundCents(Math.abs(input.amount)),
      id: newId(),
      createdAt: now + i,
    }));
    this.commit([...this._deposits(), ...created]);
  }

  remove(id: string): Deposit | undefined {
    const removed = this._deposits().find((d) => d.id === id);
    if (removed) this.commit(this._deposits().filter((d) => d.id !== id));
    return removed;
  }

  /** Puts a previously removed deposit back (used by "Undo"). */
  restore(deposit: Deposit): void {
    if (this._deposits().some((d) => d.id === deposit.id)) return;
    this.commit([...this._deposits(), deposit]);
  }

  private commit(next: Deposit[]): void {
    this._deposits.set(next);
    try {
      localStorage.setItem(DEPOSITS_STORAGE_KEY, JSON.stringify(next));
      this.saveError.set(null);
    } catch {
      this.saveError.set('Your browser blocked saving deposits. Changes are kept for this session but will be lost on reload.');
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(DEPOSITS_STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      this._deposits.set(Array.isArray(parsed) ? parsed.map(parseDeposit).filter((d): d is Deposit => d !== null) : []);
    } catch {
      this._deposits.set([]);
    }
  }
}
