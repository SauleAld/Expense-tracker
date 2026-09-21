import crypto from 'node:crypto';
import http from 'node:http';
import type { Config } from './config.ts';
import type { StateStore } from './state.ts';
import type { SyncService } from './sync.ts';

const MAX_BODY_BYTES = 16 * 1024;
const PAGE_SIZE = 500;
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message?: string) {
    super(message ?? code);
    this.status = status;
    this.code = code;
  }
}

const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest();

async function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, 'body-too-large');
    chunks.push(chunk as Buffer);
  }
  if (size === 0) return {};
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('not an object');
    return parsed as Record<string, unknown>;
  } catch {
    throw new HttpError(400, 'invalid-json');
  }
}

/**
 * The local API the app talks to. It is only reachable from this computer, needs the shared token,
 * and only answers browsers on the allowed origins.
 */
export function createApiServer(deps: { config: Config; store: StateStore; sync: SyncService }): http.Server {
  const { config, store, sync } = deps;

  const hostAllowed = (host: string | undefined): boolean => {
    // Guards against DNS rebinding: a hostile site pointing its own domain at 127.0.0.1 has a different Host.
    if (!host) return false;
    const name = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0]!;
    return LOOPBACK_HOSTS.has(name);
  };

  const authorized = (req: http.IncomingMessage): boolean => {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return false;
    return crypto.timingSafeEqual(sha256(header.slice(7)), sha256(store.get().apiToken));
  };

  function send(res: http.ServerResponse, status: number, body: unknown, extra: Record<string, string> = {}): void {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(text),
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra,
    });
    res.end(text);
  }

  async function route(req: http.IncomingMessage, res: http.ServerResponse, headers: Record<string, string>): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const method = req.method ?? 'GET';
    const reply = (status: number, body: unknown) => send(res, status, body, headers);

    if (method === 'GET' && url.pathname === '/api/health') return reply(200, { ok: true, app: 'spendwise-sync' });
    if (!url.pathname.startsWith('/api/')) throw new HttpError(404, 'not-found');
    if (!authorized(req)) throw new HttpError(401, 'unauthorized');

    if (method === 'GET' && url.pathname === '/api/status') return reply(200, sync.status());

    if (method === 'POST' && url.pathname === '/api/connection') {
      const body = await readJsonBody(req);
      const token = body['setupToken'];
      if (typeof token !== 'string' || token.length > 4000) throw new HttpError(400, 'invalid-request', 'setupToken must be a string.');
      const outcome = await sync.connect(token);
      return reply(200, { ...outcome, status: sync.status() });
    }

    if (method === 'DELETE' && url.pathname === '/api/connection') {
      sync.disconnect();
      return reply(200, { ok: true, status: sync.status() });
    }

    if (method === 'POST' && url.pathname === '/api/sync') {
      const outcome = await sync.sync('manual');
      return reply(200, { ...outcome, status: sync.status() });
    }

    if (method === 'GET' && url.pathname === '/api/transactions') {
      const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
      const state = store.get();
      const invert = new Map(state.accounts.map((a) => [a.id, a.invertSign]));
      const page = state.transactions.filter((t) => t.seq > since).slice(0, PAGE_SIZE);
      return reply(200, {
        transactions: page.map((t) => ({
          seq: t.seq,
          id: t.id,
          accountName: t.accountName,
          date: t.date,
          amount: invert.get(t.accountId) ? -t.amount : t.amount,
          description: t.description,
        })),
        latestSeq: page.at(-1)?.seq ?? since,
        hasMore: state.transactions.filter((t) => t.seq > since).length > page.length,
      });
    }

    const account = /^\/api\/accounts\/([^/]+)$/.exec(url.pathname);
    if (method === 'PATCH' && account) {
      const body = await readJsonBody(req);
      if (typeof body['invertSign'] !== 'boolean') throw new HttpError(400, 'invalid-request', 'invertSign must be true or false.');
      const id = decodeURIComponent(account[1]!);
      if (!store.get().accounts.some((a) => a.id === id)) throw new HttpError(404, 'not-found');
      store.update((s) => {
        const target = s.accounts.find((a) => a.id === id);
        if (target) target.invertSign = body['invertSign'] === true;
      });
      return reply(200, sync.status());
    }

    throw new HttpError(404, 'not-found');
  }

  return http.createServer((req, res) => {
    void (async () => {
      const cors: Record<string, string> = {};
      try {
        if (!hostAllowed(req.headers.host)) throw new HttpError(421, 'bad-host');

        const origin = req.headers.origin;
        if (origin) {
          if (!config.allowedOrigins.includes(origin)) throw new HttpError(403, 'origin-not-allowed');
          cors['Access-Control-Allow-Origin'] = origin;
          cors['Vary'] = 'Origin';
        }
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            ...cors,
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'authorization, content-type',
            'Access-Control-Max-Age': '600',
          });
          return void res.end();
        }
        await route(req, res, cors);
      } catch (error) {
        if (error instanceof HttpError) return send(res, error.status, { error: error.code, message: error.message }, cors);
        console.error('Unexpected error:', error instanceof Error ? error.message : error);
        send(res, 500, { error: 'server-error' }, cors);
      }
    })();
  });
}
