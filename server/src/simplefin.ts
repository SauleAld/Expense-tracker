/**
 * A small client for the SimpleFIN Bridge protocol (https://www.simplefin.org/protocol.html):
 * claim a setup token for an access URL, then read accounts and transactions with HTTP Basic auth.
 */

export type SimpleFinErrorKind = 'invalid-token' | 'claim-used' | 'payment' | 'auth' | 'network' | 'bad-response';

/** A failure whose message is safe and useful to show to the user. It never contains credentials. */
export class SimpleFinError extends Error {
  kind: SimpleFinErrorKind;
  constructor(kind: SimpleFinErrorKind, message: string) {
    super(message);
    this.name = 'SimpleFinError';
    this.kind = kind;
  }
}

type FetchFn = typeof fetch;

const isLoopback = (host: string) => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

/** Only https is accepted (plus plain http to the local machine, for a test bridge). */
function checkedUrl(text: string, what: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new SimpleFinError('invalid-token', `That doesn’t look like a valid ${what}.`);
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLoopback(url.hostname))) {
    throw new SimpleFinError('invalid-token', `The ${what} must use https.`);
  }
  return url;
}

/** A setup token is a base64-encoded claim URL. */
export function decodeSetupToken(token: string): string {
  const cleaned = token.trim().replace(/\s+/g, '');
  if (!cleaned) throw new SimpleFinError('invalid-token', 'Paste your SimpleFIN setup token first.');
  const decoded = Buffer.from(cleaned, 'base64').toString('utf8');
  return checkedUrl(decoded, 'setup token').toString();
}

/** Trades a setup token for an access URL (which embeds credentials). A token works only once. */
export async function claimSetupToken(token: string, fetchFn: FetchFn = fetch): Promise<string> {
  const claimUrl = decodeSetupToken(token);
  let response: Response;
  try {
    response = await fetchFn(claimUrl, { method: 'POST', signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new SimpleFinError('network', 'Could not reach SimpleFIN Bridge. Check your internet connection.');
  }
  if (response.status === 403) {
    throw new SimpleFinError('claim-used', 'SimpleFIN says this setup token was already used or doesn’t exist. Create a new one at bridge.simplefin.org.');
  }
  if (!response.ok) throw new SimpleFinError('bad-response', `SimpleFIN Bridge answered with an error (HTTP ${response.status}).`);
  const accessUrl = (await response.text()).trim();
  try {
    checkedUrl(accessUrl, 'access URL');
  } catch {
    throw new SimpleFinError('bad-response', 'SimpleFIN Bridge returned something that isn’t an access URL.');
  }
  return accessUrl;
}

// ---- Reading accounts ----

export interface ParsedAccount {
  id: string;
  name: string;
  org: string;
  currency: string;
  balance: number;
  /** Unix seconds, or null. */
  balanceDate: number | null;
}

export interface ParsedTransaction {
  /** Namespaced with the account, because ids are only guaranteed unique within one. */
  id: string;
  accountId: string;
  accountName: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Signed dollars: negative is money out. */
  amount: number;
  description: string;
  pending: boolean;
}

export interface ParsedAccountSet {
  accounts: ParsedAccount[];
  transactions: ParsedTransaction[];
  /** Messages from the bridge (for example a bank that needs you to sign in again) and unreadable rows. */
  warnings: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Amounts arrive as numeric strings. */
function parseMoney(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

/** The local calendar day for a Unix timestamp in seconds. */
export function epochToLocalDate(seconds: number): string {
  const d = new Date(seconds * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Understands the current (v2: `errlist`, `connections`) and the older (v1: `errors`, `org`) formats. */
export function parseAccountSet(json: unknown): ParsedAccountSet {
  const set = isObject(json) ? json : {};
  const warnings: string[] = [];

  for (const e of Array.isArray(set['errlist']) ? set['errlist'] : []) {
    if (isObject(e) && str(e['msg'])) warnings.push(str(e['code']) ? `${str(e['code'])}: ${str(e['msg'])}` : str(e['msg']));
  }
  for (const e of Array.isArray(set['errors']) ? set['errors'] : []) if (typeof e === 'string' && e) warnings.push(e);

  const connectionNames = new Map<string, string>();
  for (const c of Array.isArray(set['connections']) ? set['connections'] : []) {
    if (isObject(c) && str(c['conn_id'])) connectionNames.set(str(c['conn_id']), str(c['name']) || str(c['org_id']));
  }

  const accounts: ParsedAccount[] = [];
  const transactions: ParsedTransaction[] = [];
  let unreadable = 0;

  for (const a of Array.isArray(set['accounts']) ? set['accounts'] : []) {
    if (!isObject(a) || !str(a['id'])) continue;
    const id = str(a['id']);
    const name = str(a['name']) || 'Account';
    const legacyOrg = isObject(a['org']) ? str(a['org']['name']) || str(a['org']['domain']) : '';
    const balanceDate = typeof a['balance-date'] === 'number' ? a['balance-date'] : null;
    accounts.push({
      id,
      name,
      org: connectionNames.get(str(a['conn_id'])) || legacyOrg,
      currency: str(a['currency']) || 'USD',
      balance: parseMoney(a['balance']) ?? 0,
      balanceDate,
    });

    for (const t of Array.isArray(a['transactions']) ? a['transactions'] : []) {
      const amount = isObject(t) ? parseMoney(t['amount']) : null;
      const posted = isObject(t) && typeof t['posted'] === 'number' ? t['posted'] : null;
      if (!isObject(t) || !str(t['id']) || amount === null || posted === null) {
        unreadable++;
        continue;
      }
      // When the purchase happened matches how you would enter it; posting can lag by days.
      const when = typeof t['transacted_at'] === 'number' && t['transacted_at'] > 0 ? t['transacted_at'] : posted;
      transactions.push({
        id: `sf:${id}:${str(t['id'])}`,
        accountId: id,
        accountName: name,
        date: epochToLocalDate(when),
        amount,
        description: str(t['description']).replace(/\s+/g, ' ').trim(),
        pending: t['pending'] === true,
      });
    }
  }
  if (unreadable > 0) warnings.push(`${unreadable} ${unreadable === 1 ? 'transaction was' : 'transactions were'} unreadable and skipped.`);
  return { accounts, transactions, warnings };
}

export interface FetchAccountsOptions {
  /** Unix seconds; transactions on or after this. */
  startDate?: number;
  fetchFn?: FetchFn;
}

/** Reads posted transactions (pending ones are left out unless asked for, and we never ask). */
export async function fetchAccounts(accessUrl: string, options: FetchAccountsOptions = {}): Promise<ParsedAccountSet> {
  const fetchFn = options.fetchFn ?? fetch;
  const url = checkedUrl(accessUrl, 'access URL');

  // fetch() refuses URLs with credentials in them, so they move into an Authorization header.
  const credentials = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
  url.username = '';
  url.password = '';
  url.pathname = `${url.pathname.replace(/\/$/, '')}/accounts`;
  url.searchParams.set('version', '2');
  if (options.startDate !== undefined) url.searchParams.set('start-date', String(Math.floor(options.startDate)));

  let response: Response;
  try {
    response = await fetchFn(url, {
      headers: { Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new SimpleFinError('network', 'Could not reach SimpleFIN Bridge. Check your internet connection.');
  }
  if (response.status === 402) {
    throw new SimpleFinError('payment', 'SimpleFIN says payment is required. Check your subscription at bridge.simplefin.org.');
  }
  if (response.status === 403) {
    throw new SimpleFinError('auth', 'SimpleFIN rejected the saved access (it may have been revoked). Disconnect and connect again with a new setup token.');
  }
  if (!response.ok) throw new SimpleFinError('bad-response', `SimpleFIN Bridge answered with an error (HTTP ${response.status}).`);

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    throw new SimpleFinError('bad-response', 'SimpleFIN Bridge sent a response that could not be read.');
  }
  return parseAccountSet(json);
}
