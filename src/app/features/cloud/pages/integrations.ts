import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/toast';
import { Icon } from '../../../shared/icon';
import { Spinner } from '../../../shared/spinner';
import { formatBytes, formatDateTime, pluralize } from '../../../utils/format';
import { formatRelative } from '../../../utils/relative-time';
import type { Connection, ProviderId } from '../model/cloud-types';
import { PROVIDERS, destinationMeta, type DestinationMeta } from '../model/destinations';
import { Clock } from '../services/clock';
import { CloudStore } from '../services/cloud-store';
import { ConnectFlow } from '../services/connect-flow';
import { DestTile } from '../ui/dest-tile';

@Component({
  selector: 'app-integrations',
  imports: [Icon, Spinner, DestTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './integrations.html',
})
export class Integrations {
  protected readonly store = inject(CloudStore);
  private readonly connectFlow = inject(ConnectFlow);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(Clock);

  protected readonly providers = PROVIDERS;
  protected readonly email = destinationMeta('email');
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;

  /** Providers currently running a (simulated) manual sync. */
  protected readonly syncing = signal<ReadonlySet<ProviderId>>(new Set());

  protected readonly emailCount = computed(
    () => this.store.history().filter((h) => h.destination === 'email' && h.status === 'completed').length,
  );

  protected pluralize = pluralize;

  protected connection(meta: DestinationMeta): Connection | undefined {
    return meta.provider ? this.store.connection(meta.provider) : undefined;
  }

  protected state(meta: DestinationMeta): 'none' | 'connected' | 'syncing' | 'error' {
    const connection = this.connection(meta);
    if (!connection) return 'none';
    if (connection.status === 'error') return 'error';
    return this.syncing().has(connection.provider) ? 'syncing' : 'connected';
  }

  protected lastSync(connection: Connection): string {
    return connection.lastSyncAt ? formatRelative(new Date(connection.lastSyncAt), this.clock.now()) : 'Never';
  }

  /** Bytes stored by Spendwise for storage providers, or a row count for Sheets. */
  protected usage(meta: DestinationMeta): { text: string; percent: number } | null {
    if (!meta.provider) return null;
    const used = this.store.usedBytes(meta.provider);
    if (meta.kind === 'sheets') {
      const exports = this.store.history().filter((h) => h.destination === 'sheets' && h.status === 'completed').length;
      return { text: `${pluralize(exports, 'sync')} completed`, percent: 0 };
    }
    const quota = meta.quotaBytes!;
    return {
      text: `${formatBytes(used)} of ${formatBytes(quota)} used by Spendwise`,
      // Never draw an empty bar: a sliver shows that the meter is there.
      percent: Math.max((used / quota) * 100, 1.5),
    };
  }

  protected connect(meta: DestinationMeta): void {
    if (meta.provider) this.connectFlow.open(meta.provider);
  }

  protected disconnect(meta: DestinationMeta): void {
    if (!meta.provider) return;
    this.store.disconnect(meta.provider);
    this.toast.show(`${meta.name} disconnected`);
  }

  protected syncNow(meta: DestinationMeta): void {
    const provider = meta.provider;
    if (!provider || this.syncing().has(provider)) return;
    this.syncing.update((s) => new Set(s).add(provider));
    // Stands in for a real sync round-trip.
    setTimeout(() => {
      this.store.patchConnection(provider, { lastSyncAt: new Date().toISOString() });
      this.syncing.update((s) => {
        const next = new Set(s);
        next.delete(provider);
        return next;
      });
      this.toast.show(`${meta.name} is up to date`);
    }, 1600);
  }

  /** Demo control: simulate the provider signing you out, so the "needs attention" paths can be seen. */
  protected expire(meta: DestinationMeta): void {
    if (meta.provider) this.store.patchConnection(meta.provider, { status: 'error' });
  }
}
