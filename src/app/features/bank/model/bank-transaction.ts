import type { Category } from '../../../core/models';

export type TransactionSource = 'simplefin' | 'csv';

/** A transaction as the bank reports it. `amount` is signed: negative is money out. */
export interface BankTransaction {
  /** Stable id from the source, used to recognise the same transaction on a later sync or import. */
  id: string;
  accountName: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  amount: number;
  description: string;
  pending: boolean;
  source: TransactionSource;
}

/** `refund` is money in that belongs to a purchase; `credit` is any other money in (pay, deposits). */
export type ItemKind = 'expense' | 'refund' | 'credit' | 'transfer';
export type ItemStatus = 'new' | 'skipped';
export type SkipReason = 'credit' | 'transfer' | 'duplicate' | 'manual';

/** A transaction waiting in the review inbox. Approved items leave the inbox and become expenses, or refunds on one. */
export interface InboxItem extends BankTransaction {
  kind: ItemKind;
  category: Category;
  status: ItemStatus;
  skipReason: SkipReason | null;
  /** Description of the existing entry this looks like, when `skipReason` is `duplicate`. */
  duplicateOf: string | null;
  /** For a refund: the key of the purchase it gives money back for (see `RefundTarget`), or null until chosen. */
  refundFor: string | null;
  addedAt: number;
}
