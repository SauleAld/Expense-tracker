import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ExpenseStore } from '../../../core/expense-store';
import { ToastService } from '../../../core/toast';
import { Icon } from '../../../shared/icon';
import { formatDateTime, pluralize } from '../../../utils/format';
import { formatRelative } from '../../../utils/relative-time';
import type { DestinationOptions, ShareLink, TemplateId, TemplateParams } from '../model/cloud-types';
import { defaultOptions } from '../model/destinations';
import { TEMPLATES, templateMeta } from '../model/templates';
import { DEFAULT_PARAMS, availableYears } from '../reports/report-builders';
import { Clock } from '../services/clock';
import { CloudStore } from '../services/cloud-store';
import { ExportJobs } from '../services/export-jobs';
import { EXPIRY_LABEL, shareStatus, shareUrl } from '../services/sharing';
import { DestinationOptionsForm } from '../ui/destination-options';
import { QrCode } from '../ui/qr-code';
import { TemplateParamsForm } from '../ui/template-params';

@Component({
  selector: 'app-sharing',
  imports: [Icon, DestinationOptionsForm, TemplateParamsForm, QrCode],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './sharing.html',
})
export class Sharing {
  protected readonly store = inject(CloudStore);
  private readonly jobs = inject(ExportJobs);
  private readonly toast = inject(ToastService);
  private readonly expenses = inject(ExpenseStore);
  private readonly clock = inject(Clock);

  protected readonly templates = TEMPLATES;
  protected readonly templateMeta = templateMeta;
  protected readonly shareUrl = shareUrl;
  protected readonly formatDateTime = formatDateTime;
  protected readonly pluralize = pluralize;
  protected readonly years = computed(() => availableYears(this.expenses.expenses(), this.clock.now()));

  // ---- Create form ----
  protected readonly template = signal<TemplateId>('monthly');
  protected readonly params = signal<TemplateParams>(DEFAULT_PARAMS());
  protected readonly options = signal<DestinationOptions>(defaultOptions('Monthly Summary'));
  protected readonly creating = computed(() => this.jobs.jobs().some((j) => j.destination === 'link' && j.state === 'running'));

  // ---- List ----
  /** The link whose QR code is open. New links open automatically. */
  protected readonly qrFor = signal<string | null>(null);
  private knownCount = this.store.shares().length;

  constructor() {
    // Arriving right after creating a link (e.g. via the tray's "Open sharing") should show its QR code.
    const newest = this.store.shares()[0];
    if (newest && Date.now() - new Date(newest.createdAt).getTime() < 60_000) this.qrFor.set(newest.id);

    effect(() => {
      const shares = this.store.shares();
      untracked(() => {
        if (shares.length > this.knownCount && shares[0]) this.qrFor.set(shares[0].id);
        this.knownCount = shares.length;
      });
    });
  }

  protected create(): void {
    this.jobs.start({
      template: this.template(),
      params: this.params(),
      format: 'csv',
      destination: 'link',
      options: this.options(),
      trigger: 'manual',
    });
  }

  protected status(link: ShareLink) {
    return shareStatus(link, this.clock.now());
  }

  protected created(link: ShareLink): string {
    return formatRelative(new Date(link.createdAt), this.clock.now());
  }

  protected expires(link: ShareLink): string {
    if (!link.expiresAt) return 'Never expires';
    const at = new Date(link.expiresAt);
    return at > this.clock.now() ? `Expires ${formatDateTime(at)}` : `Expired ${formatDateTime(at)}`;
  }

  protected setTemplate(id: TemplateId): void {
    const previous = defaultOptions(templateMeta(this.template()).name).email.subject;
    this.template.set(id);
    if (this.options().email.subject === previous) {
      this.options.update((o) => ({ ...o, email: { ...o.email, subject: defaultOptions(templateMeta(id).name).email.subject } }));
    }
  }

  protected async copy(link: ShareLink, input: HTMLInputElement): Promise<void> {
    const url = shareUrl(link.id);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API unavailable or denied: fall back to selecting the text and copying.
      input.select();
      if (!document.execCommand('copy')) {
        this.toast.error('Couldn’t copy. Select the link and copy it manually.');
        return;
      }
    }
    this.toast.show('Link copied');
  }

  protected toggleQr(link: ShareLink): void {
    this.qrFor.set(this.qrFor() === link.id ? null : link.id);
  }

  protected revoke(link: ShareLink): void {
    this.store.revokeShare(link.id);
    this.toast.show('Link turned off. Anyone who opens it now sees that it’s no longer available.');
  }

  protected remove(link: ShareLink): void {
    this.store.removeShare(link.id);
  }

  protected expiryLabel(link: ShareLink): string {
    return link.expiresAt ? this.expires(link) : EXPIRY_LABEL.never;
  }
}
