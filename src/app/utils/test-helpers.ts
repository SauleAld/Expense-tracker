import type { Expense } from '../core/models';

let counter = 0;

export function makeExpense(overrides: Partial<Expense> = {}): Expense {
  counter++;
  return {
    id: `e${counter}`,
    date: '2026-09-10',
    amount: 10,
    category: 'Groceries',
    description: `Expense ${counter}`,
    createdAt: counter,
    ...overrides,
  };
}
