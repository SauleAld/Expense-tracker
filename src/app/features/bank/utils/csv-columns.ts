import { isValidISODate } from '../../../utils/dates';
import type { BankTransaction } from '../model/bank-transaction';

export type DateFormat = 'iso' | 'mdy' | 'dmy';
export type SpendingSign = 'negative' | 'positive';

export interface ColumnMap {
  date: number;
  description: number;
  /** A single signed amount column, or null when debits and credits are separate columns. */
  amount: number | null;
  debit: number | null;
  credit: number | null;
}

export interface Detection {
  hasHeader: boolean;
  headers: string[];
  /** Null when the columns could not be worked out; the user then picks them by hand. */
  columns: ColumnMap | null;
  dateFormat: DateFormat;
}

const MINUS_SIGN = String.fromCharCode(0x2212);

// ---- Cell parsing ----

/** Parses `2026-09-01`, `9/1/2026`, `09-01-26`, or any of those followed by a time. */
export function parseDate(text: string, format: DateFormat): string | null {
  const value = text.trim();
  const iso = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[T\s])/.exec(value);
  if (iso) return check(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const local = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:$|[T\s])/.exec(value);
  if (!local) return null;
  const [a, b] = [Number(local[1]), Number(local[2])];
  const year = local[3]!.length === 2 ? 2000 + Number(local[3]) : Number(local[3]);
  return format === 'dmy' ? check(year, b, a) : check(year, a, b);
}

function check(y: number, m: number, d: number): string | null {
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return isValidISODate(iso) ? iso : null;
}

/** `$1,234.50`, `(12.34)`, `12.34-`, `-12.34`, `+5` and a typographic minus are all understood. */
export function parseAmount(text: string): number | null {
  let value = text.trim().replace(MINUS_SIGN, '-').replace(/[$\s,]|USD/gi, '');
  if (value === '') return null;
  let negative = false;
  if (/^\(.*\)$/.test(value)) {
    negative = true;
    value = value.slice(1, -1);
  }
  if (value.endsWith('-')) {
    negative = true;
    value = value.slice(0, -1);
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(value)) return null;
  const number = Number(value);
  return Math.round((negative ? -Math.abs(number) : number) * 100) / 100;
}

/** Whichever sign is more common is the spending sign; refunds and payments are the minority. */
export function guessSpendingSign(amounts: readonly number[]): SpendingSign {
  const negatives = amounts.filter((a) => a < 0).length;
  const positives = amounts.filter((a) => a > 0).length;
  return negatives >= positives ? 'negative' : 'positive';
}

// ---- Detection ----

const HEADER_PATTERNS = {
  date: [/^transaction date$/i, /^trans\.? date$/i, /^date$/i, /posted|post date|date/i],
  description: [/^description$/i, /description|memo|payee|merchant|details|narrative|name/i],
  amount: [/^amount$/i, /^amount\b/i, /amount/i],
  debit: [/debit|withdraw|money out|paid out|charge/i],
  credit: [/credit|deposit|money in|paid in/i],
} as const;

function findByHeader(headers: string[], patterns: readonly RegExp[], exclude: number[] = []): number | null {
  for (const pattern of patterns) {
    const index = headers.findIndex((h, i) => !exclude.includes(i) && !/balance|bal\./i.test(h) && pattern.test(h));
    if (index !== -1) return index;
  }
  return null;
}

export function detectDateFormat(dateValues: string[]): DateFormat {
  if (dateValues.some((v) => /^\d{4}[-/.]/.test(v.trim()))) return 'iso';
  const parts = dateValues.map((v) => /^(\d{1,2})[-/.](\d{1,2})[-/.]/.exec(v.trim())).filter(Boolean) as RegExpExecArray[];
  if (parts.some((m) => Number(m[1]) > 12)) return 'dmy';
  return 'mdy'; // US default when ambiguous
}

const share = (values: string[], test: (v: string) => boolean) =>
  values.length === 0 ? 0 : values.filter(test).length / values.length;

/** Works out which column is which, from the header names when there are any, otherwise from the values. */
export function detectCsv(rows: string[][]): Detection {
  const width = Math.max(0, ...rows.map((r) => r.length));
  const first = rows[0] ?? [];
  const hasHeader = first.length > 0 && !first.some((c) => parseDate(c, 'mdy') !== null || parseDate(c, 'dmy') !== null);
  const headers = hasHeader ? first.map((h) => h.trim()) : [];
  const body = (hasHeader ? rows.slice(1) : rows).slice(0, 200);
  const column = (i: number) => body.map((r) => r[i] ?? '');

  const cols = Array.from({ length: width }, (_, i) => i);
  const dateGuess = detectDateFormat(cols.flatMap((i) => column(i).filter((v) => parseDate(v, 'mdy') !== null)));

  let date = hasHeader ? findByHeader(headers, HEADER_PATTERNS.date) : null;
  if (date === null) date = cols.find((i) => share(column(i), (v) => parseDate(v, dateGuess) !== null) >= 0.8) ?? null;
  const dateFormat = date === null ? 'mdy' : detectDateFormat(column(date));

  let amount = hasHeader ? findByHeader(headers, HEADER_PATTERNS.amount, date === null ? [] : [date]) : null;
  let debit: number | null = null;
  let credit: number | null = null;
  if (amount === null && hasHeader) {
    debit = findByHeader(headers, HEADER_PATTERNS.debit);
    credit = findByHeader(headers, HEADER_PATTERNS.credit, debit === null ? [] : [debit]);
    if (debit === null || credit === null) debit = credit = null;
  }
  if (amount === null && debit === null) {
    // No usable header: the first mostly-numeric column that isn't the date.
    amount = cols.find((i) => i !== date && share(column(i), (v) => parseAmount(v) !== null && /\d/.test(v)) >= 0.8) ?? null;
  }

  const taken = [date, amount, debit, credit].filter((i): i is number => i !== null);
  let description = hasHeader ? findByHeader(headers, HEADER_PATTERNS.description, taken) : null;
  if (description === null) {
    // The remaining text column with the longest values.
    const average = (i: number) => column(i).reduce((s, v) => s + v.trim().length, 0) / Math.max(body.length, 1);
    const candidates = cols.filter((i) => !taken.includes(i) && share(column(i), (v) => parseAmount(v) === null && v.trim() !== '') >= 0.5);
    description = candidates.sort((a, b) => average(b) - average(a))[0] ?? null;
  }

  const ready = date !== null && description !== null && (amount !== null || (debit !== null && credit !== null));
  return {
    hasHeader,
    headers,
    dateFormat,
    columns: ready ? { date: date!, description: description!, amount, debit, credit } : null,
  };
}

// ---- Rows to transactions ----

/** FNV-1a: small, stable, and good enough to tell rows apart. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();

export interface ParsedRows {
  transactions: BankTransaction[];
  /** Rows that had no usable date or amount (totals, notes, blank lines). */
  skippedRows: number;
}

/** The signed amounts in the file, before any sign flip; used to guess the spending sign. */
export function rawAmounts(rows: string[][], detection: Detection): number[] {
  const { columns } = detection;
  if (!columns || columns.amount === null) return [];
  return (detection.hasHeader ? rows.slice(1) : rows)
    .map((r) => parseAmount(r[columns.amount!] ?? ''))
    .filter((a): a is number => a !== null && a !== 0);
}

/**
 * Turns rows into transactions where negative means money out. Ids are derived from the row
 * (date, amount, description) plus a counter for identical rows, so importing the same statement
 * twice, or two overlapping statements, recognises the transactions it has already seen.
 */
export function toTransactions(
  rows: string[][],
  detection: Detection,
  options: { spendingSign: SpendingSign; accountName: string },
): ParsedRows {
  const { columns } = detection;
  if (!columns) return { transactions: [], skippedRows: rows.length };

  const seen = new Map<string, number>();
  const transactions: BankTransaction[] = [];
  let skippedRows = 0;

  for (const row of detection.hasHeader ? rows.slice(1) : rows) {
    const date = parseDate(row[columns.date] ?? '', detection.dateFormat);
    let amount: number | null;
    if (columns.amount !== null) {
      const raw = parseAmount(row[columns.amount] ?? '');
      amount = raw === null ? null : options.spendingSign === 'positive' ? -raw : raw;
    } else {
      // Separate columns: debits are money out, credits are money in.
      const debit = parseAmount(row[columns.debit!] ?? '') ?? 0;
      const credit = parseAmount(row[columns.credit!] ?? '') ?? 0;
      amount = debit === 0 && credit === 0 ? null : Math.round((credit - Math.abs(debit)) * 100) / 100;
    }
    const description = tidy(row[columns.description] ?? '');
    if (!date || amount === null || amount === 0 || !description) {
      skippedRows++;
      continue;
    }

    const base = `csv:${hash(`${date}|${Math.round(amount * 100)}|${description.toUpperCase()}`)}`;
    const occurrence = (seen.get(base) ?? 0) + 1;
    seen.set(base, occurrence);
    transactions.push({
      id: `${base}:${occurrence}`,
      accountName: options.accountName,
      date,
      amount,
      description,
      pending: false,
      source: 'csv',
    });
  }
  return { transactions, skippedRows };
}
