import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ExpenseDialog } from './core/expense-dialog';
import { ExpenseStore } from './core/expense-store';
import { Theme } from './core/theme';
import { ExportDialog } from './features/export/export-dialog';
import { ExpenseFormDialog } from './shared/expense-form-dialog';
import { Icon } from './shared/icon';
import { ToastContainer } from './shared/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ExpenseFormDialog, ExportDialog, ToastContainer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ExpenseStore);
  protected readonly theme = inject(Theme);
  protected readonly dialog = inject(ExpenseDialog);

  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/expenses', label: 'Expenses', icon: 'list' },
  ] as const;
}
