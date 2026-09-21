import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clock, testConfig } from '../test/helpers.ts';
import { demoAccounts, startFakeBridge, type FakeBridge } from '../test/fake-simplefin.ts';
import { StateStore } from './state.ts';
import { SyncService } from './sync.ts';

const DAY = 86_400_000;
let bridge: FakeBridge;
beforeEach(async () => {
  bridge = await startFakeBridge({ accounts: demoAccounts(new Date('2026-09-20T15:00:00Z')) });
});
afterEach(() => bridge.close());

function setup(configOverrides = {}) {
  const config = testConfig(configOverrides);
  const store = new StateStore(config.dataDir);
  const time = clock();
  const sync = new SyncService(store, config, { now: time.now });
  return { config, store, time, sync };
}
const accountRequests = () => bridge.requests.filter((r) => r.path.endsWith('/accounts'));

describe('connect', () => {
  it('claims the token, stores the access URL, and runs a first sync that reaches back 90 days', async () => {
    const { sync, store, time } = setup();
    const outcome = await sync.connect(bridge.setupToken());
    expect(outcome).toEqual({ ok: true, added: 10 }); // 7 checking + 3 card
    expect(store.get().accessUrl).toContain('/simplefin');
    const start = Number(accountRequests()[0]!.query['start-date']);
    expect(start).toBe(Math.floor((time.now() - 90 * DAY) / 1000));
    expect(accountRequests()[0]!.query['version']).toBe('2');
  });

  it('uses HTTP Basic auth with the claimed credentials', async () => {
    const { sync } = setup();
    await sync.connect(bridge.setupToken());
    expect(accountRequests()[0]!.authorization).toBe(`Basic ${Buffer.from('demo:secret').toString('base64')}`);
  });

  it('stores accounts with their bank name, and namespaced transaction ids', async () => {
    const { sync, store } = setup();
    await sync.connect(bridge.setupToken());
    expect(store.get().accounts.map((a) => [a.id, a.org, a.balance])).toEqual([
      ['ACT-checking', 'First Demo Bank', 2413.87],
      ['ACT-card', 'Second Demo Bank', -312.4],
    ]);
    expect(store.get().transactions[0]!.id).toMatch(/^sf:ACT-(checking|card):/);
  });

  it('reports a used or invalid token without connecting', async () => {
    const { sync, store } = setup();
    const token = bridge.setupToken();
    await sync.connect(token);
    const second = setup();
    expect(await second.sync.connect(token)).toMatchObject({ ok: false, code: 'claim-used' });
    expect(second.store.get().accessUrl).toBeNull();
    expect(await second.sync.connect('nonsense!!')).toMatchObject({ ok: false, code: 'invalid-token' });
    expect(store.get().accessUrl).not.toBeNull();
  });

  it('does not leave the connection half-made when the first sync fails', async () => {
    const { sync, store } = setup();
    bridge.mode = 'payment';
    const outcome = await sync.connect(bridge.setupToken());
    expect(outcome).toMatchObject({ ok: false, code: 'payment' });
    expect(store.get().accessUrl).not.toBeNull(); // claimed and saved: the token can't be reused
    expect(sync.status().lastError).toMatch(/payment is required/);
  });
});

describe('sync', () => {
  it('re-reads only the last 3 days on later syncs, and never adds a transaction twice', async () => {
    const { sync, store, time } = setup();
    await sync.connect(bridge.setupToken());
    time.advance(2 * DAY);
    const before = store.get().transactions.length;
    const outcome = await sync.sync('auto');
    expect(outcome).toEqual({ ok: true, added: 0 });
    expect(store.get().transactions).toHaveLength(before);
    const lastStart = Number(accountRequests().at(-1)!.query['start-date']);
    expect(lastStart).toBe(Math.floor((time.now() - 2 * DAY - 3 * DAY) / 1000));
  });

  it('adds only what is new, with increasing sequence numbers', async () => {
    const { sync, store, time } = setup();
    await sync.connect(bridge.setupToken());
    const seqBefore = store.get().nextSeq;
    bridge.accounts[0]!.transactions.push({ id: 'new1', posted: Math.floor(time.now() / 1000), amount: '-9.99', description: 'NEW THING' });
    time.advance(DAY);
    expect(await sync.sync('auto')).toEqual({ ok: true, added: 1 });
    expect(store.get().transactions.at(-1)).toMatchObject({ id: 'sf:ACT-checking:new1', seq: seqBefore });
    expect(sync.status().latestSeq).toBe(seqBefore);
  });

  it('leaves pending transactions out until they post', async () => {
    const { sync, store, time } = setup();
    bridge.accounts[0]!.transactions.push({ id: 'p1', posted: Math.floor(time.now() / 1000), amount: '-3', description: 'PENDING', pending: true });
    await sync.connect(bridge.setupToken());
    expect(store.get().transactions.some((t) => t.id.endsWith(':p1'))).toBe(false);
    expect(accountRequests()[0]!.query['pending']).toBeUndefined();
  });

  it('remembers a per-account sign inversion across syncs', async () => {
    const { sync, store, time } = setup();
    await sync.connect(bridge.setupToken());
    store.update((s) => void (s.accounts.find((a) => a.id === 'ACT-card')!.invertSign = true));
    time.advance(DAY);
    await sync.sync('auto');
    expect(store.get().accounts.find((a) => a.id === 'ACT-card')!.invertSign).toBe(true);
  });

  it('surfaces warnings from the bridge, then clears them when they stop', async () => {
    const { sync, time } = setup();
    bridge.errlist = [{ code: 'con.auth', msg: 'Sign in again at your bank' }];
    await sync.connect(bridge.setupToken());
    expect(sync.status().warnings).toEqual(['con.auth: Sign in again at your bank']);
    bridge.errlist = [];
    time.advance(DAY);
    await sync.sync('auto');
    expect(sync.status().warnings).toEqual([]);
  });

  it('does nothing, and says so, when not connected', async () => {
    const { sync } = setup();
    expect(await sync.sync('manual')).toMatchObject({ ok: false, code: 'not-connected' });
    expect(bridge.requests).toHaveLength(0);
  });

  it('runs two overlapping requests as one upstream call', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    time.advance(DAY);
    const before = accountRequests().length;
    const [a, b] = await Promise.all([sync.sync('auto'), sync.sync('auto')]);
    expect(a).toEqual(b);
    expect(accountRequests().length - before).toBe(1);
  });
});

describe('protecting your SimpleFIN account', () => {
  it('refuses a second manual sync within a minute, without calling the bridge', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    time.advance(20_000);
    const count = bridge.requests.length;
    expect(await sync.sync('manual')).toMatchObject({ ok: false, code: 'too-soon' });
    expect(bridge.requests).toHaveLength(count);
    time.advance(45_000);
    expect(await sync.sync('manual')).toMatchObject({ ok: true });
  });

  it('stops at the daily request limit, and frees up as requests age out of the 24 hours', async () => {
    const { sync, time } = setup({ maxRequestsPerDay: 3, minManualIntervalMs: 1 });
    await sync.connect(bridge.setupToken()); // claim + first sync = 2 requests
    time.advance(1000);
    expect(await sync.sync('manual')).toMatchObject({ ok: true }); // 3rd
    time.advance(1000);
    const blocked = await sync.sync('manual');
    expect(blocked).toMatchObject({ ok: false, code: 'rate-limit' });
    expect(accountRequests()).toHaveLength(2); // the blocked one never reached the bridge
    expect(sync.status()).toMatchObject({ requestsToday: 3, requestLimit: 3 });
    time.advance(25 * 3_600_000);
    expect(sync.status().requestsToday).toBe(0);
    expect(await sync.sync('manual')).toMatchObject({ ok: true });
  });

  it('does not charge a token that cannot even be read (a typo never reaches SimpleFIN)', async () => {
    const { sync } = setup({ maxRequestsPerDay: 2 });
    for (const typo of ['', '   ', 'garbage!!', Buffer.from('not a url').toString('base64')]) {
      expect(await sync.connect(typo)).toMatchObject({ ok: false, code: 'invalid-token' });
    }
    expect(sync.requestsToday()).toBe(0);
    expect(bridge.requests).toHaveLength(0);
    // ...so the real token still works afterwards.
    expect(await sync.connect(bridge.setupToken())).toMatchObject({ ok: true });
  });

  it('does charge a real claim, because it does reach SimpleFIN', async () => {
    const { sync } = setup();
    await sync.connect(bridge.setupToken());
    expect(sync.requestsToday()).toBe(2); // the claim and the first sync
  });

  it('counts the claim against the limit too', async () => {
    const { sync } = setup({ maxRequestsPerDay: 1 });
    expect(await sync.connect(bridge.setupToken())).toMatchObject({ ok: false, code: 'rate-limit' });
  });
});

describe('when SimpleFIN has trouble', () => {
  it('keeps your data and last good sync time, records the reason, and recovers', async () => {
    const { sync, store, time } = setup();
    await sync.connect(bridge.setupToken());
    const lastGood = store.get().lastSuccessAt;
    const kept = store.get().transactions.length;

    for (const [mode, code] of [['payment', 'payment'], ['forbidden', 'auth'], ['error', 'bad-response'], ['garbage', 'bad-response']] as const) {
      bridge.mode = mode;
      time.advance(2 * 60_000);
      expect(await sync.sync('manual')).toMatchObject({ ok: false, code });
      expect(store.get().lastSuccessAt).toBe(lastGood);
      expect(store.get().transactions).toHaveLength(kept);
      expect(sync.status().lastError).toBeTruthy();
    }
    bridge.mode = 'ok';
    time.advance(2 * 60_000);
    expect(await sync.sync('manual')).toMatchObject({ ok: true });
    expect(sync.status().lastError).toBeNull();
    expect(store.get().lastSuccessAt).not.toBe(lastGood);
  });

  it('reports the bridge being unreachable', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    await bridge.close();
    time.advance(2 * 60_000);
    expect(await sync.sync('manual')).toMatchObject({ ok: false, code: 'network' });
    bridge = await startFakeBridge(); // so afterEach can close something
  });

  it('never exposes the access URL or password in a status or error', async () => {
    const { sync } = setup();
    bridge.mode = 'forbidden';
    const outcome = await sync.connect(bridge.setupToken());
    expect(JSON.stringify([outcome, sync.status()])).not.toMatch(/secret|demo:/);
  });
});

describe('disconnect', () => {
  it('forgets the connection and its data, but keeps sequence numbers moving forward', async () => {
    const { sync, store } = setup();
    const token = store.get().apiToken;
    await sync.connect(bridge.setupToken());
    const seq = store.get().nextSeq;
    sync.disconnect();
    expect(sync.status()).toMatchObject({ connected: false, accounts: [], lastSyncAt: null });
    expect(store.get().transactions).toEqual([]);
    expect(store.get().apiToken).toBe(token);
    await sync.connect(bridge.setupToken());
    expect(store.get().transactions[0]!.seq).toBe(seq); // never reuses an old number
  });
});

describe('scheduling', () => {
  it('has a next sync 24 hours after the last one, or none when auto-sync is off', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    expect(sync.status().nextSyncAt).toBe(new Date(time.now() + DAY).toISOString());
    const off = setup({ autoSync: false });
    await off.sync.connect(bridge.setupToken());
    expect(off.sync.status().nextSyncAt).toBeNull();
  });

  it('catches up when started after being off for more than a day', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    const before = accountRequests().length;
    time.advance(30 * 3_600_000);
    const stop = sync.startScheduler();
    await new Promise((r) => setTimeout(r, 100));
    stop();
    expect(accountRequests().length - before).toBe(1);
  });

  it('does not sync early', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    const before = accountRequests().length;
    time.advance(3_600_000);
    sync.startScheduler()();
    await new Promise((r) => setTimeout(r, 50));
    expect(accountRequests()).toHaveLength(before);
  });

  it('waits an hour before retrying after a failure, so it never hammers the bridge', async () => {
    const { sync, time } = setup();
    await sync.connect(bridge.setupToken());
    bridge.mode = 'error';
    time.advance(25 * 3_600_000);
    await sync.sync('auto'); // fails
    const attempts = accountRequests().length;
    time.advance(10 * 60_000);
    sync.startScheduler()();
    await new Promise((r) => setTimeout(r, 50));
    expect(accountRequests()).toHaveLength(attempts); // too soon to retry
    time.advance(55 * 60_000);
    bridge.mode = 'ok';
    sync.startScheduler()();
    await new Promise((r) => setTimeout(r, 100));
    expect(accountRequests().length).toBe(attempts + 1);
  });
});
