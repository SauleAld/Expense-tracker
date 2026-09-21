import { describe, expect, it } from 'vitest';
import { claimSetupToken, decodeSetupToken, epochToLocalDate, fetchAccounts, parseAccountSet, SimpleFinError } from './simplefin.ts';

const b64 = (s: string) => Buffer.from(s).toString('base64');
const response = (status: number, body: string) => new Response(body, { status });

describe('decodeSetupToken', () => {
  it('decodes a base64 claim URL, tolerating whitespace', () => {
    const token = b64('https://bridge.simplefin.org/simplefin/claim/abc');
    expect(decodeSetupToken(` ${token.slice(0, 10)}\n${token.slice(10)} `)).toBe('https://bridge.simplefin.org/simplefin/claim/abc');
  });

  it('allows plain http only to the local machine', () => {
    expect(decodeSetupToken(b64('http://127.0.0.1:4400/x'))).toContain('127.0.0.1');
    expect(() => decodeSetupToken(b64('http://example.com/claim/x'))).toThrow(/https/);
  });

  it.each(['', '   ', '!!!not base64!!!', b64('just some text'), b64('ftp://example.com/x')])('rejects %j', (token) => {
    expect(() => decodeSetupToken(token)).toThrow(SimpleFinError);
  });
});

describe('claimSetupToken', () => {
  const token = b64('https://bridge.simplefin.org/simplefin/claim/abc');

  it('POSTs to the decoded claim URL and returns the access URL', async () => {
    let seen: { url: string; method?: string } | undefined;
    const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
      seen = { url: String(url), method: init?.method };
      return response(200, ' https://user:pass@bridge.simplefin.org/simplefin\n');
    }) as typeof fetch;
    expect(await claimSetupToken(token, fetchFn)).toBe('https://user:pass@bridge.simplefin.org/simplefin');
    expect(seen).toEqual({ url: 'https://bridge.simplefin.org/simplefin/claim/abc', method: 'POST' });
  });

  it('explains a token that was already used (403)', async () => {
    await expect(claimSetupToken(token, (async () => response(403, '')) as typeof fetch)).rejects.toMatchObject({ kind: 'claim-used' });
  });

  it('reports network trouble and odd responses', async () => {
    await expect(claimSetupToken(token, (async () => { throw new TypeError('offline'); }) as typeof fetch)).rejects.toMatchObject({ kind: 'network' });
    await expect(claimSetupToken(token, (async () => response(500, '')) as typeof fetch)).rejects.toMatchObject({ kind: 'bad-response' });
    await expect(claimSetupToken(token, (async () => response(200, 'not a url')) as typeof fetch)).rejects.toMatchObject({ kind: 'bad-response' });
  });
});

describe('fetchAccounts', () => {
  const empty = JSON.stringify({ errlist: [], connections: [], accounts: [] });

  it('sends the credentials as a Basic auth header, never in the URL', async () => {
    let seenUrl: URL | undefined;
    let seenAuth: string | undefined;
    const fetchFn = (async (url: URL, init?: RequestInit) => {
      seenUrl = url;
      seenAuth = (init?.headers as Record<string, string>)['Authorization'];
      return response(200, empty);
    }) as unknown as typeof fetch;
    await fetchAccounts('https://us%40er:p%3Ass@bridge.simplefin.org/simplefin', { startDate: 1_700_000_000.9, fetchFn });
    expect(seenUrl!.username).toBe('');
    expect(seenUrl!.password).toBe('');
    expect(seenUrl!.toString()).toBe('https://bridge.simplefin.org/simplefin/accounts?version=2&start-date=1700000000');
    expect(seenAuth).toBe(`Basic ${Buffer.from('us@er:p:ss').toString('base64')}`);
  });

  it('omits start-date when not given, and copes with a trailing slash', async () => {
    let seen = '';
    const fetchFn = (async (url: URL) => ((seen = url.toString()), response(200, empty))) as unknown as typeof fetch;
    await fetchAccounts('https://u:p@host.example/simplefin/', { fetchFn });
    expect(seen).toBe('https://host.example/simplefin/accounts?version=2');
  });

  it.each([
    [402, 'payment'],
    [403, 'auth'],
    [500, 'bad-response'],
  ] as const)('maps HTTP %i to %s', async (status, kind) => {
    await expect(fetchAccounts('https://u:p@h.example/s', { fetchFn: (async () => response(status, '')) as typeof fetch })).rejects.toMatchObject({ kind });
  });

  it('maps network failure and unreadable JSON', async () => {
    await expect(fetchAccounts('https://u:p@h.example/s', { fetchFn: (async () => { throw new Error('x'); }) as typeof fetch })).rejects.toMatchObject({ kind: 'network' });
    await expect(fetchAccounts('https://u:p@h.example/s', { fetchFn: (async () => response(200, '<html>')) as typeof fetch })).rejects.toMatchObject({ kind: 'bad-response' });
  });

  it('never puts the credentials in an error message', async () => {
    const error = await fetchAccounts('https://topsecret:hunter2@h.example/s', { fetchFn: (async () => response(403, '')) as typeof fetch }).catch((e: Error) => e);
    expect(String((error as Error).message)).not.toMatch(/topsecret|hunter2/);
  });
});

describe('parseAccountSet', () => {
  const noon = (y: number, m: number, d: number) => Math.floor(new Date(y, m - 1, d, 12).getTime() / 1000);
  const v2 = {
    errlist: [{ code: 'con.auth', msg: 'Sign in again at your bank', conn_id: 'C1' }],
    connections: [{ conn_id: 'C1', name: 'Demo Bank', org_id: 'o1', sfin_url: 'x' }],
    accounts: [
      {
        id: 'A1',
        name: 'Checking',
        conn_id: 'C1',
        currency: 'USD',
        balance: '1234.50',
        'balance-date': noon(2026, 9, 20),
        transactions: [
          { id: 'T1', posted: noon(2026, 9, 10), amount: '-12.34', description: '  COFFEE   SHOP ' },
          { id: 'T2', posted: noon(2026, 9, 10), transacted_at: noon(2026, 9, 8), amount: '100', description: 'Deposit' },
          { id: 'T3', posted: noon(2026, 9, 11), amount: '-5', description: 'Pending thing', pending: true },
          { id: '', posted: noon(2026, 9, 11), amount: '-5', description: 'no id' },
          { id: 'T5', posted: noon(2026, 9, 11), amount: 'abc', description: 'bad amount' },
          { id: 'T6', amount: '-5', description: 'no date' },
        ],
      },
    ],
  };

  it('reads the v2 format: connections, string amounts, namespaced ids, cleaned descriptions', () => {
    const { accounts, transactions } = parseAccountSet(v2);
    expect(accounts).toEqual([{ id: 'A1', name: 'Checking', org: 'Demo Bank', currency: 'USD', balance: 1234.5, balanceDate: noon(2026, 9, 20) }]);
    expect(transactions[0]).toEqual({ id: 'sf:A1:T1', accountId: 'A1', accountName: 'Checking', date: '2026-09-10', amount: -12.34, description: 'COFFEE SHOP', pending: false });
  });

  it('uses the purchase date (transacted_at) when there is one, otherwise the posted date', () => {
    const { transactions } = parseAccountSet(v2);
    expect(transactions.find((t) => t.id === 'sf:A1:T2')!.date).toBe('2026-09-08');
  });

  it('keeps the pending flag, and skips unreadable rows with a warning', () => {
    const { transactions, warnings } = parseAccountSet(v2);
    expect(transactions.map((t) => t.id)).toEqual(['sf:A1:T1', 'sf:A1:T2', 'sf:A1:T3']);
    expect(transactions.find((t) => t.id === 'sf:A1:T3')!.pending).toBe(true);
    expect(warnings).toContain('3 transactions were unreadable and skipped.');
  });

  it('passes on messages from the bridge', () => {
    expect(parseAccountSet(v2).warnings).toContain('con.auth: Sign in again at your bank');
  });

  it('still understands the older v1 format (string errors, org)', () => {
    const v1 = { errors: ['Bank X needs attention'], accounts: [{ id: 'A', name: 'Old', org: { name: 'Legacy Bank' }, currency: 'USD', balance: '5', transactions: [{ id: 'x', posted: noon(2026, 9, 1), amount: '-1', description: 'd' }] }] };
    const { accounts, warnings, transactions } = parseAccountSet(v1);
    expect(accounts[0]!.org).toBe('Legacy Bank');
    expect(warnings).toEqual(['Bank X needs attention']);
    expect(transactions).toHaveLength(1);
  });

  it.each([null, undefined, 5, 'x', [], {}, { accounts: 'nope' }])('survives nonsense: %j', (input) => {
    expect(parseAccountSet(input)).toEqual({ accounts: [], transactions: [], warnings: [] });
  });

  it('rounds unexpected extra decimals to cents (banks send exactly two, so this is only defensive)', () => {
    const tx = (id: string, amount: string) => ({ id, posted: noon(2026, 9, 1), amount, description: 'd' });
    const set = { accounts: [{ id: 'A', name: 'x', currency: 'USD', balance: '0', transactions: [tx('a', '-10.126'), tx('b', '12.3456'), tx('c', '-0.30')] }] };
    expect(parseAccountSet(set).transactions.map((t) => t.amount)).toEqual([-10.13, 12.35, -0.3]);
  });
});

describe('epochToLocalDate', () => {
  it('gives the local calendar day, at the edges of the day too', () => {
    expect(epochToLocalDate(new Date(2026, 8, 10, 0, 0, 1).getTime() / 1000)).toBe('2026-09-10');
    expect(epochToLocalDate(new Date(2026, 8, 10, 23, 59, 59).getTime() / 1000)).toBe('2026-09-10');
    expect(epochToLocalDate(new Date(2027, 0, 1, 0, 0, 0).getTime() / 1000)).toBe('2027-01-01');
  });
});
