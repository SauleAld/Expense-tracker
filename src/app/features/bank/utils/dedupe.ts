import type { Expense } from '../../../core/models';
import { parseISODate } from '../../../utils/dates';
import { formatCurrency } from '../../../utils/format';

/** Something a new transaction might duplicate: an existing expense or an item already in the inbox. */
export interface Comparable {
  /** The bank id if it has one, otherwise the record's own id. */
  key: string;
  date: string;
  cents: number;
  label: string;
  /** Where it came from. Missing for something typed in by hand. */
  source?: string;
}

const DAY = 86_400_000;

export function fromExpense(expense: Expense): Comparable {
  return {
    key: expense.externalId ?? expense.id,
    date: expense.date,
    cents: Math.round(expense.amount * 100),
    label: `${expense.description} · ${formatCurrency(expense.amount)}`,
    source: expense.source,
  };
}

/**
 * A "possible duplicate": the same amount within a day of a record from a *different* source
 * (something typed by hand, or the same purchase arriving by CSV and by sync). Banks post a day or
 * two after you enter something, so the date can differ slightly.
 *
 * Two records from the same source never count: each has its own id from the bank, so two $5
 * coffees on one day are two purchases. Anything flagged is held for review, never dropped.
 */
export function findDuplicate(
  tx: { id: string; date: string; amount: number; source?: string },
  pool: readonly Comparable[],
): Comparable | null {
  const cents = Math.round(Math.abs(tx.amount) * 100);
  const day = parseISODate(tx.date).getTime();
  let best: { item: Comparable; gap: number } | null = null;
  for (const item of pool) {
    if (item.key === tx.id || item.cents !== cents) continue;
    if (item.source && item.source === tx.source) continue;
    const gap = Math.abs(Math.round((parseISODate(item.date).getTime() - day) / DAY));
    if (gap <= 1 && (!best || gap < best.gap)) best = { item, gap };
  }
  return best?.item ?? null;
}
