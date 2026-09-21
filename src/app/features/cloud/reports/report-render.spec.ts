import { makeExpense } from '../../../utils/test-helpers';
import { DEFAULT_PARAMS, buildReport } from './report-builders';
import { formatCell, renderReport, reportToCsv, reportToJson } from './report-render';
import type { Report } from './report-types';

const NOW = new Date(2026, 8, 20, 12, 0);
const data = [
  makeExpense({ date: '2026-09-01', amount: 1450, category: 'Bills', description: 'Rent, "big" one' }),
  makeExpense({ date: '2026-09-02', amount: 30, category: 'Food', description: '=SUM(A1)' }),
];
const ledger = buildReport('ledger', data, DEFAULT_PARAMS(NOW), NOW);
const tax = buildReport('tax', data, { ...DEFAULT_PARAMS(NOW), year: 2026 }, NOW);

describe('formatCell', () => {
  it('formats each kind for display', () => {
    expect(formatCell(1234.5, 'currency')).toBe('$1,234.50');
    expect(formatCell(1234, 'int')).toBe('1,234');
    expect(formatCell('2026-09-01', 'date')).toBe('Sep 1, 2026');
    expect(formatCell(0.256, 'percent')).toBe('26%');
    expect(formatCell(0.001, 'percent')).toBe('<1%');
    expect(formatCell(0.12, 'change')).toBe('+12%');
    expect(formatCell(-0.08, 'change')).toBe('-8%');
    expect(formatCell(0, 'change')).toBe('0%');
    expect(formatCell(null, 'text')).toBe('—');
    expect(formatCell('Food', 'text')).toBe('Food');
  });
});

describe('reportToCsv', () => {
  it('writes a header and one CRLF row per non-group row, with escaping and formula safety', () => {
    const lines = reportToCsv(ledger).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Date,Category,Amount,Description');
    expect(lines[1]).toBe('2026-09-02,Food,30.00,\'=SUM(A1)');
    expect(lines[2]).toBe('2026-09-01,Bills,1450.00,"Rent, ""big"" one"');
    expect(lines.at(-1)).toBe(',,1480.00,2 expenses');
  });

  it('skips group headings but keeps subtotals and totals', () => {
    const lines = reportToCsv(tax).trimEnd().split('\r\n');
    expect(lines.some((l) => l.startsWith('Bills,,'))).toBe(false);
    expect(lines.some((l) => l.includes('Subtotal · Bills'))).toBe(true);
    expect(lines.at(-1)).toBe(',,Total 2026,1480.00');
  });

  it('labels percentage columns and writes them as percent numbers', () => {
    const report: Report = {
      ...ledger,
      columns: [
        { label: 'Share', format: 'percent' },
        { label: 'Change', format: 'change' },
      ],
      rows: [{ kind: 'data', cells: [0.256, -0.05] }],
    };
    expect(reportToCsv(report)).toBe('Share (%),Change (%)\r\n25.6,-5.0\r\n');
  });
});

describe('reportToJson', () => {
  it('describes itself and keys each row by column label', () => {
    const json = JSON.parse(reportToJson(ledger, NOW));
    expect(json.app).toBe('Spendwise');
    expect(json.report).toMatchObject({ title: 'Full Ledger', recordCount: 2, total: 1480 });
    expect(json.columns).toEqual(['Date', 'Category', 'Amount', 'Description']);
    expect(json.rows[0]).toEqual({ type: 'data', values: { Date: '2026-09-02', Category: 'Food', Amount: 30, Description: '=SUM(A1)' } });
    expect(json.rows.at(-1).type).toBe('total');
  });

  it('leaves group headings out', () => {
    expect(JSON.parse(reportToJson(tax, NOW)).rows.some((r: { type: string }) => r.type === 'group')).toBe(false);
  });
});

describe('renderReport', () => {
  it('produces a CSV blob starting with a UTF-8 BOM', async () => {
    const bytes = new Uint8Array(await (await renderReport('csv', ledger, NOW)).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('produces JSON and PDF blobs', async () => {
    expect((await renderReport('json', ledger, NOW)).type).toBe('application/json');
    const pdf = await renderReport('pdf', tax, NOW);
    expect(pdf.type).toBe('application/pdf');
    expect(new TextDecoder('latin1').decode(await pdf.arrayBuffer()).startsWith('%PDF-')).toBe(true);
  });
});
