import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ExportDialogController } from '../../core/export-dialog';
import { ExpenseStore } from '../../core/expense-store';
import { CATEGORIES, categoryColor, type Category, type Expense } from '../../core/models';
import { Icon } from '../../shared/icon';
import { Spinner } from '../../shared/spinner';
import { buildCsv } from '../../utils/csv';
import { todayISO } from '../../utils/dates';
import { DATE_PRESETS, matchPreset, presetRange, type PresetId } from '../../utils/date-presets';
import { formatBytes, formatCurrency, formatDate, pluralize } from '../../utils/format';
import { DataExport, ExportLoadError } from './data-export';
import { buildJson } from './export-formatters';
import { selectExpenses, summarizeSelection } from './export-select';
import { FORMATS, type ExportFilters, type ExportFormat } from './export-types';
import { defaultBaseName, fullFilename, validateFilename } from './filename';

type ExportStatus =
  | { kind: 'idle' }
  | { kind: 'exporting' }
  | { kind: 'success'; filename: string; bytes: number }
  | { kind: 'error'; message: string; /** False when only a page reload can fix it. */ retryable: boolean };

/** The table preview stays fast for large data sets; the export always includes every row. */
const PREVIEW_ROWS = 50;
const RAW_PREVIEW_ROWS = 4;

@Component({
  selector: 'app-export-dialog',
  imports: [Icon, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './export-dialog.html',
})
export class ExportDialog {
  private readonly controller = inject(ExportDialogController);
  private readonly store = inject(ExpenseStore);
  private readonly exporter = inject(DataExport);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  /** Bumped on every open and every export so a late result can't update a newer session. */
  private runId = 0;

  protected readonly formats = FORMATS;
  protected readonly categories = CATEGORIES;
  protected readonly presets = DATE_PRESETS;
  protected readonly formatCurrency = formatCurrency;
  protected readonly categoryColor = categoryColor;
  protected readonly pluralize = pluralize;
  protected readonly formatBytes = formatBytes;
  protected readonly formatDate = formatDate;

  // ---- Options ----
  protected readonly format = signal<ExportFormat>('csv');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly selected = signal<readonly Category[]>(CATEGORIES);
  protected readonly baseName = signal(defaultBaseName());
  protected readonly previewMode = signal<'table' | 'raw'>('table');
  protected readonly status = signal<ExportStatus>({ kind: 'idle' });
  protected readonly maxDate = signal(todayISO());

  // ---- Derived ----
  protected readonly formatInfo = computed(() => FORMATS.find((f) => f.id === this.format())!);
  protected readonly rangeInvalid = computed(() => !!this.from() && !!this.to() && this.from() > this.to());
  protected readonly activePreset = computed(() => matchPreset(this.from(), this.to()));

  private readonly filters = computed<ExportFilters>(() => ({
    from: this.from(),
    to: this.to(),
    categories: this.selected(),
  }));

  /** Records in the chosen date range, ignoring the category choice (drives the per-category counts). */
  protected readonly categoryCounts = computed(() => {
    const counts = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
    if (this.rangeInvalid()) return counts;
    const inRange = selectExpenses(this.store.expenses(), { ...this.filters(), categories: CATEGORIES });
    for (const e of inRange) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return counts;
  });

  protected readonly rows = computed<Expense[]>(() =>
    this.rangeInvalid() ? [] : selectExpenses(this.store.expenses(), this.filters()),
  );
  protected readonly summary = computed(() => summarizeSelection(this.rows()));
  protected readonly previewRows = computed(() => this.rows().slice(0, PREVIEW_ROWS));
  protected readonly hiddenRows = computed(() => Math.max(this.rows().length - PREVIEW_ROWS, 0));

  protected readonly filenameError = computed(() => validateFilename(this.baseName()));
  protected readonly filename = computed(() => fullFilename(this.baseName(), this.formatInfo().extension));

  /** The first few lines of the real file, so power users can check the exact output. */
  protected readonly rawPreview = computed(() => {
    const rows = this.rows();
    if (this.format() === 'json') {
      const text = buildJson(rows, { filters: this.filters(), exportedAt: new Date() }, RAW_PREVIEW_ROWS);
      return text;
    }
    return buildCsv(rows.slice(0, RAW_PREVIEW_ROWS * 2)).trimEnd();
  });
  protected readonly rawIsTruncated = computed(
    () => this.rows().length > (this.format() === 'json' ? RAW_PREVIEW_ROWS : RAW_PREVIEW_ROWS * 2),
  );

  /** Why the Export button is disabled, in plain words. */
  protected readonly blockedReason = computed(() => {
    if (this.rangeInvalid()) return 'The start date is after the end date.';
    if (this.selected().length === 0) return 'Select at least one category.';
    if (this.rows().length === 0) return 'No expenses match these filters.';
    return this.filenameError();
  });
  protected readonly busy = computed(() => this.status().kind === 'exporting');
  protected readonly canExport = computed(() => this.blockedReason() === null && !this.busy());
  /** After a failed library load the primary button becomes "Reload page". */
  protected readonly needsReload = computed(() => {
    const status = this.status();
    return status.kind === 'error' && !status.retryable;
  });

  constructor() {
    // Open/close the native <dialog> to follow the controller.
    effect(() => {
      const open = this.controller.isOpen();
      const el = this.dialogEl()?.nativeElement;
      if (!el) return;
      if (open) {
        untracked(() => {
          if (el.open) return;
          this.reset();
          el.showModal();
          // Put focus on the selected format so the dialog is keyboard-ready.
          setTimeout(() => el.querySelector<HTMLElement>('input[name="export-format"]:checked')?.focus());
        });
      } else if (el.open) {
        el.close();
      }
    });

    // A finished/failed export no longer describes the options once they change.
    effect(() => {
      this.format();
      this.from();
      this.to();
      this.selected();
      this.baseName();
      untracked(() => {
        if (this.status().kind !== 'exporting') this.status.set({ kind: 'idle' });
      });
    });
  }

  // ---- Handlers ----
  protected close(): void {
    this.controller.close();
  }

  protected onBackdropClick(event: MouseEvent): void {
    if (event.target === this.dialogEl()?.nativeElement) this.close();
  }

  protected applyPreset(id: PresetId): void {
    const { from, to } = presetRange(id);
    this.from.set(from);
    this.to.set(to);
  }

  protected isSelected(category: Category): boolean {
    return this.selected().includes(category);
  }

  protected toggleCategory(category: Category): void {
    this.selected.update((current) =>
      current.includes(category) ? current.filter((c) => c !== category) : CATEGORIES.filter((c) => c === category || current.includes(c)),
    );
  }

  protected selectAllCategories(): void {
    this.selected.set(CATEGORIES);
  }

  protected clearCategories(): void {
    this.selected.set([]);
  }

  /** Values as they will appear in the file, so the preview never disagrees with the download. */
  protected displayDate(iso: string): string {
    return this.format() === 'pdf' ? formatDate(iso) : iso;
  }

  protected displayAmount(amount: number): string {
    return this.format() === 'pdf' ? formatCurrency(amount) : amount.toFixed(2);
  }

  protected async export(): Promise<void> {
    if (!this.canExport()) return;

    const run = ++this.runId;
    const format = this.format();
    this.status.set({ kind: 'exporting' });

    try {
      const result = await this.exporter.export(this.rows(), {
        format,
        filename: this.filename(),
        filters: this.filters(),
      });
      if (run === this.runId) this.status.set({ kind: 'success', ...result });
    } catch (error) {
      console.error('Export failed', error);
      if (run !== this.runId) return;
      this.status.set(
        error instanceof ExportLoadError
          ? {
              kind: 'error',
              retryable: false,
              message: 'Couldn’t load the PDF generator. Check your connection, then reload the page. Your expenses are saved.',
            }
          : { kind: 'error', retryable: true, message: `The ${format.toUpperCase()} export failed. Please try again.` },
      );
    }
  }

  protected reloadPage(): void {
    location.reload();
  }

  private reset(): void {
    this.runId++;
    this.from.set('');
    this.to.set('');
    this.selected.set(CATEGORIES);
    this.baseName.set(defaultBaseName());
    this.previewMode.set('table');
    this.maxDate.set(todayISO());
    this.status.set({ kind: 'idle' });
    // `format` is kept, so the dialog reopens on the format that was used last.
  }
}
