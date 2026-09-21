import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ExpenseStore } from '../../../core/expense-store';
import { ToastService } from '../../../core/toast';
import { BankApi, BankApiError, type ServerStatus, type ServerTransaction } from './bank-api';
import { BankConnection, CURSOR_STORAGE_KEY } from './bank-connection';
import { BankInbox } from './bank-inbox';

const baseStatus = (over: Partial<ServerStatus> = {}): ServerStatus => ({
  connected: true, connectedAt: '2026-09-01T00:00:00Z', lastSyncAt: '2026-09-20T12:00:00Z', lastAttemptAt: null, lastError: null,
  warnings: [], nextSyncAt: '2026-09-21T12:00:00Z', autoSync: true, requestsToday: 1, requestLimit: 4, latestSeq: 0,
  accounts: [{ id: 'A', name: 'Checking', org: 'Bank', currency: 'USD', balance: 100, invertSign: false }], ...over,
});
const tx = (seq: number, over: Partial<ServerTransaction> = {}): ServerTransaction => ({
  seq, id: `sf:A:${seq}`, accountName: 'Checking', date: '2026-09-10', amount: -10 - seq, description: `MERCHANT ${seq}`, ...over,
});

function setup(overrides: Partial<Record<keyof BankApi, unknown>> = {}) {
  const fake = {
    config: signal({ url: 'http://x', token: 'tok' }),
    health: vi.fn().mockResolvedValue(true),
    status: vi.fn().mockResolvedValue(baseStatus()),
    transactions: vi.fn().mockResolvedValue({ transactions: [], latestSeq: 0, hasMore: false }),
    connect: vi.fn(),
    sync: vi.fn(),
    disconnect: vi.fn(),
    setInvertSign: vi.fn(),
    setToken: vi.fn(),
  };
  Object.assign(fake, overrides); // keeps `fake` typed while letting a test replace any method
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [{ provide: BankApi, useValue: fake }] });
  return { fake, conn: TestBed.inject(BankConnection), inbox: TestBed.inject(BankInbox), toast: TestBed.inject(ToastService), expenses: TestBed.inject(ExpenseStore) };
}
const toasts = (t: ToastService) => t.toasts().map((x) => x.message);

describe('BankConnection', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.useRealTimers());

  describe('refresh', () => {
    it('is offline when nothing answers', async () => {
      const { conn } = setup({ health: vi.fn().mockResolvedValue(false) });
      await conn.refresh();
      expect(conn.phase()).toBe('offline');
      expect(conn.connected()).toBe(false);
    });

    it('asks to pair when there is no token yet', async () => {
      const { conn, fake } = setup();
      fake.config.set({ url: 'http://x', token: '' });
      await conn.refresh();
      expect(conn.phase()).toBe('needs-token');
      expect(fake.status).not.toHaveBeenCalled();
    });

    it('says so when the token is wrong', async () => {
      const { conn } = setup({ status: vi.fn().mockRejectedValue(new BankApiError('unauthorized', 'no')) });
      await conn.refresh();
      expect(conn.phase()).toBe('unauthorized');
    });

    it('is ready but not connected before a bank is linked, and pulls nothing', async () => {
      const { conn, fake } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ connected: false })) });
      await conn.refresh();
      expect(conn.phase()).toBe('ready');
      expect(conn.connected()).toBe(false);
      expect(fake.transactions).not.toHaveBeenCalled();
    });

    it('when connected, pulls new transactions into the review inbox', async () => {
      const { conn, inbox, toast } = setup({
        status: vi.fn().mockResolvedValue(baseStatus({ latestSeq: 2 })),
        transactions: vi.fn().mockResolvedValue({ transactions: [tx(1), tx(2)], latestSeq: 2, hasMore: false }),
      });
      await conn.refresh();
      expect(conn.connected()).toBe(true);
      expect(inbox.reviewCount()).toBe(2);
      expect(inbox.toReview()[0]).toMatchObject({ source: 'simplefin', pending: false, id: 'sf:A:1' });
      expect(toasts(toast)).toContain('2 new transactions from your bank to review');
    });

    it('a server error keeps the phase and shows the message', async () => {
      const { conn } = setup({ status: vi.fn().mockRejectedValue(new BankApiError('server', 'It broke')) });
      await conn.refresh();
      expect(conn.error()).toBe('It broke');
    });

    it('goes offline if the server disappears mid-way', async () => {
      const { conn } = setup({ status: vi.fn().mockRejectedValue(new BankApiError('offline', 'gone')) });
      await conn.refresh();
      expect(conn.phase()).toBe('offline');
    });
  });

  describe('pull', () => {
    it('only asks for what is after the last position, and remembers the new one', async () => {
      const transactions = vi.fn().mockResolvedValue({ transactions: [tx(6)], latestSeq: 6, hasMore: false });
      const { conn } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ latestSeq: 6 })), transactions });
      localStorage.setItem(CURSOR_STORAGE_KEY, '5');
      await conn.refresh();
      expect(transactions).toHaveBeenCalledWith(5);
      expect(localStorage.getItem(CURSOR_STORAGE_KEY)).toBe('6');
    });

    it('reads every page', async () => {
      const transactions = vi.fn()
        .mockResolvedValueOnce({ transactions: [tx(1), tx(2)], latestSeq: 2, hasMore: true })
        .mockResolvedValueOnce({ transactions: [tx(3)], latestSeq: 3, hasMore: false });
      const { conn, inbox } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ latestSeq: 3 })), transactions });
      await conn.refresh();
      expect(transactions.mock.calls.map((c) => c[0])).toEqual([0, 2]);
      expect(inbox.reviewCount()).toBe(3);
    });

    it('does not add the same transactions again', async () => {
      const transactions = vi.fn().mockResolvedValue({ transactions: [tx(1)], latestSeq: 1, hasMore: false });
      const { conn, inbox } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ latestSeq: 1 })), transactions });
      await conn.refresh();
      localStorage.setItem(CURSOR_STORAGE_KEY, '0'); // as if the position was lost
      await conn.refresh();
      expect(inbox.reviewCount()).toBe(1);
    });

    it('starts over, without duplicates, when the server has been reset', async () => {
      const transactions = vi.fn().mockResolvedValue({ transactions: [tx(1)], latestSeq: 1, hasMore: false });
      const { conn, inbox } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ latestSeq: 1 })), transactions });
      localStorage.setItem(CURSOR_STORAGE_KEY, '250'); // far ahead of a server that now starts at 1
      await conn.refresh();
      expect(transactions).toHaveBeenCalledWith(0);
      expect(inbox.reviewCount()).toBe(1);
    });

    it('says nothing when nothing is new', async () => {
      const { conn, toast } = setup();
      await conn.refresh();
      expect(toasts(toast)).toEqual([]);
    });
  });

  describe('connect', () => {
    it('applies the status, pulls the first transactions and confirms', async () => {
      const { conn, inbox, toast } = setup({
        status: vi.fn().mockResolvedValue(baseStatus({ connected: false })),
        connect: vi.fn().mockResolvedValue({ outcome: { ok: true, added: 2 }, status: baseStatus({ latestSeq: 2 }) }),
        transactions: vi.fn().mockResolvedValue({ transactions: [tx(1), tx(2)], latestSeq: 2, hasMore: false }),
      });
      await conn.refresh();
      await conn.connect('SETUP');
      expect(conn.connected()).toBe(true);
      expect(inbox.reviewCount()).toBe(2);
      expect(toasts(toast)).toContain('Connected to your bank via SimpleFIN');
      expect(conn.busy()).toBeNull();
    });

    it('shows the reason when SimpleFIN refuses', async () => {
      const { conn } = setup({
        status: vi.fn().mockResolvedValue(baseStatus({ connected: false })),
        connect: vi.fn().mockResolvedValue({ outcome: { ok: false, code: 'claim-used', message: 'Already used' }, status: baseStatus({ connected: false }) }),
      });
      await conn.refresh();
      await conn.connect('SETUP');
      expect(conn.error()).toBe('Already used');
      expect(conn.connected()).toBe(false);
    });

    it('ignores a second click while one is in progress', async () => {
      let release!: () => void;
      const connect = vi.fn(() => new Promise((resolve) => (release = () => resolve({ outcome: { ok: true, added: 0 }, status: baseStatus() }))));
      const { conn } = setup({ connect });
      const first = conn.connect('A');
      await Promise.resolve();
      expect(conn.busy()).toBe('connect');
      await conn.connect('B');
      release();
      await first;
      expect(connect).toHaveBeenCalledTimes(1);
    });
  });

  describe('syncNow', () => {
    it('syncs, pulls and reports how many are new', async () => {
      const { conn, toast } = setup({
        sync: vi.fn().mockResolvedValue({ outcome: { ok: true, added: 1 }, status: baseStatus({ latestSeq: 1 }) }),
        transactions: vi.fn().mockResolvedValue({ transactions: [tx(1)], latestSeq: 1, hasMore: false }),
      });
      await conn.syncNow();
      expect(toasts(toast)).toEqual(['Synced. 1 new transaction to review.']);
    });

    it('says so when there is nothing new', async () => {
      const { conn, toast } = setup({ sync: vi.fn().mockResolvedValue({ outcome: { ok: true, added: 0 }, status: baseStatus() }) });
      await conn.syncNow();
      expect(toasts(toast)).toEqual(['Synced. Nothing new.']);
    });

    it('shows a refusal such as the daily limit or "you just synced"', async () => {
      const { conn } = setup({ sync: vi.fn().mockResolvedValue({ outcome: { ok: false, code: 'too-soon', message: 'You just synced.' }, status: baseStatus() }) });
      await conn.syncNow();
      expect(conn.error()).toBe('You just synced.');
    });
  });

  describe('other actions', () => {
    it('disconnects', async () => {
      const { conn, toast } = setup({ disconnect: vi.fn().mockResolvedValue(baseStatus({ connected: false })) });
      await conn.refresh();
      await conn.disconnect();
      expect(conn.connected()).toBe(false);
      expect(toasts(toast)).toContain('Disconnected from SimpleFIN');
    });

    it('changes an account sign and shows the result', async () => {
      const inverted = baseStatus({ accounts: [{ id: 'A', name: 'Checking', org: 'Bank', currency: 'USD', balance: 100, invertSign: true }] });
      const { conn, fake } = setup({ setInvertSign: vi.fn().mockResolvedValue(inverted) });
      await conn.setInvertSign('A', true);
      expect(fake.setInvertSign).toHaveBeenCalledWith('A', true);
      expect(conn.status()!.accounts[0]!.invertSign).toBe(true);
    });

    it('pairs by saving the token and checking again', async () => {
      const { conn, fake } = setup();
      fake.config.set({ url: 'http://x', token: '' });
      await conn.refresh();
      expect(conn.phase()).toBe('needs-token');
      fake.setToken.mockImplementation((t: string) => fake.config.set({ url: 'http://x', token: t }));
      await conn.pair('newtoken');
      expect(fake.setToken).toHaveBeenCalledWith('newtoken');
      expect(conn.phase()).toBe('ready');
    });
  });

  describe('watching', () => {
    it('checks on start (once), and again every few minutes while connected', async () => {
      vi.useFakeTimers();
      const { conn, fake } = setup();
      conn.start();
      conn.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(fake.health).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(fake.health).toHaveBeenCalledTimes(2);
    });

    it('stays quiet while not connected', async () => {
      vi.useFakeTimers();
      const { conn, fake } = setup({ status: vi.fn().mockResolvedValue(baseStatus({ connected: false })) });
      conn.start();
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(20 * 60_000);
      expect(fake.health).toHaveBeenCalledTimes(1);
    });
  });
});
