export const CATEGORIES = [
  'Food',
  'Transportation',
  'Entertainment',
  'Shopping',
  'Bills',
  'Other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export interface Expense {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Dollars, at most two decimal places. */
  amount: number;
  category: Category;
  description: string;
  createdAt: number;
}

export type ExpenseInput = Pick<Expense, 'date' | 'amount' | 'category' | 'description'>;

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/** Categories keep a fixed color slot (see `--cat-N` in styles.css), never assigned by rank. */
export function categoryColor(category: Category): string {
  return `var(--cat-${CATEGORIES.indexOf(category) + 1})`;
}
