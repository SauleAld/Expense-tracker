import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ExpenseStore } from '../../../core/expense-store';
import { ToastService } from '../../../core/toast';
import { Icon } from '../../../shared/icon';
import { formatDateTime } from '../../../utils/format';
import { formatFuture, formatRelative } from '../../../utils/relative-time';
import type {
  DestinationOptions,
  FormatId,
  Frequency,
  Schedule,
  ScheduledDestinationId,
  TemplateId,
  TemplateParams,
} from '../model/cloud-types';
import { SCHEDULABLE, defaultOptions, destinationMeta, isScheduled, templateTitle } from '../model/destinations';
import { TEMPLATES, templateMeta } from '../model/templates';
import { DEFAULT_PARAMS, availableYears } from '../reports/report-builders';
import { Clock } from '../services/clock';
import { CloudStore } from '../services/cloud-store';
import { ConnectFlow } from '../services/connect-flow';
import { ExportDraft } from '../services/export-draft';
import { blockedReason } from '../services/request-validation';
import { Scheduler } from '../services/scheduler';
import { WEEKDAY_NAMES, computeNextRun, describeRecurrence } from '../services/schedule-math';
import { DestTile } from '../ui/dest-tile';
import { DestinationOptionsForm } from '../ui/destination-options';
import { TemplateParamsForm } from '../ui/template-params';

@Component({
  selector: 'app-automations',
  imports: [Icon, DestTile, DestinationOptionsForm, TemplateParamsForm],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './automations.html',
})
export class Automations {
  protected readonly store = inject(CloudStore);
  private readonly draft = inject(ExportDraft);
  private readonly scheduler = inject(Scheduler);
  private readonly connectFlow = inject(ConnectFlow);
  private readonly toast = inject(ToastService);
  private readonly expenses = inject(ExpenseStore);
  protected readonly clock = inject(Clock);

  protected readonly templates = TEMPLATES;
  protected readonly destinations = SCHEDULABLE;
  protected readonly weekdays = WEEKDAY_NAMES;
  protected readonly days = Array.from({ length: 28 }, (_, i) => i + 1);
  protected readonly templateTitle = templateTitle;
  protected readonly describeRecurrence = describeRecurrence;
  protected readonly formatDateTime = formatDateTime;
  protected readonly destinationMeta = destinationMeta;
  protected readonly templateMeta = templateMeta;
  protected readonly years = computed(() => availableYears(this.expenses.expenses(), this.clock.now()));

  // ---- The "new automation" form ----
  protected readonly formOpen = signal(false);
  protected readonly template = signal<TemplateId>('monthly');
  protected readonly params = signal<TemplateParams>(DEFAULT_PARAMS());
  protected readonly format = signal<FormatId>('csv');
  protected readonly destination = signal<ScheduledDestinationId>('email');
  protected readonly options = signal<DestinationOptions>(defaultOptions('Monthly Summary'));
  protected readonly frequency = signal<Frequency>('monthly');
  protected readonly weekday = signal(1);
  protected readonly dayOfMonth = signal(1);
  protected readonly time = signal('08:00');

  private readonly rule = computed(() => ({
    frequency: this.frequency(),
    weekday: this.weekday(),
    dayOfMonth: this.dayOfMonth(),
    time: this.time(),
  }));
  protected readonly timeValid = computed(() => /^([01]\d|2[0-3]):[0-5]\d$/.test(this.time()));
  protected readonly recurrenceText = computed(() => (this.timeValid() ? describeRecurrence(this.rule()) : ''));
  protected readonly nextRun = computed(() => (this.timeValid() ? computeNextRun(this.rule(), this.clock.now()) : null));
  protected readonly blocked = computed(() => {
    if (!this.timeValid()) return 'Pick a time of day.';
    return blockedReason({ destination: this.destination(), options: this.options() }, this.store.connections());
  });

  protected readonly meta = computed(() => destinationMeta(this.destination()));

  protected openForm(): void {
    // Start from whatever was set up on the New export tab.
    const chosen = this.draft.destination();
    this.template.set(this.draft.template());
    this.params.set(this.draft.params());
    this.format.set(this.draft.format());
    this.destination.set(isScheduled(chosen) ? chosen : 'email');
    this.options.set(this.draft.options());
    this.formOpen.set(true);
  }

  protected setTemplate(id: TemplateId): void {
    const previous = defaultOptions(templateTitle[this.template()]).email.subject;
    this.template.set(id);
    if (this.options().email.subject === previous) {
      const subject = defaultOptions(templateTitle[id]).email.subject;
      this.options.update((o) => ({ ...o, email: { ...o.email, subject } }));
    }
  }

  protected connect(id: ScheduledDestinationId): void {
    const provider = destinationMeta(id).provider;
    if (provider) this.connectFlow.open(provider);
  }

  protected isConnected(id: ScheduledDestinationId): boolean {
    const provider = destinationMeta(id).provider;
    return !provider || this.store.connection(provider)?.status === 'connected';
  }

  protected save(): void {
    const next = this.nextRun();
    if (this.blocked() || !next) return;
    const now = new Date();
    this.store.addSchedule({
      id: this.store.newId(),
      name: `${templateMeta(this.template()).name} → ${this.meta().name}`,
      template: this.template(),
      params: this.params(),
      format: this.format(),
      destination: this.destination(),
      options: this.options(),
      ...this.rule(),
      enabled: true,
      createdAt: now.toISOString(),
      nextRunAt: next.toISOString(),
      lastRunAt: null,
      lastStatus: null,
    });
    this.formOpen.set(false);
    this.toast.show('Automation created');
  }

  // ---- The list ----
  protected toggle(schedule: Schedule): void {
    if (schedule.enabled) {
      this.store.patchSchedule(schedule.id, { enabled: false });
    } else {
      // Resume from now, so a long pause doesn't trigger a burst of catch-up runs.
      this.store.patchSchedule(schedule.id, {
        enabled: true,
        nextRunAt: computeNextRun(schedule, new Date()).toISOString(),
      });
    }
  }

  protected remove(schedule: Schedule): void {
    this.store.removeSchedule(schedule.id);
    this.toast.show(`Deleted “${schedule.name}”`);
  }

  protected runNow(schedule: Schedule): void {
    this.scheduler.runNow(schedule.id);
  }

  protected issue(schedule: Schedule): string | null {
    const meta = destinationMeta(schedule.destination);
    if (!meta.provider) return null;
    const connection = this.store.connection(meta.provider);
    if (!connection) return `${meta.name} is disconnected. Runs will fail until you reconnect.`;
    return connection.status === 'error' ? `${meta.name} needs to be reconnected. Runs will fail until you do.` : null;
  }

  protected reconnect(schedule: Schedule): void {
    const provider = destinationMeta(schedule.destination).provider;
    if (provider) this.connectFlow.open(provider);
  }

  protected nextText(schedule: Schedule): string {
    const at = new Date(schedule.nextRunAt);
    return `${formatFuture(at, this.clock.now())} · ${formatDateTime(at)}`;
  }

  protected lastText(schedule: Schedule): string {
    return schedule.lastRunAt ? formatRelative(new Date(schedule.lastRunAt), this.clock.now()) : 'Never';
  }
}
