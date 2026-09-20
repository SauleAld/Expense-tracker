import { CATEGORIES } from '../../core/models';
import { makeExpense } from '../../utils/test-helpers';
import { buildJson } from './export-formatters';

const meta = {
  filters: { from: '2026-09-01', to: '', categories: CATEGORIES },
  exportedAt: new Date('2026-09-20T12:00:00Z'),
};

describe('buildJson', () => {
  const rows = [
    makeExpense({ id: 'a', date: '2026-09-02', amount: 10.1, category: 'Food', description: 'Lunch' }),
    makeExpense({ id: 'b', date: '2026-09-03', amount: 0.2, category: 'Bills', description: 'Fee "quoted"' }),
  ];

  it('produces a self-describing envelope', () => {
    const parsed = JSON.parse(buildJson(rows, meta));
    expect(parsed.app).toBe('Spendwise');
    expect(parsed.exportedAt).toBe('2026-09-20T12:00:00.000Z');
    expect(parsed.filters).toEqual({ from: '2026-09-01', to: null, categories: [...CATEGORIES] });
    expect(parsed.summary).toEqual({ count: 2, total: 10.3 });
  });

  it('lists expenses with exactly the exported fields', () => {
    const parsed = JSON.parse(buildJson(rows, meta));
    expect(parsed.expenses[1]).toEqual({ id: 'b', date: '2026-09-03', category: 'Bills', amount: 0.2, description: 'Fee "quoted"' });
    expect(Object.keys(parsed.expenses[0])).not.toContain('createdAt');
  });

  it('truncates only the list when a limit is given, never the summary', () => {
    const parsed = JSON.parse(buildJson(rows, meta, 1));
    expect(parsed.expenses).toHaveLength(1);
    expect(parsed.summary.count).toBe(2);
  });

  it('is valid JSON for an empty selection', () => {
    expect(JSON.parse(buildJson([], meta)).expenses).toEqual([]);
  });
});
