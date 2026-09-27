import { buildCsv } from './csv';
import { makeExpense } from './test-helpers';

describe('buildCsv', () => {
  it('writes a header and one CRLF-terminated row per expense', () => {
    const csv = buildCsv([makeExpense({ date: '2026-09-01', description: 'Rent', category: 'Bills', amount: 1450 })]);
    expect(csv).toBe('Date,Description,Category,Amount,Refunded\r\n2026-09-01,Rent,Bills,1450.00,0.00\r\n');
  });

  it('quotes cells containing commas, quotes and newlines', () => {
    const csv = buildCsv([makeExpense({ description: 'Lunch, "big" one\nwith friends' })]);
    expect(csv).toContain('"Lunch, ""big"" one\nwith friends"');
  });

  it('neutralises spreadsheet formula injection', () => {
    const csv = buildCsv([
      makeExpense({ description: '=HYPERLINK("http://evil")' }),
      makeExpense({ description: '@SUM(A1)' }),
      makeExpense({ description: '-2+3' }),
    ]);
    const rows = csv.trim().split('\r\n').slice(1);
    expect(rows[0]).toContain(`'=HYPERLINK`);
    expect(rows[1]).toContain(`,'@SUM(A1),`);
    expect(rows[2]).toContain(`,'-2+3,`);
  });

  it('always uses two decimals for amounts', () => {
    expect(buildCsv([makeExpense({ amount: 3.5 })])).toContain(',3.50,0.00\r\n');
  });

  it('adds up refunds in their own column, leaving the original amount alone', () => {
    const refund = { externalId: 'r', date: '2026-09-05', amount: 20, description: 'Refund' };
    const csv = buildCsv([makeExpense({ amount: 50, refunds: [refund, { ...refund, externalId: 'r2', amount: 5.5 }] })]);
    expect(csv).toContain(',50.00,25.50\r\n');
  });

  it('returns only the header for an empty list', () => {
    expect(buildCsv([])).toBe('Date,Description,Category,Amount,Refunded\r\n');
  });
});
