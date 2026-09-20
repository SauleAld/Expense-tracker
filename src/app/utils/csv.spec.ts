import { buildCsv } from './csv';
import { makeExpense } from './test-helpers';

describe('buildCsv', () => {
  it('writes a header and one CRLF-terminated row per expense', () => {
    const csv = buildCsv([makeExpense({ date: '2026-09-01', description: 'Rent', category: 'Bills', amount: 1450 })]);
    expect(csv).toBe('Date,Category,Amount,Description\r\n2026-09-01,Bills,1450.00,Rent\r\n');
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
    expect(rows[1]).toMatch(/,'@SUM\(A1\)$/);
    expect(rows[2]).toMatch(/,'-2\+3$/);
  });

  it('always uses two decimals for amounts', () => {
    expect(buildCsv([makeExpense({ amount: 3.5 })])).toContain(',3.50,');
  });

  it('returns only the header for an empty list', () => {
    expect(buildCsv([])).toBe('Date,Category,Amount,Description\r\n');
  });
});
