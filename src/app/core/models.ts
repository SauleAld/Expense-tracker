/**
 * Related categories sit next to each other, because the order is also the stacking order in charts
 * (see `categoryColor`).
 */
export const CATEGORIES = [
  'Groceries',
  'Dining',
  'Transportation',
  'Travel',
  'Entertainment',
  'Subscriptions',
  'Shopping',
  'Home Improvement',
  'Bills',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** Where an imported expense came from. Manually entered expenses have no source. */
export type ExpenseSource = 'simplefin' | 'csv';

/** Money the merchant gave back for an expense. It stays attached to that expense and lowers what it counts for. */
export interface Refund {
  /** The bank's transaction id for the refund, so a re-sync never adds it twice. */
  externalId: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Dollars, positive. */
  amount: number;
  description: string;
  source?: ExpenseSource;
}

export interface Expense {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Dollars, at most two decimal places. */
  amount: number;
  category: Category;
  description: string;
  createdAt: number;
  /** The bank's transaction id, set on imported expenses so a re-sync never adds them twice. */
  externalId?: string;
  source?: ExpenseSource;
  /** Refunds matched to this expense. */
  refunds?: Refund[];
}

export type ExpenseInput = Pick<Expense, 'date' | 'amount' | 'category' | 'description'> &
  Partial<Pick<Expense, 'externalId' | 'source'>>;

/** How much of an expense has been refunded, in dollars. */
export function refundedAmount(expense: Pick<Expense, 'refunds'>): number {
  return (expense.refunds ?? []).reduce((sum, r) => sum + Math.round(r.amount * 100), 0) / 100;
}

/** What an expense really cost after refunds; never below zero. This is what totals and charts count. */
export function netAmount(expense: Pick<Expense, 'amount' | 'refunds'>): number {
  if (!expense.refunds?.length) return expense.amount;
  return Math.max(0, Math.round(expense.amount * 100) - Math.round(refundedAmount(expense) * 100)) / 100;
}

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Categories that were renamed, and what they became. Saved data written before a rename is migrated on load. */
export const RENAMED_CATEGORIES: Readonly<Record<string, Category>> = { Food: 'Groceries' };

export function isRenamedCategory(value: unknown): boolean {
  return typeof value === 'string' && Object.hasOwn(RENAMED_CATEGORIES, value);
}

/** Like `isCategory`, but also understands renamed categories, so old saved data is kept rather than dropped. */
export function parseCategory(value: unknown): Category | null {
  if (isCategory(value)) return value;
  return isRenamedCategory(value) ? RENAMED_CATEGORIES[value as string]! : null;
}

/**
 * Chart colors come from a palette checked to stay distinguishable (including for color-blind viewers),
 * which only holds for a handful of hues. So related categories share a color family and are told apart
 * by name: legends, tooltips and labels always say which one it is. The differing neighbours in
 * `CATEGORIES` are the palette's own validated adjacent pairs.
 */
const COLOR_SLOT: Record<Category, 1 | 2 | 3 | 4 | 5 | 6> = {
  Groceries: 1,
  Dining: 1,
  Transportation: 2,
  Travel: 2,
  Entertainment: 3,
  Subscriptions: 3,
  Shopping: 4,
  'Home Improvement': 4,
  Bills: 5,
  Other: 6,
};

/** Each category keeps a fixed color (`--cat-N` in styles.css), never one assigned by rank. */
export function categoryColor(category: Category): string {
  return `var(--cat-${COLOR_SLOT[category]})`;
}
