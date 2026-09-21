import { Injectable, signal } from '@angular/core';

export const SERVER_STORAGE_KEY = 'spendwise.bank.server.v1';
export const DEFAULT_SERVER_URL = 'http://127.0.0.1:3111';

export interface ServerConfig {
  url: string;
  /** The shared secret printed when the sync server starts. */
  token: string;
}

export interface ServerAccount {
  id: string;
  name: string;
  org: string;
  currency: string;
  balance: number;
  invertSign: boolean;
}

export interface ServerStatus {
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
  accounts: ServerAccount[];
}

export interface ServerTransaction {
  seq: number;
  id: string;
  accountName: string;
  date: string;
  amount: number;
  description: string;
}

export type SyncOutcome = { ok: true; added: number } | { ok: false; code: string; message: string };

export type ApiErrorKind = 'offline' | 'unauthorized' | 'rejected' | 'server';

/** The sync server couldn't be used, with a reason the UI can act on. */
export class BankApiError extends Error {
  kind: ApiErrorKind;
  constructor(kind: ApiErrorKind, message: string) {
    super(message);
    this.name = 'BankApiError';
    this.kind = kind;
  }
}

const SHORT_TIMEOUT_MS = 10_000;
/** Connecting and syncing wait on SimpleFIN, which can be slow. */
const LONG_TIMEOUT_MS = 90_000;

/** A thin client for the local sync server (see /server). */
@Injectable({ providedIn: 'root' })
export class BankApi {
  readonly config = signal<ServerConfig>(this.load());

  setToken(token: string): void {
    this.setConfig({ ...this.config(), token: token.trim() });
  }

  setUrl(url: string): void {
    this.setConfig({ ...this.config(), url: url.trim().replace(/\/$/, '') || DEFAULT_SERVER_URL });
  }

  clearToken(): void {
    this.setConfig({ ...this.config(), token: '' });
  }

  /** Is anything answering at the server address? Needs no token. */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config().url}/api/health`, { signal: AbortSignal.timeout(SHORT_TIMEOUT_MS) });
      return response.ok && ((await response.json()) as { ok?: boolean }).ok === true;
    } catch {
      return false;
    }
  }

  status(): Promise<ServerStatus> {
    return this.request<ServerStatus>('GET', '/api/status');
  }

  async connect(setupToken: string): Promise<{ outcome: SyncOutcome; status: ServerStatus }> {
    const { status, ...outcome } = await this.request<SyncOutcome & { status: ServerStatus }>('POST', '/api/connection', { setupToken }, LONG_TIMEOUT_MS);
    return { outcome: outcome as SyncOutcome, status };
  }

  async sync(): Promise<{ outcome: SyncOutcome; status: ServerStatus }> {
    const { status, ...outcome } = await this.request<SyncOutcome & { status: ServerStatus }>('POST', '/api/sync', undefined, LONG_TIMEOUT_MS);
    return { outcome: outcome as SyncOutcome, status };
  }

  async disconnect(): Promise<ServerStatus> {
    return (await this.request<{ status: ServerStatus }>('DELETE', '/api/connection')).status;
  }

  transactions(since: number): Promise<{ transactions: ServerTransaction[]; latestSeq: number; hasMore: boolean }> {
    return this.request('GET', `/api/transactions?since=${since}`);
  }

  setInvertSign(accountId: string, invertSign: boolean): Promise<ServerStatus> {
    return this.request('PATCH', `/api/accounts/${encodeURIComponent(accountId)}`, { invertSign });
  }

  private async request<T>(method: string, path: string, body?: unknown, timeoutMs = SHORT_TIMEOUT_MS): Promise<T> {
    const { url, token } = this.config();
    let response: Response;
    try {
      response = await fetch(`${url}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new BankApiError('offline', 'The sync server isn’t reachable.');
    }
    if (response.status === 401) throw new BankApiError('unauthorized', 'The sync server didn’t accept that token.');
    if (response.status === 403 || response.status === 421) {
      throw new BankApiError('rejected', 'The sync server doesn’t allow this address. Check SPENDWISE_ALLOWED_ORIGINS.');
    }
    if (!response.ok) throw new BankApiError('server', `The sync server reported a problem (HTTP ${response.status}).`);
    return (await response.json()) as T;
  }

  private setConfig(config: ServerConfig): void {
    this.config.set(config);
    try {
      localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify(config));
    } catch {
      // Without storage you just pair again next time.
    }
  }

  private load(): ServerConfig {
    try {
      const data = JSON.parse(localStorage.getItem(SERVER_STORAGE_KEY) ?? 'null') as Partial<ServerConfig> | null;
      return {
        url: typeof data?.url === 'string' && /^https?:\/\//.test(data.url) ? data.url : DEFAULT_SERVER_URL,
        token: typeof data?.token === 'string' ? data.token : '',
      };
    } catch {
      return { url: DEFAULT_SERVER_URL, token: '' };
    }
  }
}
