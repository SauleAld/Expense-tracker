import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { Icon, type IconName } from '../../../shared/icon';
import { Spinner } from '../../../shared/spinner';
import { formatRelative } from '../../../utils/relative-time';
import { PROVIDERS } from '../model/destinations';
import { CloudStore } from '../services/cloud-store';
import { Clock } from '../services/clock';
import { ExportJobs } from '../services/export-jobs';
import { shareStatus } from '../services/sharing';
import { ConnectDialog } from '../ui/connect-dialog';

interface Tab {
  path: string;
  label: string;
  icon: IconName;
  count: number | null;
}

@Component({
  selector: 'app-export-hub',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, Spinner, ConnectDialog],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-hub.html',
})
export class ExportHub {
  private readonly store = inject(CloudStore);
  private readonly jobs = inject(ExportJobs);
  private readonly clock = inject(Clock);

  protected readonly providerCount = PROVIDERS.length;

  private readonly connected = computed(() => this.store.connections().filter((c) => c.status === 'connected').length);
  private readonly activeAutomations = computed(() => this.store.schedules().filter((s) => s.enabled).length);
  private readonly activeLinks = computed(
    () => this.store.shares().filter((s) => shareStatus(s, this.clock.now()) === 'active').length,
  );

  protected readonly exportsThisMonth = computed(() => {
    const now = this.clock.now();
    return this.store
      .history()
      .filter((h) => {
        const at = new Date(h.at);
        return h.status === 'completed' && at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth();
      }).length;
  });

  protected readonly stats = computed(() => [
    { label: 'Exports this month', value: String(this.exportsThisMonth()), icon: 'download' as IconName },
    { label: 'Connected apps', value: `${this.connected()} of ${this.providerCount}`, icon: 'cloud' as IconName },
    { label: 'Active automations', value: String(this.activeAutomations()), icon: 'bolt' as IconName },
    { label: 'Active share links', value: String(this.activeLinks()), icon: 'link' as IconName },
  ]);

  protected readonly tabs = computed<Tab[]>(() => [
    { path: 'new', label: 'New export', icon: 'plus', count: null },
    { path: 'automations', label: 'Automations', icon: 'bolt', count: this.store.schedules().length || null },
    { path: 'history', label: 'History', icon: 'clock', count: this.store.history().length || null },
    { path: 'integrations', label: 'Integrations', icon: 'cloud', count: null },
    { path: 'sharing', label: 'Sharing', icon: 'link', count: this.activeLinks() || null },
  ]);

  /** The at-a-glance sync indicator. */
  protected readonly status = computed(() => {
    const running = this.jobs.runningCount();
    if (running > 0) return { kind: 'syncing' as const, label: `Syncing · ${running} running` };

    const broken = this.store.connections().filter((c) => c.status === 'error').length;
    if (broken > 0) {
      return { kind: 'attention' as const, label: `${broken} ${broken === 1 ? 'integration needs' : 'integrations need'} attention` };
    }
    const last = this.store.history()[0];
    if (last?.status === 'failed') return { kind: 'attention' as const, label: 'The last export failed' };
    return {
      kind: 'ok' as const,
      label: last ? `All synced · last export ${formatRelative(new Date(last.at), this.clock.now())}` : 'Ready · no exports yet',
    };
  });
}
