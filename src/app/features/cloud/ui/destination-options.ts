import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import type { DestinationId, DestinationOptions, FormatId, LinkExpiry } from '../model/cloud-types';
import { DEMO_FOLDERS, DEMO_SPREADSHEETS, destinationMeta } from '../model/destinations';
import { isValidEmail, splitRecipients } from '../services/email';
import { EXPIRY_LABEL } from '../services/sharing';
import { Icon } from '../../../shared/icon';

const FORMAT_CHOICES: readonly { id: FormatId; label: string }[] = [
  { id: 'csv', label: 'CSV' },
  { id: 'json', label: 'JSON' },
  { id: 'pdf', label: 'PDF' },
];

/** The settings for one destination. Shared by the New export tab and the Automations form. */
@Component({
  selector: 'app-destination-options',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './destination-options.html',
})
export class DestinationOptionsForm {
  readonly destination = input.required<DestinationId>();
  readonly options = model.required<DestinationOptions>();
  readonly format = model.required<FormatId>();
  /** Prefix for element ids, so two instances never collide. */
  readonly idPrefix = input('opt');
  /** Shown under the folder picker, e.g. `monthly-summary-2026-09.csv`. */
  readonly filename = input('');

  protected readonly formats = FORMAT_CHOICES;
  protected readonly spreadsheets = DEMO_SPREADSHEETS;
  protected readonly folders = DEMO_FOLDERS;
  protected readonly expiryChoices = Object.entries(EXPIRY_LABEL) as [LinkExpiry, string][];

  protected readonly meta = computed(() => destinationMeta(this.destination()));
  protected readonly recipientDraft = signal('');
  protected readonly recipientError = signal<string | null>(null);
  protected readonly newSpreadsheet = computed(() => this.options().sheets.spreadsheet === 'new');

  // ---- Email recipients ----
  protected addRecipients(): void {
    const parts = splitRecipients(this.recipientDraft());
    if (parts.length === 0) return;
    const invalid = parts.filter((p) => !isValidEmail(p));
    const valid = parts.filter(isValidEmail);
    const existing = this.options().email.to;
    const merged = [...existing, ...valid.filter((v) => !existing.includes(v))];
    this.patch('email', { to: merged });
    // Keep only what was invalid in the box so it can be corrected.
    this.recipientDraft.set(invalid.join(', '));
    this.recipientError.set(
      invalid.length ? `${invalid.map((i) => `“${i}”`).join(', ')} ${invalid.length === 1 ? 'isn’t a valid email address' : 'aren’t valid email addresses'}.` : null,
    );
  }

  protected onRecipientKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',' || event.key === ';') {
      event.preventDefault();
      this.addRecipients();
    } else if (event.key === 'Backspace' && this.recipientDraft() === '') {
      this.removeRecipient(this.options().email.to.length - 1);
    }
  }

  protected removeRecipient(index: number): void {
    this.patch('email', { to: this.options().email.to.filter((_, i) => i !== index) });
  }

  // ---- Generic patching ----
  protected patch<K extends keyof DestinationOptions>(key: K, patch: Partial<DestinationOptions[K]>): void {
    this.options.update((o) => ({ ...o, [key]: { ...o[key], ...patch } }));
  }

  protected setSpreadsheet(id: string): void {
    // A brand-new spreadsheet has nothing to append to or replace.
    this.patch('sheets', { spreadsheet: id, ...(id === 'new' ? { mode: 'create' as const } : {}) });
  }
}
