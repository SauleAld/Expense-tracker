import type { Config } from './config.ts';
import { claimSetupToken, decodeSetupToken, fetchAccounts, SimpleFinError, type SimpleFinErrorKind } from './simplefin.ts';
import type { StateStore, StoredAccount, StoredTransaction } from './state.ts';

export type SyncFailure = 'not-connected' | 'too-soon' | 'rate-limit' | SimpleFinErrorKind;
export type SyncOutcome = { ok: true; added: number } | { ok: false; code: SyncFailure; message: string };

export interface PublicStatus {
  connected: boolean;
  connectedAt: string | null;
  lastSyncAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  warnings: string[];
  nextSyncAt: string | null;
  autoSync: boolean;
  requestsToday: number;
  requestLimit: number;
  latestSeq: number;
  accounts: { id: string; name: string; org: string; currency: string; balance: number; invertSign: boolean }[];
}

interface Deps {
  fetch?: typeof fetch;
  now?: () => number;
}

const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Each sync re-reads a few days already seen, since banks sometimes post late. Duplicates are ignored by id. */
const OVERLAP_DAYS = 3;
const MAX_STORED = 5000;
const RETRY_AFTER_FAILURE_MS = HOUR;

/** Talks to SimpleFIN on a schedule, under a hard daily request limit, and keeps what it learns. */
export class SyncService {
  private store: StateStore;
  private config: Config;
  private fetchFn: typeof fetch;
  private now: () => number;
  private running: Promise<SyncOutcome> | null = null;

  constructor(store: StateStore, config: Config, deps: Deps = {}) {
    this.store = store;
    this.config = config;
    this.fetchFn = deps.fetch ?? fetch;
    this.now = deps.now ?? Date.now;
  }

  // ---- Status ----

  requestsToday(): number {
    const cutoff = this.now() - DAY;
    return this.store.get().requestLog.filter((t) => t > cutoff).length;
  }

  /** When the next automatic sync is due, or null when there is no connection or auto-sync is off. */
  nextSyncAt(): number | null {
    const s = this.store.get();
    if (!s.accessUrl || !this.config.autoSync) return null;
    const due = s.lastSuccessAt ? Date.parse(s.lastSuccessAt) + this.config.syncEveryMs : this.now();
    const retry = s.lastError && s.lastAttemptAt ? Date.parse(s.lastAttemptAt) + RETRY_AFTER_FAILURE_MS : 0;
    return Math.max(due, retry);
  }

  status(): PublicStatus {
    const s = this.store.get();
    const next = this.nextSyncAt();
    return {
      connected: s.accessUrl !== null,
      connectedAt: s.connectedAt,
      lastSyncAt: s.lastSuccessAt,
      lastAttemptAt: s.lastAttemptAt,
      lastError: s.lastError,
      warnings: s.warnings,
      nextSyncAt: next === null ? null : new Date(next).toISOString(),
      autoSync: this.config.autoSync,
      requestsToday: this.requestsToday(),
      requestLimit: this.config.maxRequestsPerDay,
      latestSeq: s.nextSeq - 1,
      accounts: s.accounts.map(({ id, name, org, currency, balance, invertSign }) => ({ id, name, org, currency, balance, invertSign })),
    };
  }

  // ---- Connecting ----

  async connect(setupToken: string): Promise<SyncOutcome> {
    // A token that can't even be read never reaches SimpleFIN, so it must not cost any of the daily requests.
    try {
      decodeSetupToken(setupToken);
    } catch (error) {
      return this.failure(error);
    }
    const blocked = this.limitReached();
    if (blocked) return blocked;
    this.logRequest();
    try {
      const accessUrl = await claimSetupToken(setupToken, this.fetchFn);
      this.store.update((s) => {
        s.accessUrl = accessUrl;
        s.connectedAt = new Date(this.now()).toISOString();
        s.lastSuccessAt = null; // so the first sync reaches back `initialDays`
        s.lastError = null;
        s.warnings = [];
      });
    } catch (error) {
      return this.failure(error);
    }
    return this.sync('manual', { skipMinInterval: true });
  }

  /** Forgets the connection and its data. The API token and the sequence counter are kept. */
  disconnect(): void {
    this.store.update((s) => {
      s.accessUrl = null;
      s.connectedAt = null;
      s.lastSuccessAt = null;
      s.lastAttemptAt = null;
      s.lastError = null;
      s.warnings = [];
      s.accounts = [];
      s.transactions = [];
    });
  }

  // ---- Syncing ----

  /** Runs a sync. If one is already running, this waits for it rather than starting a second. */
  sync(trigger: 'auto' | 'manual', options: { skipMinInterval?: boolean } = {}): Promise<SyncOutcome> {
    if (this.running) return this.running;
    this.running = this.run(trigger, options).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private limitReached(): SyncOutcome | null {
    if (this.requestsToday() >= this.config.maxRequestsPerDay) {
      return {
        ok: false,
        code: 'rate-limit',
        message: `Daily limit reached (${this.config.maxRequestsPerDay} requests to SimpleFIN in 24 hours). This protects your account; try again later.`,
      };
    }
    return null;
  }

  private logRequest(): void {
    const now = this.now();
    this.store.update((s) => {
      s.requestLog = [...s.requestLog.filter((t) => t > now - DAY), now];
    });
  }

  private failure(error: unknown): SyncOutcome {
    const known = error instanceof SimpleFinError;
    const message = known ? error.message : 'Something went wrong while syncing.';
    if (!known) console.error('Sync failed:', error instanceof Error ? error.message : error);
    return { ok: false, code: known ? error.kind : 'bad-response', message };
  }

  private async run(trigger: 'auto' | 'manual', options: { skipMinInterval?: boolean }): Promise<SyncOutcome> {
    const before = this.store.get();
    if (!before.accessUrl) return { ok: false, code: 'not-connected', message: 'Not connected to SimpleFIN yet.' };

    const now = this.now();
    if (trigger === 'manual' && !options.skipMinInterval && before.lastAttemptAt && now - Date.parse(before.lastAttemptAt) < this.config.minManualIntervalMs) {
      return { ok: false, code: 'too-soon', message: 'You just synced. Give it a minute before syncing again.' };
    }
    const blocked = this.limitReached();
    if (blocked) return blocked;

    const startDate = before.lastSuccessAt
      ? (Date.parse(before.lastSuccessAt) - OVERLAP_DAYS * DAY) / 1000
      : (now - this.config.initialDays * DAY) / 1000;

    this.logRequest();
    this.store.update((s) => {
      s.lastAttemptAt = new Date(now).toISOString();
    });

    try {
      const result = await fetchAccounts(before.accessUrl, { startDate, fetchFn: this.fetchFn });
      let added = 0;
      this.store.update((s) => {
        const known = new Set(s.transactions.map((t) => t.id));
        const fresh: StoredTransaction[] = [];
        // Oldest first, so sequence numbers roughly follow time.
        for (const t of [...result.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
          if (t.pending || known.has(t.id)) continue;
          known.add(t.id);
          fresh.push({ seq: s.nextSeq++, id: t.id, accountId: t.accountId, accountName: t.accountName, date: t.date, amount: t.amount, description: t.description });
        }
        added = fresh.length;
        s.transactions = [...s.transactions, ...fresh].slice(-MAX_STORED);
        s.accounts = result.accounts.map<StoredAccount>((a) => ({
          ...a,
          invertSign: s.accounts.find((old) => old.id === a.id)?.invertSign ?? false,
        }));
        s.lastSuccessAt = new Date(this.now()).toISOString();
        s.lastError = null;
        s.warnings = result.warnings;
      });
      return { ok: true, added };
    } catch (error) {
      const outcome = this.failure(error);
      this.store.update((s) => {
        s.lastError = outcome.ok ? null : outcome.message;
      });
      return outcome;
    }
  }

  // ---- Scheduling ----

  /** Checks now (which catches up if the server was off), then periodically. Returns a stop function. */
  startScheduler(): () => void {
    const check = () => {
      const due = this.nextSyncAt();
      if (due !== null && due <= this.now()) void this.sync('auto');
    };
    check();
    const timer = setInterval(check, this.config.checkEveryMs);
    timer.unref();
    return () => clearInterval(timer);
  }
}
