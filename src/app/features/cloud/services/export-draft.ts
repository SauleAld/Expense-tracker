import { Injectable, computed, signal } from '@angular/core';
import type {
  DestinationId,
  DestinationOptions,
  ExportRequest,
  FormatId,
  TemplateId,
  TemplateParams,
} from '../model/cloud-types';
import { defaultOptions, templateTitle } from '../model/destinations';
import { DEFAULT_PARAMS } from '../reports/report-builders';

/**
 * What the user is currently setting up. It is shared so "Schedule this instead" on the New export tab
 * can start the automation form from the same choices.
 */
@Injectable({ providedIn: 'root' })
export class ExportDraft {
  readonly template = signal<TemplateId>('monthly');
  readonly params = signal<TemplateParams>(DEFAULT_PARAMS());
  readonly format = signal<FormatId>('csv');
  readonly destination = signal<DestinationId>('download');
  readonly options = signal<DestinationOptions>(defaultOptions(templateTitle['monthly']));

  readonly request = computed<ExportRequest>(() => ({
    template: this.template(),
    params: this.params(),
    format: this.format(),
    destination: this.destination(),
    options: this.options(),
    trigger: 'manual',
  }));

  setTemplate(template: TemplateId): void {
    const previous = defaultOptions(templateTitle[this.template()]).email.subject;
    this.template.set(template);
    // Keep the email subject in step with the template unless the user has written their own.
    if (this.options().email.subject === previous) {
      const subject = defaultOptions(templateTitle[template]).email.subject;
      this.options.update((o) => ({ ...o, email: { ...o.email, subject } }));
    }
  }
}
