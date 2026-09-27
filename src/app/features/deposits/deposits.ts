import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DepositStore } from '../../core/deposit-store';
import type { Deposit } from '../../core/models';
import { ToastService } from '../../core/toast';
import { Icon } from '../../shared/icon';
import { StatCard } from '../../shared/stat-card';
import { buildDepositsCsv, downloadCsv } from '../../utils/csv';
import { PRESETS, presetRange, type PresetId } from '../../utils/date-presets';
import { todayISO } from '../../utils/dates';
import { filterDeposits, sumDeposits, type DepositFilters } from '../../utils/deposits';
import { formatCurrency, formatDate, formatMonth, pluralize } from '../../utils/format';

const PAGE_SIZE = 25;

@Component({
  selector: 'app-deposits',
  imports: [RouterLink, Icon, StatCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './deposits.html',
})
export class Deposits {
  private readonly store = inject(DepositStore);
  private readonly toast = inject(ToastService);

  protected readonly presets = PRESETS;
  protected readonly formatCurrency = formatCurrency;
  protected readonly formatDate = formatDate;
  protected readonly pluralize = pluralize;
  protected readonly today = todayISO();
  protected readonly monthLabel = formatMonth(new Date(), 'long');

  protected readonly search = signal('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  private readonly filters = computed<DepositFilters>(() => ({ search: this.search(), from: this.from(), to: this.to() }));

  protected readonly hasAny = computed(() => this.store.count() > 0);
  protected readonly isFiltered = computed(() => this.search().trim() !== '' || this.from() !== '' || this.to() !== '');
  protected readonly rangeInvalid = computed(() => !!this.from() && !!this.to() && this.from() > this.to());

  protected readonly filtered = computed(() => filterDeposits(this.store.deposits(), this.filters()));
  protected readonly total = computed(() => sumDeposits(this.filtered()));

  protected readonly allTime = computed(() => sumDeposits(this.store.deposits()));
  protected readonly allTimeCount = this.store.count;
  private readonly thisMonth = computed(() => {
    const { from, to } = presetRange('month');
    return filterDeposits(this.store.deposits(), { search: '', from, to });
  });
  protected readonly monthTotal = computed(() => sumDeposits(this.thisMonth()));
  protected readonly monthCount = computed(() => this.thisMonth().length);

  /** How many rows are rendered; resets to one page whenever the filters change. */
  protected readonly limit = linkedSignal({ source: () => JSON.stringify(this.filters()), computation: () => PAGE_SIZE });
  protected readonly visible = computed(() => this.filtered().slice(0, this.limit()));
  protected readonly remaining = computed(() => this.filtered().length - this.visible().length);

  protected readonly activePreset = computed<PresetId | null>(() => {
    const from = this.from();
    const to = this.to();
    return PRESETS.find((p) => {
      const range = presetRange(p.id);
      return range.from === from && range.to === to;
    })?.id ?? null;
  });

  protected applyPreset(id: PresetId): void {
    const { from, to } = presetRange(id);
    this.from.set(from);
    this.to.set(to);
  }

  protected clearFilters(): void {
    this.search.set('');
    this.from.set('');
    this.to.set('');
  }

  protected remove(deposit: Deposit): void {
    const removed = this.store.remove(deposit.id);
    if (!removed) return;
    this.toast.show(`Deleted “${removed.description}”`, {
      action: { label: 'Undo', run: () => this.store.restore(removed) },
    });
  }

  protected exportCsv(): void {
    const rows = this.filtered();
    if (rows.length === 0) return;
    try {
      downloadCsv(`spendwise-deposits-${todayISO()}.csv`, buildDepositsCsv(rows));
      this.toast.show(`Exported ${pluralize(rows.length, 'deposit')} to CSV`);
    } catch {
      this.toast.error('Export failed. Please try again.');
    }
  }
}
