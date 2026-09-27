import type { Category } from '../../../core/models';
import { parseISODate } from '../../../utils/dates';
import { merchantKey } from './categorize';

/** Words banks put on money given back for a purchase. */
const REFUND_WORDS =
  /\b(REFUNDS?|RETURNS?|RETURNED|REVERSALS?|REVERSED|CHARGEBACK|CREDIT VOUCHER|MERCHANDISE CREDIT|PURCHASE CREDIT|ADJUSTMENT)\b/gi;

export const isRefundLike = (description: string): boolean => new RegExp(REFUND_WORDS.source, 'i').test(description);

/** The merchant behind a refund: "REFUND - TARGET 00012" is "TARGET". */
export const refundMerchantKey = (description: string): string => merchantKey(description.replace(REFUND_WORDS, ' '));

/** A purchase a refund could belong to: an expense, or a purchase still waiting in the review inbox. */
export interface RefundTarget {
  /** The bank id if it has one, otherwise the expense's own id. Stays the same once an inbox item is approved. */
  key: string;
  date: string;
  /** What is still left to refund, in cents. */
  remainingCents: number;
  description: string;
  category: Category;
}

export interface RankedTarget extends RefundTarget {
  /** Same merchant as the refund, so it can be matched without asking. */
  sameMerchant: boolean;
}

const DAY = 86_400_000;
/** Refunds rarely come more than a few months after the purchase. */
const WINDOW_DAYS = 180;
const MAX_OPTIONS = 20;

function sameMerchant(a: string, b: string): boolean {
  if (!a || !b) return false;
  // "AMAZON COM" and "AMAZON MKTPLACE" are the same shop; compare the first word.
  return a === b || a.split(' ')[0] === b.split(' ')[0];
}

/**
 * Purchases a refund could be for, best first: bought on or before the refund date (within a
 * few months) and big enough to cover it. The same merchant ranks first, then an exact amount,
 * then the most recent purchase.
 */
export function rankRefundTargets(
  refund: { date: string; amount: number; description: string },
  pool: readonly RefundTarget[],
): RankedTarget[] {
  const cents = Math.round(Math.abs(refund.amount) * 100);
  const day = parseISODate(refund.date).getTime();
  const merchant = refundMerchantKey(refund.description);
  return pool
    .map((t) => ({ t, gap: Math.round((day - parseISODate(t.date).getTime()) / DAY) }))
    .filter(({ t, gap }) => gap >= 0 && gap <= WINDOW_DAYS && t.remainingCents >= cents)
    .map(({ t, gap }) => ({
      target: { ...t, sameMerchant: sameMerchant(merchant, merchantKey(t.description)) },
      exact: t.remainingCents === cents,
      gap,
    }))
    .sort(
      (a, b) =>
        Number(b.target.sameMerchant) - Number(a.target.sameMerchant) ||
        Number(b.exact) - Number(a.exact) ||
        a.gap - b.gap,
    )
    .slice(0, MAX_OPTIONS)
    .map((r) => r.target);
}

/** The purchase a refund is for, when it is clear enough to match without asking: the best one from the same merchant. */
export function findRefundTarget(
  refund: { date: string; amount: number; description: string },
  pool: readonly RefundTarget[],
): RankedTarget | null {
  const best = rankRefundTargets(refund, pool)[0];
  return best?.sameMerchant ? best : null;
}
