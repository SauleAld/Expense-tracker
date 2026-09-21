import { parseCsv } from './csv-parse';
import { detectCsv, guessSpendingSign, parseAmount, parseDate, rawAmounts, toTransactions } from './csv-columns';

describe('parseDate', () => {
  it.each([
    ['2026-09-01', 'mdy', '2026-09-01'],
    ['2026/9/1', 'mdy', '2026-09-01'],
    ['2026-09-01 12:30:00', 'mdy', '2026-09-01'],
    ['9/1/2026', 'mdy', '2026-09-01'],
    ['09-01-26', 'mdy', '2026-09-01'],
    ['25/12/2026', 'dmy', '2026-12-25'],
    ['01/09/2026', 'dmy', '2026-09-01'],
  ] as const)('%s (%s) -> %s', (text, format, expected) => expect(parseDate(text, format)).toBe(expected));

  it.each(['', 'yesterday', '13/45/2026', '02/30/2026', 'Date'])('rejects %j', (text) => {
    expect(parseDate(text, 'mdy')).toBeNull();
  });
});

describe('parseAmount', () => {
  it.each([
    ['12.34', 12.34],
    ['-12.34', -12.34],
    ['+5', 5],
    ['$1,234.50', 1234.5],
    ['(12.34)', -12.34],
    ['12.34-', -12.34],
    [' -$3.00 ', -3],
    ['1,000', 1000],
  ])('%s -> %s', (text, expected) => expect(parseAmount(text)).toBe(expected));

  it('understands a typographic minus sign', () => {
    expect(parseAmount(String.fromCharCode(0x2212) + '7.50')).toBe(-7.5);
  });

  it.each(['', '  ', 'abc', '1.2.3', '12,34.5x', '*'])('rejects %j', (text) => {
    expect(parseAmount(text)).toBeNull();
  });
});

describe('guessSpendingSign', () => {
  it('uses the more common sign, since refunds and payments are the minority', () => {
    expect(guessSpendingSign([-10, -20, -5, 100])).toBe('negative');
    expect(guessSpendingSign([10, 20, 5, -100])).toBe('positive');
    expect(guessSpendingSign([])).toBe('negative');
  });
});

describe('detectCsv on real bank layouts', () => {
  it('Chase-style: picks Transaction Date (not Post Date), Description and Amount', () => {
    const rows = parseCsv(
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n09/01/2026,09/02/2026,TRADER JOES #123,Groceries,Sale,-45.20,\n09/03/2026,09/03/2026,PAYMENT THANK YOU,,Payment,500.00,\n',
    );
    const d = detectCsv(rows);
    expect(d.hasHeader).toBe(true);
    expect(d.columns).toEqual({ date: 0, description: 2, amount: 5, debit: null, credit: null });
    expect(d.dateFormat).toBe('mdy');
  });

  it('Bank of America-style: uses Amount, not the running balance', () => {
    const rows = parseCsv('Date,Description,Amount,Running Bal.\n09/01/2026,"CHECKCARD SHELL OIL",-40.00,1200.50\n');
    expect(detectCsv(rows).columns).toMatchObject({ date: 0, description: 1, amount: 2 });
  });

  it('Wells Fargo-style with no header: works it out from the values', () => {
    const rows = parseCsv('"09/01/2026","-45.20","*","","PURCHASE TRADER JOES #123 SF"\n"09/02/2026","-12.00","*","","STARBUCKS #55"\n');
    const d = detectCsv(rows);
    expect(d.hasHeader).toBe(false);
    expect(d.columns).toEqual({ date: 0, description: 4, amount: 1, debit: null, credit: null });
  });

  it('separate Debit and Credit columns', () => {
    const rows = parseCsv('Date,Description,Debit,Credit,Balance\n2026-09-01,Rent,1450.00,,500.00\n2026-09-02,Paycheck,,2000.00,2500.00\n');
    const d = detectCsv(rows);
    expect(d.columns).toEqual({ date: 0, description: 1, amount: null, debit: 2, credit: 3 });
    expect(d.dateFormat).toBe('iso');
  });

  it('day-first dates are recognised when a day is above 12', () => {
    const rows = parseCsv('Date,Description,Amount\n25/12/2026,Gift,-30.00\n03/01/2026,Coffee,-4.50\n');
    expect(detectCsv(rows).dateFormat).toBe('dmy');
  });

  it('gives up cleanly (null columns) when nothing looks like a transaction file', () => {
    expect(detectCsv(parseCsv('hello,world\nfoo,bar\n')).columns).toBeNull();
    expect(detectCsv([]).columns).toBeNull();
  });
});

describe('toTransactions', () => {
  const chase = parseCsv(
    'Transaction Date,Post Date,Description,Category,Type,Amount,Memo\n09/01/2026,09/02/2026,  TRADER   JOES #123 ,Groceries,Sale,-45.20,\n09/03/2026,09/03/2026,PAYMENT THANK YOU,,Payment,500.00,\n\nTotals,,,,,454.80,\n',
  );

  it('normalises to negative = money out, tidies descriptions and skips non-transaction rows', () => {
    const d = detectCsv(chase);
    const { transactions, skippedRows } = toTransactions(chase, d, { spendingSign: 'negative', accountName: 'Card' });
    expect(transactions.map((t) => [t.date, t.amount, t.description])).toEqual([
      ['2026-09-01', -45.2, 'TRADER JOES #123'],
      ['2026-09-03', 500, 'PAYMENT THANK YOU'],
    ]);
    expect(skippedRows).toBe(1); // the "Totals" row has no date
    expect(transactions[0]).toMatchObject({ accountName: 'Card', pending: false, source: 'csv' });
  });

  it('flips the sign for banks that list purchases as positive (Amex-style)', () => {
    const rows = parseCsv('Date,Description,Amount\n09/01/2026,DELTA AIR,320.00\n09/02/2026,REFUND,-20.00\n09/03/2026,UBER TRIP,18.50\n');
    const d = detectCsv(rows);
    expect(guessSpendingSign(rawAmounts(rows, d))).toBe('positive');
    const { transactions } = toTransactions(rows, d, { spendingSign: 'positive', accountName: 'Amex' });
    expect(transactions.map((t) => t.amount)).toEqual([-320, 20, -18.5]);
  });

  it('computes debit/credit columns as credit minus debit', () => {
    const rows = parseCsv('Date,Description,Debit,Credit\n2026-09-01,Rent,1450.00,\n2026-09-02,Paycheck,,2000.00\n');
    const { transactions } = toTransactions(rows, detectCsv(rows), { spendingSign: 'negative', accountName: 'x' });
    expect(transactions.map((t) => t.amount)).toEqual([-1450, 2000]);
  });

  it('gives the same ids when the same statement is imported again', () => {
    const a = toTransactions(chase, detectCsv(chase), { spendingSign: 'negative', accountName: 'A' }).transactions;
    const b = toTransactions(chase, detectCsv(chase), { spendingSign: 'negative', accountName: 'Different label' }).transactions;
    expect(a.map((t) => t.id)).toEqual(b.map((t) => t.id));
  });

  it('gives overlapping statements the same ids for shared transactions', () => {
    const march = parseCsv('Date,Description,Amount\n03/30/2026,LUNCH,-12.00\n03/31/2026,GAS,-40.00\n');
    const late = parseCsv('Date,Description,Amount\n03/31/2026,GAS,-40.00\n04/01/2026,COFFEE,-4.00\n');
    const ids = (r: string[][]) => toTransactions(r, detectCsv(r), { spendingSign: 'negative', accountName: 'x' }).transactions.map((t) => t.id);
    expect(ids(march)[1]).toBe(ids(late)[0]);
  });

  it('keeps two identical rows in one file apart with a counter', () => {
    const rows = parseCsv('Date,Description,Amount\n09/01/2026,COFFEE,-4.50\n09/01/2026,COFFEE,-4.50\n');
    const { transactions } = toTransactions(rows, detectCsv(rows), { spendingSign: 'negative', accountName: 'x' });
    expect(transactions).toHaveLength(2);
    expect(new Set(transactions.map((t) => t.id)).size).toBe(2);
    expect(transactions[0]!.id.endsWith(':1')).toBe(true);
    expect(transactions[1]!.id.endsWith(':2')).toBe(true);
  });

  it('returns nothing when columns could not be detected', () => {
    const rows = parseCsv('hello,world\nfoo,bar\n');
    expect(toTransactions(rows, detectCsv(rows), { spendingSign: 'negative', accountName: 'x' }).transactions).toEqual([]);
  });
});
