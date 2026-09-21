import { TestBed } from '@angular/core/testing';
import { buildReport, DEFAULT_PARAMS } from '../reports/report-builders';
import type { HistoryEntry, Schedule, ShareLink } from '../model/cloud-types';
import { defaultOptions } from '../model/destinations';
import { CLOUD_STORAGE_KEY, CloudStore } from './cloud-store';

const NOW = new Date(2026, 8, 20);
const request = { template: 'ledger', params: DEFAULT_PARAMS(NOW), format: 'csv', destination: 'dropbox', options: defaultOptions('x') } as const;

const history = (over: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id: crypto.randomUUID(),
  at: NOW.toISOString(),
  template: 'ledger',
  format: 'csv',
  destination: 'dropbox',
  records: 3,
  bytes: 1000,
  status: 'completed',
  trigger: 'manual',
  filename: 'x.csv',
  detail: '',
  request,
  ...over,
});
const share = (over: Partial<ShareLink> = {}): ShareLink => ({
  id: 'tok',
  template: 'ledger',
  createdAt: NOW.toISOString(),
  expiresAt: null,
  allowDownload: true,
  views: 0,
  revoked: false,
  snapshot: buildReport('ledger', [], DEFAULT_PARAMS(NOW), NOW),
  ...over,
});
const schedule = (over: Partial<Schedule> = {}): Schedule => ({
  id: 's1',
  name: 'n',
  template: 'monthly',
  params: DEFAULT_PARAMS(NOW),
  format: 'csv',
  destination: 'email',
  options: defaultOptions('x'),
  frequency: 'monthly',
  weekday: 1,
  dayOfMonth: 1,
  time: '08:00',
  enabled: true,
  createdAt: NOW.toISOString(),
  nextRunAt: NOW.toISOString(),
  lastRunAt: null,
  lastStatus: null,
  ...over,
});

const fresh = () => {
  TestBed.resetTestingModule();
  return TestBed.inject(CloudStore);
};

describe('CloudStore', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    const store = fresh();
    expect([store.connections(), store.schedules(), store.history(), store.shares()].every((l) => l.length === 0)).toBe(true);
  });

  it('connects, reconnects (replacing) and disconnects a provider, and persists it', () => {
    const store = fresh();
    store.connect('dropbox', NOW);
    store.connect('dropbox', NOW);
    expect(store.connections()).toHaveLength(1);
    expect(store.connection('dropbox')?.status).toBe('connected');
    expect(fresh().connection('dropbox')).toBeTruthy();
    store.disconnect('dropbox');
    expect(store.connection('dropbox')).toBeUndefined();
  });

  it('tracks which providers are usable', () => {
    const store = fresh();
    store.connect('dropbox');
    store.connect('sheets');
    store.patchConnection('sheets', { status: 'error' });
    expect(store.connectedProviders()).toEqual(['dropbox']);
  });

  it('adds history newest first, caps it at 200, and clears it', () => {
    const store = fresh();
    for (let i = 0; i < 205; i++) store.addHistory(history({ id: `h${i}` }));
    expect(store.history()).toHaveLength(200);
    expect(store.history()[0]!.id).toBe('h204');
    store.clearHistory();
    expect(store.history()).toEqual([]);
  });

  it('sums stored bytes per provider from completed exports only', () => {
    const store = fresh();
    store.addHistory(history({ bytes: 1000 }));
    store.addHistory(history({ bytes: 500 }));
    store.addHistory(history({ bytes: 9999, status: 'failed' }));
    store.addHistory(history({ bytes: 700, destination: 'onedrive' }));
    expect(store.usedBytes('dropbox')).toBe(1500);
    expect(store.usedBytes('gdrive')).toBe(0);
  });

  it('manages share links: revoke, count views, remove', () => {
    const store = fresh();
    store.addShare(share());
    store.recordView('tok');
    store.recordView('tok');
    expect(store.share('tok')?.views).toBe(2);
    store.revokeShare('tok');
    expect(store.share('tok')?.revoked).toBe(true);
    store.removeShare('tok');
    expect(store.share('tok')).toBeUndefined();
  });

  it('manages schedules', () => {
    const store = fresh();
    store.addSchedule(schedule());
    store.patchSchedule('s1', { enabled: false });
    expect(fresh().schedules()[0]!.enabled).toBe(false);
    store.removeSchedule('s1');
    expect(store.schedules()).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    localStorage.setItem(
      CLOUD_STORAGE_KEY,
      JSON.stringify({
        connections: [{ provider: 'dropbox', status: 'connected', account: 'a', connectedAt: 'x' }, { provider: 'nope' }, null],
        schedules: [schedule(), { id: 'bad' }],
        history: [history(), 'junk'],
        shares: [share(), { id: 5 }],
      }),
    );
    const store = fresh();
    expect(store.connections()).toHaveLength(1);
    expect(store.schedules()).toHaveLength(1);
    expect(store.history()).toHaveLength(1);
    expect(store.shares()).toHaveLength(1);
  });

  it('recovers from corrupt storage', () => {
    localStorage.setItem(CLOUD_STORAGE_KEY, '{oops');
    const store = fresh();
    expect(store.history()).toEqual([]);
  });

  it('flags an error, but keeps working in memory, when storage rejects writes', () => {
    const store = fresh();
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    store.connect('dropbox');
    expect(store.connection('dropbox')).toBeTruthy();
    expect(store.saveError()).toBeTruthy();
    spy.mockRestore();
    store.connect('sheets');
    expect(store.saveError()).toBeNull();
  });
});
