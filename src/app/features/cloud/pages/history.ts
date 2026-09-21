import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/icon';
import { formatBytes, formatDateTime, pluralize } from '../../../utils/format';
import { formatRelative } from '../../../utils/relative-time';
import type { DestinationId, HistoryEntry } from '../model/cloud-types';
import { DESTINATIONS, destinationMeta } from '../model/destinations';
import { templateMeta } from '../model/templates';
import { Clock } from '../services/clock';
import { CloudStore } from '../services/cloud-store';
import { ExportJobs } from '../services/export-jobs';
import { DestTile } from '../ui/dest-tile';

@Component({
  selector: 'app-history',
  imports: [Icon, RouterLink, DestTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history.html',
})
export class History {
  private readonly store = inject(CloudStore);
  private readonly jobs = inject(ExportJobs);
  private readonly clock = inject(Clock);

  protected readonly destinations = DESTINATIONS;
  protected readonly formatBytes = formatBytes;
  protected readonly formatDateTime = formatDateTime;
  protected readonly pluralize = pluralize;
  protected readonly templateMeta = templateMeta;
  protected readonly destinationMeta = destinationMeta;

  protected readonly status = signal<'all' | 'completed' | 'failed'>('all');
  protected readonly destination = signal<DestinationId | 'all'>('all');
  protected readonly confirmingClear = signal(false);
  private clearTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly total = computed(() => this.store.history().length);
  protected readonly entries = computed(() =>
    this.store
      .history()
      .filter((h) => (this.status() === 'all' || h.status === this.status()) && (this.destination() === 'all' || h.destination === this.destination())),
  );

  protected when(entry: HistoryEntry): string {
    return formatRelative(new Date(entry.at), this.clock.now());
  }

  protected templateDate(entry: HistoryEntry): Date {
    return new Date(entry.at);
  }

  protected setStatus(value: string): void {
    this.status.set(value === 'completed' ? 'completed' : value === 'failed' ? 'failed' : 'all');
  }

  protected setDestination(value: string): void {
    this.destination.set(DESTINATIONS.find((d) => d.id === value)?.id ?? 'all');
  }

  protected runAgain(entry: HistoryEntry): void {
    this.jobs.start({ ...entry.request, trigger: 'manual' });
  }

  /** Two clicks to clear: the second confirms. The prompt disarms itself after a few seconds. */
  protected clear(): void {
    if (!this.confirmingClear()) {
      this.confirmingClear.set(true);
      clearTimeout(this.clearTimer);
      this.clearTimer = setTimeout(() => this.confirmingClear.set(false), 4000);
      return;
    }
    clearTimeout(this.clearTimer);
    this.confirmingClear.set(false);
    this.store.clearHistory();
  }
}
