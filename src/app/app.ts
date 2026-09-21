import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { ExpenseDialog } from './core/expense-dialog';
import { ExpenseStore } from './core/expense-store';
import { Theme } from './core/theme';
import { ExportJobs } from './features/cloud/services/export-jobs';
import { CloudStore } from './features/cloud/services/cloud-store';
import { Scheduler } from './features/cloud/services/scheduler';
import { JobTray } from './features/cloud/ui/job-tray';
import { ExpenseFormDialog } from './shared/expense-form-dialog';
import { Icon } from './shared/icon';
import { ToastContainer } from './shared/toast-container';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, ExpenseFormDialog, ToastContainer, JobTray],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly store = inject(ExpenseStore);
  protected readonly theme = inject(Theme);
  protected readonly dialog = inject(ExpenseDialog);
  private readonly router = inject(Router);
  private readonly jobs = inject(ExportJobs);
  private readonly cloud = inject(CloudStore);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: location.pathname },
  );

  /** Shared-report pages are shown without the app chrome (they may be opened by someone else). */
  protected readonly bare = computed(() => this.url().startsWith('/shared/'));

  /** Bottom-nav "Export" covers every hub tab except Sharing, which has its own slot. */
  protected readonly exportActive = computed(() => this.url().startsWith('/export') && !this.url().startsWith('/export/sharing'));

  /** Dot on the Export hub link: busy, or something needs attention. */
  protected readonly hubIndicator = computed(() => {
    if (this.jobs.runningCount() > 0) return 'busy' as const;
    const failing = this.cloud.connections().some((c) => c.status === 'error') || this.cloud.history()[0]?.status === 'failed';
    return failing ? ('attention' as const) : null;
  });

  constructor() {
    // Start the automation runner once, for the life of the app.
    inject(Scheduler).start();
  }

  protected readonly nav = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/expenses', label: 'Expenses', icon: 'list' },
    { path: '/export', label: 'Export hub', icon: 'cloud' },
  ] as const;
}
