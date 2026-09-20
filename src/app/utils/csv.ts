import type { Expense } from '../core/models';

const HEADERS = ['Date', 'Category', 'Amount', 'Description'] as const;

/** Spreadsheets execute cells that start with these characters as formulas. */
const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

function escapeCell(value: string): string {
  const safe = FORMULA_TRIGGER.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180 CSV (CRLF line endings). Amount is a plain number so spreadsheets parse it. */
export function buildCsv(expenses: readonly Expense[]): string {
  const rows = expenses.map((e) =>
    [e.date, e.category, e.amount.toFixed(2), escapeCell(e.description)].join(','),
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
