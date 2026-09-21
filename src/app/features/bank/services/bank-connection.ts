import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../../core/toast';
import { pluralize } from '../../../utils/format';
import type { BankTransaction } from '../model/bank-transaction';
import { BankApi, BankApiError, type ServerStatus } from './bank-api';
import { BankInbox } from './bank-inbox';

export const CURSOR_STORAGE_KEY = 'spendwise.bank.cursor.v1';
const PULL_EVERY_MS = 5 * 60_000;
const CLOCK_EVERY_MS = 30_000;

export type Phase = 'checking' | 'offline' | 'needs-token' | 'unauthorized' | 'ready';
export type Busy = 'connect' | 'sync' | 'disconnect' | null;

/**
 * Keeps the app in step with the sync server: notices whether it is running and paired, reports
 * its status, and pulls new transactions into the review inbox.
 */
@Injectable({ providedIn: 'root' })
export class BankConnection {
  private readonly api = inject(BankApi);
  private readonly inbox = inject(BankInbox);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  readonly phase = signal<Phase>('checking');
  readonly status = signal<ServerStatus | null>(null);
  readonly busy = signal<Busy>(null);
  /** The last problem to show on the connection card. */
  readonly error = signal<string | null>(null);
  /** Ticks every 30 s so "5 min ago" stays fresh. */
  readonly now = signal(new Date());
  readonly connected = computed(() => this.phase() === 'ready' && this.status()?.connected === true);

  /** Looks at the server now, then keeps watching while the app is open. Safe to call more than once. */
  start(): void {
    if (this.started) return;
    this.started = true;
    void this.refresh();
    const pull = setInterval(() => {
      if (this.connected() && !this.busy()) void this.refresh();
    }, PULL_EVERY_MS);
    const clock = setInterval(() => this.now.set(new Date()), CLOCK_EVERY_MS);
    this.destroyRef.onDestroy(() => {
      clearInterval(pull);
      clearInterval(clock);
    });
  }

  /** Checks the server, and if you are connected, pulls what is new. */
  async refresh(): Promise<void> {
    if (!(await this.api.health())) {
      this.phase.set('offline');
      this.status.set(null);
      return;
    }
    if (!this.api.config().token) {
      this.phase.set('needs-token');
      return;
    }
    try {
      const status = await this.api.status();
      this.applyStatus(status);
      this.phase.set('ready');
      if (status.connected) await this.pull();
    } catch (error) {
      this.handle(error);
    }
  }

  async pair(token: string): Promise<void> {
    this.error.set(null);
    this.api.setToken(token);
    this.phase.set('checking');
    await this.refresh();
  }

  async connect(setupToken: string): Promise<void> {
    await this.run('connect', async () => {
      const { outcome, status } = await this.api.connect(setupToken);
      this.applyStatus(status);
      if (!outcome.ok) return void this.error.set(outcome.message);
      await this.pull();
      this.toast.show('Connected to your bank via SimpleFIN');
    });
  }

  async syncNow(): Promise<void> {
    await this.run('sync', async () => {
      const { outcome, status } = await this.api.sync();
      this.applyStatus(status);
      if (!outcome.ok) return void this.error.set(outcome.message);
      const pulled = await this.pull(false);
      this.toast.show(pulled === 0 ? 'Synced. Nothing new.' : `Synced. ${pluralize(pulled, 'new transaction')} to review.`);
    });
  }

  async disconnect(): Promise<void> {
    await this.run('disconnect', async () => {
      this.applyStatus(await this.api.disconnect());
      this.toast.show('Disconnected from SimpleFIN');
    });
  }

  async setInvertSign(accountId: string, invert: boolean): Promise<void> {
    await this.run(null, async () => this.applyStatus(await this.api.setInvertSign(accountId, invert)));
  }

  /** Reads everything after the last position we saw. Returns how many transactions arrived. */
  async pull(announce = true): Promise<number> {
    let cursor = this.cursor();
    const arrived: BankTransaction[] = [];
    // A cursor ahead of the server means its data was reset; start over (ids stop duplicates).
    if (cursor > (this.status()?.latestSeq ?? Infinity)) cursor = 0;

    for (let guard = 0; guard < 100; guard++) {
      const page = await this.api.transactions(cursor);
      arrived.push(
        ...page.transactions.map<BankTransaction>((t) => ({
          id: t.id,
          accountName: t.accountName,
          date: t.date,
          amount: t.amount,
          description: t.description,
          pending: false,
          source: 'simplefin',
        })),
      );
      cursor = page.latestSeq;
      if (!page.hasMore) break;
    }
    this.setCursor(cursor);
    if (arrived.length === 0) return 0;

    const result = this.inbox.add(arrived);
    if (announce && result.added > 0) {
      this.toast.show(`${pluralize(result.added, 'new transaction')} from your bank to review`);
    }
    return result.added;
  }

  // ---- Internals ----
  private async run(busy: Busy, action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.error.set(null);
    this.busy.set(busy);
    try {
      await action();
    } catch (error) {
      this.handle(error);
    } finally {
      this.busy.set(null);
    }
  }

  private handle(error: unknown): void {
    if (error instanceof BankApiError) {
      if (error.kind === 'offline') this.phase.set('offline');
      else if (error.kind === 'unauthorized') this.phase.set('unauthorized');
      else this.error.set(error.message);
    } else {
      this.error.set('Something went wrong talking to the sync server.');
    }
  }

  private applyStatus(status: ServerStatus): void {
    this.status.set(status);
    if (this.cursor() > status.latestSeq) this.setCursor(0);
  }

  private cursor(): number {
    try {
      const n = Number(localStorage.getItem(CURSOR_STORAGE_KEY));
      return Number.isInteger(n) && n >= 0 ? n : 0;
    } catch {
      return 0;
    }
  }

  private setCursor(value: number): void {
    try {
      localStorage.setItem(CURSOR_STORAGE_KEY, String(value));
    } catch {
      // Worst case, the next pull re-reads and ids prevent duplicates.
    }
  }
}
