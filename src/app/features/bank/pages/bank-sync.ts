import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CATEGORIES, categoryColor, isCategory, type Category } from '../../../core/models';
import { ToastService } from '../../../core/toast';
import { Icon } from '../../../shared/icon';
import { formatCurrency, formatDate, pluralize } from '../../../utils/format';
import type { InboxItem } from '../model/bank-transaction';
import type { RankedTarget } from '../utils/refunds';
import { ConnectionCard } from '../ui/connection-card';
import { BankConnection } from '../services/bank-connection';
import { BankInbox } from '../services/bank-inbox';
import {
  detectCsv,
  detectDateFormat,
  guessSpendingSign,
  rawAmounts,
  toTransactions,
  type Detection,
  type SpendingSign,
} from '../utils/csv-columns';
import { parseCsv } from '../utils/csv-parse';

const MAX_BYTES = 5 * 1024 * 1024;

interface PendingImport {
  fileName: string;
  rows: string[][];
  detection: Detection;
}

@Component({
  selector: 'app-bank-sync',
  imports: [Icon, ConnectionCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bank-sync.html',
})
export class BankSync {
  protected readonly inbox = inject(BankInbox);
  private readonly conn = inject(BankConnection);
  /** CSV is the fallback once a bank is connected, or once there is already something to review. */
  protected readonly compactDropZone = computed(() => this.conn.connected() || this.inbox.items().length > 0);
  private readonly toast = inject(ToastService);

  protected readonly categories = CATEGORIES;
  protected readonly categoryColor = categoryColor;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly pluralize = pluralize;

  // ---- CSV import ----
  protected readonly pending = signal<PendingImport | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly dragging = signal(false);
  protected readonly accountName = signal('Imported CSV');
  protected readonly manual = signal<{ date: number | null; description: number | null; amount: number | null }>({
    date: null,
    description: null,
    amount: null,
  });
  private readonly signOverride = signal<SpendingSign | null>(null);

  protected readonly needsMapping = computed(() => {
    const p = this.pending();
    return !!p && !p.detection.columns;
  });

  /** The detection, or the one the user completed by hand when it could not be worked out. */
  private readonly detection = computed<Detection | null>(() => {
    const p = this.pending();
    if (!p) return null;
    if (p.detection.columns) return p.detection;
    const m = this.manual();
    if (m.date === null || m.description === null || m.amount === null) return p.detection;
    const body = (p.detection.hasHeader ? p.rows.slice(1) : p.rows).map((r) => r[m.date!] ?? '');
    return {
      ...p.detection,
      dateFormat: detectDateFormat(body),
      columns: { date: m.date, description: m.description, amount: m.amount, debit: null, credit: null },
    };
  });

  protected readonly columnOptions = computed(() => {
    const p = this.pending();
    if (!p) return [];
    const width = Math.max(0, ...p.rows.map((r) => r.length));
    return Array.from({ length: width }, (_, i) => ({ index: i, label: p.detection.headers[i] || `Column ${i + 1}` }));
  });

  protected readonly usesSignedAmount = computed(() => this.detection()?.columns?.amount != null);
  private readonly signGuess = computed<SpendingSign>(() => {
    const p = this.pending();
    const d = this.detection();
    return p && d?.columns ? guessSpendingSign(rawAmounts(p.rows, d)) : 'negative';
  });
  protected readonly spendingSign = computed(() => this.signOverride() ?? this.signGuess());

  protected readonly parsed = computed(() => {
    const p = this.pending();
    const d = this.detection();
    if (!p || !d?.columns) return null;
    return toTransactions(p.rows, d, { spendingSign: this.spendingSign(), accountName: this.accountName().trim() || 'Imported CSV' });
  });
  protected readonly importCount = computed(() => this.parsed()?.transactions.length ?? 0);
  protected readonly previewRows = computed(() => this.parsed()?.transactions.slice(0, 5) ?? []);

  protected columnLabel(index: number | null): string {
    return index === null ? '' : (this.columnOptions()[index]?.label ?? '');
  }

  protected setManual(key: 'date' | 'description' | 'amount', value: string): void {
    this.manual.update((m) => ({ ...m, [key]: value === '' ? null : Number(value) }));
  }

  protected setSign(sign: SpendingSign): void {
    this.signOverride.set(sign);
  }

  protected onFileInput(input: HTMLInputElement): void {
    const file = input.files?.[0];
    input.value = ''; // so choosing the same file again still fires
    if (file) void this.load(file);
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) void this.load(file);
  }

  private async load(file: File): Promise<void> {
    this.error.set(null);
    this.pending.set(null);
    if (file.size === 0) return void this.error.set('That file is empty.');
    if (file.size > MAX_BYTES) return void this.error.set('That file is over 5 MB, which is too big for a bank statement. Is it the right file?');

    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) return void this.error.set('No rows found. Is this a CSV export from your bank?');
      this.signOverride.set(null);
      this.manual.set({ date: null, description: null, amount: null });
      this.accountName.set(file.name.replace(/\.[^.]+$/, '') || 'Imported CSV');
      this.pending.set({ fileName: file.name, rows, detection: detectCsv(rows) });
    } catch {
      this.error.set('Could not read that file.');
    }
  }

  protected cancelImport(): void {
    this.pending.set(null);
    this.error.set(null);
  }

  protected confirmImport(): void {
    const parsed = this.parsed();
    if (!parsed || parsed.transactions.length === 0) return;
    const r = this.inbox.add(parsed.transactions);
    this.pending.set(null);
    const parts = [`${pluralize(r.added, 'transaction')} to review`];
    if (r.autoSkipped) parts.push(`${r.autoSkipped} skipped (transfers or possible duplicates)`);
    if (r.alreadyKnown) parts.push(`${r.alreadyKnown} already imported`);
    this.toast.show(parts.join(' · '));
  }

  // ---- Review inbox ----
  protected setCategory(item: InboxItem, value: string): void {
    if (isCategory(value)) this.inbox.setCategory(item.id, value as Category);
  }

  protected targetLabel(target: RankedTarget): string {
    return `${target.description} · ${formatDate(target.date, 'medium')} · ${formatCurrency(target.remainingCents / 100)}`;
  }

  protected approveAll(): void {
    const ready = this.inbox.approvable();
    const refunds = ready.filter((i) => i.kind === 'refund').length;
    const deposits = ready.filter((i) => i.kind !== 'refund' && i.amount > 0).length;
    const expenses = ready.length - refunds - deposits;
    if (this.inbox.approve() === 0) return;
    const parts = [];
    if (expenses > 0) parts.push(pluralize(expenses, 'expense'));
    if (deposits > 0) parts.push(pluralize(deposits, 'deposit'));
    let message = parts.length > 0 ? `Added ${parts.join(' and ')}` : '';
    if (refunds > 0) {
      const took = `${pluralize(refunds, 'refund')} taken off ${refunds === 1 ? 'its purchase' : 'their purchases'}`;
      message = message ? `${message}, ${took}` : took.charAt(0).toUpperCase() + took.slice(1);
    }
    this.toast.show(`${message}.`);
  }

  protected clearSkipped(): void {
    this.inbox.discardSkipped();
  }
}
