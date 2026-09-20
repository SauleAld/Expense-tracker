import type { Expense } from '../../core/models';
import { sumAmounts } from '../../utils/analytics';
import type { ExportMeta } from './export-types';

/**
 * JSON export with a small envelope so the file describes itself.
 * `limit` truncates only the `expenses` array (for previews); the summary always covers every row.
 */
export function buildJson(expenses: readonly Expense[], meta: ExportMeta, limit = expenses.length): string {
  const { filters, exportedAt } = meta;
  return JSON.stringify(
    {
      app: 'Spendwise',
      exportedAt: exportedAt.toISOString(),
      filters: {
        from: filters.from || null,
        to: filters.to || null,
        categories: filters.categories,
      },
      summary: { count: expenses.length, total: sumAmounts(expenses) },
      expenses: expenses.slice(0, limit).map((e) => ({
        id: e.id,
        date: e.date,
        category: e.category,
        amount: e.amount,
        description: e.description,
      })),
    },
    null,
    2,
  );
}
