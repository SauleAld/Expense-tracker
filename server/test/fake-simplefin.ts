/**
 * A stand-in for SimpleFIN Bridge that speaks the real protocol (claim a token once, Basic auth,
 * start-date / end-date / pending filtering, v2 response). It is used by the tests, and can be run
 * on its own to try the whole flow without linking a bank:
 *
 *   node server/test/fake-simplefin.ts        (prints a setup token to paste into the app)
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { fileURLToPath } from 'node:url';

export interface FakeTransaction {
  id: string;
  posted: number;
  amount: string;
  description: string;
  transacted_at?: number;
  pending?: boolean;
}

export interface FakeAccount {
  id: string;
  name: string;
  conn_id: string;
  currency: string;
  balance: string;
  'balance-date': number;
  transactions: FakeTransaction[];
}

export interface FakeBridge {
  /** e.g. `http://127.0.0.1:41234` */
  url: string;
  /** A fresh, unused setup token (base64 of a claim URL). */
  setupToken(): string;
  accounts: FakeAccount[];
  errlist: { code: string; msg: string }[];
  /** Milliseconds to wait before answering, to imitate a real network. */
  delayMs: number;
  /** How the accounts endpoint behaves. */
  mode: 'ok' | 'payment' | 'forbidden' | 'error' | 'garbage';
  requests: { method: string; path: string; query: Record<string, string>; authorization: string | undefined }[];
  close(): Promise<void>;
}

const USER = 'demo';
const PASSWORD = 'secret';
let counter = 0;

const seconds = (d: Date) => Math.floor(d.getTime() / 1000);

/** A believable checking account and card, dated relative to `now`. */
export function demoAccounts(now: Date = new Date()): FakeAccount[] {
  const daysAgo = (n: number, hour = 12) => seconds(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n, hour));
  return [
    {
      id: 'ACT-checking',
      name: 'Everyday Checking',
      conn_id: 'CONN-1',
      currency: 'USD',
      balance: '2413.87',
      'balance-date': seconds(now),
      transactions: [
        { id: 't1', posted: daysAgo(1), amount: '-45.20', description: 'TRADER JOES #123 SAN FRANCISCO CA' },
        { id: 't2', posted: daysAgo(2), amount: '-38.10', description: 'SHELL OIL 57444' },
        { id: 't3', posted: daysAgo(3), amount: '-15.99', description: 'NETFLIX.COM' },
        { id: 't4', posted: daysAgo(4), amount: '2500.00', description: 'ACME CORP PAYROLL' },
        { id: 't5', posted: daysAgo(5), amount: '-1450.00', description: 'RENT PAYMENT' },
        { id: 't6', posted: daysAgo(6), amount: '-200.00', description: 'ONLINE TRANSFER TO SAVINGS' },
        { id: 't7', posted: daysAgo(7), amount: '-6.75', description: 'SQ *BLUE BOTTLE COFFEE' },
      ],
    },
    {
      id: 'ACT-card',
      name: 'Rewards Card',
      conn_id: 'CONN-2',
      currency: 'USD',
      balance: '-312.40',
      'balance-date': seconds(now),
      transactions: [
        { id: 'c1', posted: daysAgo(1), amount: '-32.99', description: 'AMAZON MKTPLACE PMTS' },
        { id: 'c2', posted: daysAgo(2), amount: '-18.50', description: 'UBER *TRIP' },
        { id: 'c3', posted: daysAgo(3), amount: '500.00', description: 'PAYMENT THANK YOU' },
      ],
    },
  ];
}

export async function startFakeBridge(options: { port?: number; accounts?: FakeAccount[] } = {}): Promise<FakeBridge> {
  const claimable = new Set<string>();
  const claimed = new Set<string>();
  let base = '';

  const bridge: FakeBridge = {
    url: '',
    setupToken() {
      const id = `token-${++counter}`;
      claimable.add(id);
      return Buffer.from(`${base}/simplefin/claim/${id}`).toString('base64');
    },
    accounts: options.accounts ?? demoAccounts(),
    errlist: [],
    delayMs: 0,
    mode: 'ok',
    requests: [],
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };

  const handle = (req: http.IncomingMessage, res: http.ServerResponse) => {
    const url = new URL(req.url ?? '/', 'http://x');
    const query = Object.fromEntries(url.searchParams);
    bridge.requests.push({ method: req.method ?? 'GET', path: url.pathname, query, authorization: req.headers.authorization });
    const text = (status: number, body: string) => {
      res.writeHead(status, { 'Content-Type': 'text/plain' });
      res.end(body);
    };

    const claim = /^\/simplefin\/claim\/([^/]+)$/.exec(url.pathname);
    if (req.method === 'POST' && claim) {
      const id = claim[1]!;
      if (!claimable.has(id) || claimed.has(id)) return text(403, 'already claimed or unknown');
      claimed.add(id);
      return text(200, `http://${USER}:${PASSWORD}@${base.replace('http://', '')}/simplefin`);
    }

    if (req.method === 'GET' && url.pathname === '/simplefin/accounts') {
      const expected = `Basic ${Buffer.from(`${USER}:${PASSWORD}`).toString('base64')}`;
      if (req.headers.authorization !== expected || bridge.mode === 'forbidden') return text(403, 'forbidden');
      if (bridge.mode === 'payment') return text(402, 'payment required');
      if (bridge.mode === 'error') return text(500, 'boom');
      if (bridge.mode === 'garbage') return text(200, '<html>not json</html>');

      const start = query['start-date'] ? Number(query['start-date']) : -Infinity;
      const end = query['end-date'] ? Number(query['end-date']) : Infinity;
      const withPending = query['pending'] === '1';
      const accounts = query['balances-only'] === '1'
        ? bridge.accounts.map(({ transactions: _t, ...rest }) => rest)
        : bridge.accounts.map((a) => ({
            ...a,
            transactions: a.transactions.filter((t) => t.posted >= start && t.posted < end && (withPending || !t.pending)),
          }));
      const connections = [...new Set(bridge.accounts.map((a) => a.conn_id))].map((conn_id, i) => ({
        conn_id,
        name: i === 0 ? 'First Demo Bank' : 'Second Demo Bank',
        org_id: `org-${i}`,
        sfin_url: `${base}/simplefin`,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return void res.end(JSON.stringify({ errlist: bridge.errlist, connections, accounts }));
    }
    text(404, 'not found');
  };
  const server = http.createServer((req, res) => (bridge.delayMs > 0 ? void setTimeout(() => handle(req, res), bridge.delayMs) : handle(req, res)));

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  bridge.url = base;
  return bridge;
}

// Run directly: a bridge you can point the app at.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env['PORT']) || 4400;
  const bridge = await startFakeBridge({ port });
  console.log(`Fake SimpleFIN Bridge on ${bridge.url}\n\nSetup token (works once; restart for another):\n${bridge.setupToken()}\n`);
}
