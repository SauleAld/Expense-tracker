import type { Deposit } from '../core/models';
import { formatCurrency } from './format';

export interface DepositFilters {
  search: string;
  /** Inclusive `YYYY-MM-DD` bounds; empty string means unbounded. */
  from: string;
  to: string;
}

/** Matching deposits, newest first. */
export function filterDeposits(deposits: readonly Deposit[], filters: DepositFilters): Deposit[] {
  const query = filters.search.trim().toLowerCase();
  return deposits
    .filter((d) => {
      if (filters.from && d.date < filters.from) return false;
      if (filters.to && d.date > filters.to) return false;
      if (query) {
        const haystack = `${d.description} ${d.accountName} ${d.amount.toFixed(2)} ${formatCurrency(d.amount)}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}

/** Sums in integer cents so float drift never reaches the UI. */
export function sumDeposits(deposits: readonly Deposit[]): number {
  return deposits.reduce((sum, d) => sum + Math.round(d.amount * 100), 0) / 100;
}
