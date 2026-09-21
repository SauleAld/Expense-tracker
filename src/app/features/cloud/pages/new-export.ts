import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ExpenseStore } from '../../../core/expense-store';
import { Icon } from '../../../shared/icon';
import { formatCurrency, pluralize } from '../../../utils/format';
import type { DestinationId, DestinationOptions, FormatId, TemplateId } from '../model/cloud-types';
import { DESTINATIONS, destinationMeta } from '../model/destinations';
import { TEMPLATES, templateMeta } from '../model/templates';
import { availableYears, buildReport } from '../reports/report-builders';
import { FORMAT_EXTENSION } from '../reports/report-render';
import { Clock } from '../services/clock';
import { CloudStore } from '../services/cloud-store';
import { ConnectFlow } from '../services/connect-flow';
import { ExportDraft } from '../services/export-draft';
import { ExportJobs } from '../services/export-jobs';
import { blockedReason } from '../services/request-validation';
import { DestTile } from '../ui/dest-tile';
import { DestinationOptionsForm } from '../ui/destination-options';
import { ReportTable } from '../ui/report-table';
import { TemplateParamsForm } from '../ui/template-params';

@Component({
  selector: 'app-new-export',
  imports: [Icon, RouterLink, DestTile, DestinationOptionsForm, ReportTable, TemplateParamsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-export.html',
})
export class NewExport {
  protected readonly draft = inject(ExportDraft);
  private readonly expenses = inject(ExpenseStore);
  private readonly store = inject(CloudStore);
  private readonly jobs = inject(ExportJobs);
  private readonly connectFlow = inject(ConnectFlow);
  private readonly clock = inject(Clock);

  protected readonly templates = TEMPLATES;
  protected readonly destinations = DESTINATIONS;
  protected readonly formatCurrency = formatCurrency;
  protected readonly pluralize = pluralize;

  protected readonly years = computed(() => availableYears(this.expenses.expenses(), this.clock.now()));
  protected readonly template = computed(() => templateMeta(this.draft.template()));
  protected readonly destination = computed(() => destinationMeta(this.draft.destination()));

  /** The live report, rebuilt whenever expenses or choices change. */
  protected readonly report = computed(() =>
    buildReport(this.draft.template(), this.expenses.expenses(), this.draft.params(), new Date()),
  );

  /** One line per template card ("87 expenses · $1,240.50") using the current settings. */
  protected readonly cardStats = computed(() => {
    const now = new Date();
    return Object.fromEntries(
      TEMPLATES.map((t) => {
        const r = buildReport(t.id, this.expenses.expenses(), this.draft.params(), now);
        return [t.id, `${pluralize(r.recordCount, 'expense')} · ${formatCurrency(r.total)}`];
      }),
    ) as Record<TemplateId, string>;
  });

  protected readonly filename = computed(() => `${this.report().stem}.${FORMAT_EXTENSION[this.draft.format()]}`);

  protected readonly blocked = computed(() => {
    if (this.report().recordCount === 0) return 'There are no expenses for this template and period yet.';
    return blockedReason(this.draft.request(), this.store.connections());
  });

  protected connection(id: DestinationId) {
    const provider = destinationMeta(id).provider;
    return provider ? this.store.connection(provider) : undefined;
  }

  protected connect(id: DestinationId): void {
    const provider = destinationMeta(id).provider;
    if (provider) this.connectFlow.open(provider);
  }

  protected setFormat(format: FormatId): void {
    this.draft.format.set(format);
  }

  protected setOptions(options: DestinationOptions): void {
    this.draft.options.set(options);
  }

  protected run(): void {
    if (this.blocked()) return;
    this.jobs.start(this.draft.request());
  }
}
