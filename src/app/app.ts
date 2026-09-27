import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExpenseDialog } from './core/expense-dialog';
import { BankConnection } from './features/bank/services/bank-connection';
import { BankInbox } from './features/bank/services/bank-inbox';
import { ExpenseStore } from './core/expense-store';
import { Theme } from './core/theme';
import { ExpenseFormDialog } from './shared/expense-form-dialog';
import { Icon } from './shared/icon';
import { ToastContainer } from './shared/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ExpenseFormDialog, ToastContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ExpenseStore);
  protected readonly theme = inject(Theme);
  protected readonly dialog = inject(ExpenseDialog);
  /** How many imported transactions are waiting for review (shown as a badge). */
  protected readonly reviewCount = inject(BankInbox).reviewCount;
  /** Whether automatic bank sync is on, so the privacy line stays accurate. */
  protected readonly bankSyncOn = inject(BankConnection).connected;

  constructor() {
    // Watch the local sync server while the app is open.
    inject(BankConnection).start();
  }

  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/expenses', label: 'Expenses', icon: 'list' },
    { path: '/deposits', label: 'Deposits', icon: 'wallet' },
    { path: '/bank', label: 'Bank sync', icon: 'bank' },
  ] as const;
}
