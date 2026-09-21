import crypto from 'node:crypto';
import path from 'node:path';
import { readJson, writeJsonPrivate } from './files.ts';

export interface StoredAccount {
  id: string;
  name: string;
  org: string;
  currency: string;
  balance: number;
  balanceDate: number | null;
  /** For a bank that reports purchases as positive amounts. Applied when transactions are read. */
  invertSign: boolean;
}

export interface StoredTransaction {
  /** Increases with every new transaction, so the app can ask for "everything after N". */
  seq: number;
  id: string;
  accountId: string;
  accountName: string;
  date: string;
  /** As the bank reports it (negative is money out), before any sign inversion. */
  amount: number;
  description: string;
}

export interface State {
  version: 1;
  /** Shared secret between this server and the app; entered once in the app. */
  apiToken: string;
  /** The SimpleFIN access URL. It contains credentials and is never sent to the browser. */
  accessUrl: string | null;
  connectedAt: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  warnings: string[];
  /** When requests to SimpleFIN were made (epoch ms), for the daily limit. */
  requestLog: number[];
  accounts: StoredAccount[];
  transactions: StoredTransaction[];
  nextSeq: number;
}

const arr = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const strOrNull = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

function fresh(): State {
  return {
    version: 1,
    apiToken: crypto.randomBytes(24).toString('hex'),
    accessUrl: null,
    connectedAt: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastError: null,
    warnings: [],
    requestLog: [],
    accounts: [],
    transactions: [],
    nextSeq: 1,
  };
}

/** The server's memory, kept in one private JSON file and rewritten atomically on every change. */
export class StateStore {
  private file: string;
  private state: State;

  constructor(dataDir: string) {
    this.file = path.join(dataDir, 'state.json');
    const stored = readJson<Record<string, unknown>>(this.file, {});
    const base = fresh();
    this.state = {
      ...base,
      apiToken: strOrNull(stored['apiToken']) ?? base.apiToken,
      accessUrl: strOrNull(stored['accessUrl']),
      connectedAt: strOrNull(stored['connectedAt']),
      lastAttemptAt: strOrNull(stored['lastAttemptAt']),
      lastSuccessAt: strOrNull(stored['lastSuccessAt']),
      lastError: strOrNull(stored['lastError']),
      warnings: arr<string>(stored['warnings']).filter((w) => typeof w === 'string'),
      requestLog: arr<number>(stored['requestLog']).filter((t) => typeof t === 'number'),
      accounts: arr<StoredAccount>(stored['accounts']),
      transactions: arr<StoredTransaction>(stored['transactions']),
      nextSeq: typeof stored['nextSeq'] === 'number' && stored['nextSeq'] >= 1 ? stored['nextSeq'] : 1,
    };
    // Write once so a brand-new token survives a restart.
    writeJsonPrivate(this.file, this.state);
  }

  get(): Readonly<State> {
    return this.state;
  }

  update(mutate: (state: State) => void): void {
    mutate(this.state);
    writeJsonPrivate(this.file, this.state);
  }
}
