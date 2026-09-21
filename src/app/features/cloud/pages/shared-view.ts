import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Icon } from '../../../shared/icon';
import { csvBlob } from '../../../utils/csv';
import { downloadBlob } from '../../../utils/download';
import { formatDateTime } from '../../../utils/format';
import { reportToCsv } from '../reports/report-render';
import { CloudStore } from '../services/cloud-store';
import { shareStatus } from '../services/sharing';
import { ReportTable } from '../ui/report-table';

/** What someone sees when they open a share link: a read-only snapshot. */
@Component({
  selector: 'app-shared-view',
  imports: [Icon, RouterLink, ReportTable],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './shared-view.html',
})
export class SharedView {
  private readonly store = inject(CloudStore);
  private readonly token = inject(ActivatedRoute).snapshot.paramMap.get('token') ?? '';

  protected readonly when = (iso: string): string => formatDateTime(new Date(iso));
  protected readonly link = computed(() => this.store.share(this.token));
  protected readonly state = computed(() => {
    const link = this.link();
    return link ? shareStatus(link, new Date()) : ('missing' as const);
  });

  constructor() {
    // Count this visit once, and only if the link is usable.
    if (this.state() === 'active') this.store.recordView(this.token);
  }

  protected download(): void {
    const link = this.link();
    if (!link?.allowDownload) return;
    downloadBlob(`${link.snapshot.stem}.csv`, csvBlob(reportToCsv(link.snapshot)));
  }
}
