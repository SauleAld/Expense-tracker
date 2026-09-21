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

export type ItemKind = 'expense' | 'credit' | 'transfer';
export type ItemStatus = 'new' | 'skipped';
export type SkipReason = 'credit' | 'transfer' | 'duplicate' | 'manual';

/** A transaction waiting in the review inbox. Approved items leave the inbox and become expenses. */
export interface InboxItem extends BankTransaction {
  kind: ItemKind;
  category: Category;
  status: ItemStatus;
  skipReason: SkipReason | null;
  /** Description of the existing entry this looks like, when `skipReason` is `duplicate`. */
  duplicateOf: string | null;
  addedAt: number;
}
