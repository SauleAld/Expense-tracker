import { refundedAmount, type Expense } from '../core/models';

const HEADERS = ['Date', 'Description', 'Category', 'Amount', 'Refunded'] as const;

/** Spreadsheets execute cells that start with these characters as formulas. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeCell(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV (CRLF line endings). Amounts are plain numbers so spreadsheets parse them; Amount is before refunds. */
export function buildCsv(expenses: readonly Expense[]): string {
  const rows = expenses.map((e) =>
    [e.date, escapeCell(e.description), e.category, e.amount.toFixed(2), refundedAmount(e).toFixed(2)].join(','),
  );
  return [HEADERS.join(','), ...rows].join('\r\n') + '\r\n';
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM makes Excel read the file as UTF-8.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
