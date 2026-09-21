import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clock, testConfig } from '../test/helpers.ts';
import { demoAccounts, startFakeBridge, type FakeBridge } from '../test/fake-simplefin.ts';
import { createApiServer } from './http.ts';
import { StateStore } from './state.ts';
import { SyncService } from './sync.ts';

const ORIGIN = 'http://localhost:4200';
let bridge: FakeBridge;
let server: http.Server;
let base: string;
let token: string;
let store: StateStore;
let time: ReturnType<typeof clock>;
const bodies: string[] = [];

beforeEach(async () => {
  bridge = await startFakeBridge({ accounts: demoAccounts(new Date('2026-09-20T15:00:00Z')) });
  const config = testConfig();
  store = new StateStore(config.dataDir);
  time = clock();
  server = createApiServer({ config, store, sync: new SyncService(store, config, { now: time.now }) });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  token = store.get().apiToken;
});
afterEach(async () => {
  await bridge.close();
  await new Promise((r) => server.close(r));
});

interface Call { method?: string; token?: string | null; origin?: string; body?: unknown; rawBody?: string }
async function api(path: string, call: Call = {}) {
  const headers: Record<string, string> = {};
  if (call.token !== null) headers['Authorization'] = `Bearer ${call.token ?? token}`;
  if (call.origin) headers['Origin'] = call.origin;
  if (call.body !== undefined || call.rawBody !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(base + path, {
    method: call.method ?? 'GET',
    headers,
    body: call.rawBody ?? (call.body === undefined ? undefined : JSON.stringify(call.body)),
  });
  const text = await response.text();
  bodies.push(text);
  return { status: response.status, headers: response.headers, json: text ? (JSON.parse(text) as any) : null };
}
const connect = () => api('/api/connection', { method: 'POST', body: { setupToken: bridge.setupToken() } });

describe('access control', () => {
  it('answers a health check to anyone, saying nothing about you', async () => {
    const r = await api('/api/health', { token: null });
    expect(r).toMatchObject({ status: 200, json: { ok: true } });
  });

  it.each([[null], ['wrong'], ['']])('rejects a missing or wrong token (%j)', async (bad) => {
    for (const path of ['/api/status', '/api/transactions', '/api/sync']) {
      expect((await api(path, { token: bad, method: path === '/api/sync' ? 'POST' : 'GET' })).status).toBe(401);
    }
  });

  it('rejects a token that is only a prefix of the real one', async () => {
    expect((await api('/api/status', { token: token.slice(0, 20) })).status).toBe(401);
    expect((await api('/api/status', { token: token + 'x' })).status).toBe(401);
  });

  it('accepts the real token', async () => {
    expect((await api('/api/status')).status).toBe(200);
  });

  it('refuses a request whose Host is not this computer (DNS rebinding)', async () => {
    const status = await new Promise<number>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: (server.address() as AddressInfo).port, path: '/api/health', headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.end();
    });
    expect(status).toBe(421);
  });

  it('answers 404 for anything else', async () => {
    expect((await api('/nope')).status).toBe(404);
    expect((await api('/api/nope')).status).toBe(404);
    expect((await api('/api/status', { method: 'PUT' })).status).toBe(404);
  });
});

describe('CORS', () => {
  it('lets the allowed app origin read responses, and tells caches it varies', async () => {
    const r = await api('/api/status', { origin: ORIGIN });
    expect(r.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(r.headers.get('vary')).toBe('Origin');
  });

  it('refuses any other origin outright, even with a valid token', async () => {
    const r = await api('/api/status', { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(r.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('answers a preflight for the allowed origin, and refuses one from elsewhere', async () => {
    const ok = await fetch(base + '/api/status', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-headers')).toContain('authorization');
    expect(ok.headers.get('access-control-allow-methods')).toContain('DELETE');
    const bad = await fetch(base + '/api/status', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(bad.status).toBe(403);
  });

  it('never wildcards', async () => {
    expect((await api('/api/health', { token: null })).headers.get('access-control-allow-origin')).toBeNull();
  });
});

describe('request handling', () => {
  it('rejects malformed JSON (400) and non-objects', async () => {
    expect((await api('/api/connection', { method: 'POST', rawBody: '{oops' })).status).toBe(400);
    expect((await api('/api/connection', { method: 'POST', rawBody: '[1,2]' })).status).toBe(400);
  });

  it('rejects a setup token that is not a string, or is absurdly long', async () => {
    expect((await api('/api/connection', { method: 'POST', body: { setupToken: 5 } })).status).toBe(400);
    expect((await api('/api/connection', { method: 'POST', body: { setupToken: 'x'.repeat(5000) } })).status).toBe(400);
  });

  it('rejects an oversized body (413)', async () => {
    expect((await api('/api/connection', { method: 'POST', rawBody: JSON.stringify({ setupToken: 'x'.repeat(40_000) }) })).status).toBe(413);
  });
});

describe('the connect / sync / read flow', () => {
  it('connects with a setup token, syncing straight away, and reports status', async () => {
    const r = await connect();
    expect(r.status).toBe(200);
    expect(r.json).toMatchObject({ ok: true, added: 10, status: { connected: true, latestSeq: 10 } });
    expect(r.json.status.accounts.map((a: any) => a.name)).toEqual(['Everyday Checking', 'Rewards Card']);
    const status = (await api('/api/status')).json;
    expect(status).toMatchObject({ connected: true, autoSync: true, requestLimit: 50 });
    expect(status.lastError).toBeNull();
  });

  it('reports a used token as a normal (200) outcome the app can show', async () => {
    const setupToken = bridge.setupToken();
    await api('/api/connection', { method: 'POST', body: { setupToken } });
    const again = await api('/api/connection', { method: 'POST', body: { setupToken } });
    expect(again).toMatchObject({ status: 200, json: { ok: false, code: 'claim-used' } });
  });

  it('serves transactions after a cursor, so the app only fetches what is new', async () => {
    await connect();
    const all = (await api('/api/transactions')).json;
    expect(all.transactions).toHaveLength(10);
    expect(all.hasMore).toBe(false);
    expect(all.transactions[0]).toEqual(expect.objectContaining({ id: expect.stringMatching(/^sf:/), accountName: expect.any(String), date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), amount: expect.any(Number), description: expect.any(String) }));
    const after = (await api(`/api/transactions?since=${all.latestSeq}`)).json;
    expect(after).toEqual({ transactions: [], latestSeq: all.latestSeq, hasMore: false });
    const partial = (await api('/api/transactions?since=7')).json;
    expect(partial.transactions.map((t: any) => t.seq)).toEqual([8, 9, 10]);
  });

  it('pages large results, and the pages add up to everything, once', async () => {
    bridge.accounts[0]!.transactions = Array.from({ length: 1200 }, (_, i) => ({ id: `n${i}`, posted: Math.floor(Date.parse('2026-09-19T12:00:00Z') / 1000), amount: '-1.00', description: `ITEM ${i}` }));
    await connect();
    let since = 0;
    const seen: number[] = [];
    for (let guard = 0; guard < 10; guard++) {
      const page = (await api(`/api/transactions?since=${since}`)).json;
      seen.push(...page.transactions.map((t: any) => t.seq));
      since = page.latestSeq;
      if (!page.hasMore) break;
    }
    expect(seen).toHaveLength(1203);
    expect(new Set(seen).size).toBe(1203);
  });

  it('flips the sign of an account on request, for banks that list purchases as positive', async () => {
    await connect();
    const before = (await api('/api/transactions')).json.transactions.find((t: any) => t.id === 'sf:ACT-card:c1').amount;
    expect(before).toBe(-32.99);
    const patched = await api('/api/accounts/ACT-card', { method: 'PATCH', body: { invertSign: true } });
    expect(patched.json.accounts.find((a: any) => a.id === 'ACT-card').invertSign).toBe(true);
    const after = (await api('/api/transactions')).json.transactions.find((t: any) => t.id === 'sf:ACT-card:c1').amount;
    expect(after).toBe(32.99);
    expect((await api('/api/transactions')).json.transactions.find((t: any) => t.id === 'sf:ACT-checking:t1').amount).toBe(-45.2); // other account untouched
  });

  it('validates account changes', async () => {
    await connect();
    expect((await api('/api/accounts/ACT-card', { method: 'PATCH', body: { invertSign: 'yes' } })).status).toBe(400);
    expect((await api('/api/accounts/NOPE', { method: 'PATCH', body: { invertSign: true } })).status).toBe(404);
  });

  it('syncs on request, but not twice in a minute', async () => {
    await connect();
    time.advance(30_000);
    expect((await api('/api/sync', { method: 'POST' })).json).toMatchObject({ ok: false, code: 'too-soon' });
    time.advance(60_000);
    expect((await api('/api/sync', { method: 'POST' })).json).toMatchObject({ ok: true, added: 0 });
  });

  it('disconnects, clearing what it holds', async () => {
    await connect();
    const r = await api('/api/connection', { method: 'DELETE' });
    expect(r.json.status).toMatchObject({ connected: false, accounts: [] });
    expect((await api('/api/transactions')).json.transactions).toEqual([]);
    expect(store.get().accessUrl).toBeNull();
  });
});

describe('secrets', () => {
  it('never sends the SimpleFIN access URL or its password to the browser', async () => {
    bodies.length = 0;
    await connect();
    await api('/api/status');
    await api('/api/transactions');
    await api('/api/sync', { method: 'POST' });
    bridge.mode = 'forbidden';
    time.advance(120_000);
    await api('/api/sync', { method: 'POST' });
    await api('/api/connection', { method: 'DELETE' });
    const everything = bodies.join('\n');
    expect(everything).not.toMatch(/secret|demo:|accessUrl|127\.0\.0\.1:\d+\/simplefin/);
    expect(everything.length).toBeGreaterThan(500); // the check above actually looked at something
  });

  it('keeps the access URL on disk only, in the private state file', async () => {
    await connect();
    expect(store.get().accessUrl).toMatch(/demo:secret@/);
  });
});
