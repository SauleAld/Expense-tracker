import { Injectable, computed, signal } from '@angular/core';
import { DEMO_ACCOUNT } from '../model/destinations';
import type {
  Connection,
  HistoryEntry,
  ProviderId,
  Schedule,
  ShareLink,
} from '../model/cloud-types';

export const CLOUD_STORAGE_KEY = 'spendwise.cloud.v1';
const HISTORY_LIMIT = 200;

const TEMPLATES = ['tax', 'monthly', 'category', 'ledger'];
const FORMATS = ['csv', 'json', 'pdf'];
const DESTINATIONS = ['download', 'email', 'link', 'sheets', 'gdrive', 'dropbox', 'onedrive'];
const PROVIDERS = ['sheets', 'gdrive', 'dropbox', 'onedrive'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = (v: unknown, list: string[]): boolean => isStr(v) && list.includes(v);

const isConnection = (v: unknown): v is Connection =>
  isObject(v) && oneOf(v['provider'], PROVIDERS) && oneOf(v['status'], ['connected', 'error']) && isStr(v['account']) && isStr(v['connectedAt']);

const isSchedule = (v: unknown): v is Schedule =>
  isObject(v) &&
  isStr(v['id']) &&
  oneOf(v['template'], TEMPLATES) &&
  oneOf(v['format'], FORMATS) &&
  oneOf(v['destination'], DESTINATIONS) &&
  oneOf(v['frequency'], ['daily', 'weekly', 'monthly']) &&
  isStr(v['time']) &&
  isStr(v['nextRunAt']) &&
  isObject(v['options']) &&
  isObject(v['params']);

const isHistory = (v: unknown): v is HistoryEntry =>
  isObject(v) &&
  isStr(v['id']) &&
  isStr(v['at']) &&
  oneOf(v['template'], TEMPLATES) &&
  oneOf(v['destination'], DESTINATIONS) &&
  oneOf(v['status'], ['completed', 'failed']) &&
  isObject(v['request']);

const isShare = (v: unknown): v is ShareLink =>
  isObject(v) && isStr(v['id']) && oneOf(v['template'], TEMPLATES) && isStr(v['createdAt']) && isObject(v['snapshot']);

function newId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Everything the cloud features remember, kept in this browser's localStorage. It stands in for the
 * server a real cloud product would have, which is why share links only work on this device.
 */
@Injectable({ providedIn: 'root' })
export class CloudStore {
  readonly connections = signal<Connection[]>([]);
  readonly schedules = signal<Schedule[]>([]);
  readonly history = signal<HistoryEntry[]>([]);
  readonly shares = signal<ShareLink[]>([]);
  readonly saveError = signal<string | null>(null);

  readonly connectedProviders = computed(() =>
    this.connections().filter((c) => c.status === 'connected').map((c) => c.provider),
  );

  constructor() {
    this.load();
    // Keep other tabs in sync (a share link opened in a new tab updates its view count here).
    globalThis.addEventListener?.('storage', (event) => {
      if (event.key === CLOUD_STORAGE_KEY || event.key === null) this.load();
    });
  }

  newId = newId;

  // ---- Connections ----
  connection(provider: ProviderId): Connection | undefined {
    return this.connections().find((c) => c.provider === provider);
  }

  connect(provider: ProviderId, now: Date = new Date()): Connection {
    const connection: Connection = {
      provider,
      status: 'connected',
      account: DEMO_ACCOUNT,
      connectedAt: now.toISOString(),
      lastSyncAt: null,
    };
    this.connections.update((list) => [...list.filter((c) => c.provider !== provider), connection]);
    this.persist();
    return connection;
  }

  disconnect(provider: ProviderId): void {
    this.connections.update((list) => list.filter((c) => c.provider !== provider));
    this.persist();
  }

  patchConnection(provider: ProviderId, patch: Partial<Connection>): void {
    this.connections.update((list) => list.map((c) => (c.provider === provider ? { ...c, ...patch } : c)));
    this.persist();
  }

  // ---- Schedules ----
  addSchedule(schedule: Schedule): void {
    this.schedules.update((list) => [...list, schedule]);
    this.persist();
  }

  patchSchedule(id: string, patch: Partial<Schedule>): void {
    this.schedules.update((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    this.persist();
  }

  removeSchedule(id: string): void {
    this.schedules.update((list) => list.filter((s) => s.id !== id));
    this.persist();
  }

  // ---- History ----
  addHistory(entry: HistoryEntry): void {
    this.history.update((list) => [entry, ...list].slice(0, HISTORY_LIMIT));
    this.persist();
  }

  clearHistory(): void {
    this.history.set([]);
    this.persist();
  }

  /** Bytes (or rows for Sheets) Spendwise has stored with a provider, from completed exports. */
  usedBytes(provider: ProviderId): number {
    return this.history()
      .filter((h) => h.status === 'completed' && h.destination === provider)
      .reduce((sum, h) => sum + h.bytes, 0);
  }

  // ---- Share links ----
  addShare(link: ShareLink): void {
    this.shares.update((list) => [link, ...list]);
    this.persist();
  }

  share(id: string): ShareLink | undefined {
    return this.shares().find((s) => s.id === id);
  }

  revokeShare(id: string): void {
    this.shares.update((list) => list.map((s) => (s.id === id ? { ...s, revoked: true } : s)));
    this.persist();
  }

  removeShare(id: string): void {
    this.shares.update((list) => list.filter((s) => s.id !== id));
    this.persist();
  }

  recordView(id: string): void {
    this.shares.update((list) => list.map((s) => (s.id === id ? { ...s, views: s.views + 1 } : s)));
    this.persist();
  }

  // ---- Persistence ----
  private persist(): void {
    try {
      localStorage.setItem(
        CLOUD_STORAGE_KEY,
        JSON.stringify({
          connections: this.connections(),
          schedules: this.schedules(),
          history: this.history(),
          shares: this.shares(),
        }),
      );
      this.saveError.set(null);
    } catch {
      this.saveError.set('Your browser blocked saving cloud settings. They will be lost when you reload.');
    }
  }

  private load(): void {
    try {
      const raw = localStorage.getItem(CLOUD_STORAGE_KEY);
      if (raw === null) return this.reset();
      const data: unknown = JSON.parse(raw);
      if (!isObject(data)) return this.reset();
      const list = <T>(value: unknown, guard: (v: unknown) => v is T): T[] =>
        Array.isArray(value) ? value.filter(guard) : [];
      this.connections.set(list(data['connections'], isConnection));
      this.schedules.set(list(data['schedules'], isSchedule));
      this.history.set(list(data['history'], isHistory));
      this.shares.set(list(data['shares'], isShare));
    } catch {
      this.reset();
    }
  }

  private reset(): void {
    this.connections.set([]);
    this.schedules.set([]);
    this.history.set([]);
    this.shares.set([]);
  }
}
