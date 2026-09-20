import { Injectable, signal } from '@angular/core';
import type { Expense } from './models';

export type DialogState = { mode: 'add' } | { mode: 'edit'; expense: Expense };

/** Lets any page open the add/edit dialog that lives in the app shell. */
@Injectable({ providedIn: 'root' })
export class ExpenseDialog {
  readonly state = signal<DialogState | null>(null);

  openAdd(): void {
    this.state.set({ mode: 'add' });
  }

  openEdit(expense: Expense): void {
    this.state.set({ mode: 'edit', expense });
  }

  close(): void {
    this.state.set(null);
  }
}
