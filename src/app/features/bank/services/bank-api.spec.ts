import { TestBed } from '@angular/core/testing';
import { BankApi, BankApiError, DEFAULT_SERVER_URL, SERVER_STORAGE_KEY } from './bank-api';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const fresh = () => {
  TestBed.resetTestingModule();
  return TestBed.inject(BankApi);
};
const status = { connected: true, accounts: [], warnings: [], latestSeq: 3 };

describe('BankApi', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    localStorage.clear();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });
  afterEach(() => vi.restoreAllMocks());

  describe('configuration', () => {
    it('starts with the default address and no token', () => {
      expect(fresh().config()).toEqual({ url: DEFAULT_SERVER_URL, token: '' });
    });

    it('remembers the token across reloads, trimmed', () => {
      fresh().setToken('  abc123  ');
      expect(fresh().config().token).toBe('abc123');
    });

    it('normalises the address, and falls back to the default for a blank one', () => {
      const api = fresh();
      api.setUrl('http://127.0.0.1:4000/');
      expect(api.config().url).toBe('http://127.0.0.1:4000');
      api.setUrl('   ');
      expect(api.config().url).toBe(DEFAULT_SERVER_URL);
    });

    it('ignores a stored address that is not http(s), and survives corrupt storage', () => {
      localStorage.setItem(SERVER_STORAGE_KEY, JSON.stringify({ url: 'javascript:alert(1)', token: 't' }));
      expect(fresh().config()).toEqual({ url: DEFAULT_SERVER_URL, token: 't' });
      localStorage.setItem(SERVER_STORAGE_KEY, '{oops');
      expect(fresh().config()).toEqual({ url: DEFAULT_SERVER_URL, token: '' });
    });

    it('can forget the token', () => {
      const api = fresh();
      api.setToken('abc');
      api.clearToken();
      expect(fresh().config().token).toBe('');
    });
  });

  describe('health', () => {
    it('is true only when the server answers with ok', async () => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json({ ok: true }));
      expect(await api.health()).toBe(true);
      fetchSpy.mockResolvedValueOnce(json({ ok: false }));
      expect(await api.health()).toBe(false);
      fetchSpy.mockResolvedValueOnce(json({}, 500));
      expect(await api.health()).toBe(false);
      fetchSpy.mockRejectedValueOnce(new TypeError('offline'));
      expect(await api.health()).toBe(false);
    });

    it('needs no token, and never sends one', async () => {
      const api = fresh();
      api.setToken('secret-token');
      fetchSpy.mockResolvedValueOnce(json({ ok: true }));
      await api.health();
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(`${DEFAULT_SERVER_URL}/api/health`);
      expect(JSON.stringify(init ?? {})).not.toContain('secret-token');
    });
  });

  describe('requests', () => {
    it('send the bearer token, the method and a JSON body', async () => {
      const api = fresh();
      api.setToken('tok');
      fetchSpy.mockResolvedValueOnce(json({ ok: true, added: 2, status }));
      const { outcome, status: s } = await api.connect('SETUPTOKEN');
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(`${DEFAULT_SERVER_URL}/api/connection`);
      expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ setupToken: 'SETUPTOKEN' }) });
      expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok', 'Content-Type': 'application/json' });
      expect(outcome).toEqual({ ok: true, added: 2 });
      expect(s.latestSeq).toBe(3);
    });

    it('split a failed outcome from the status, so the message can be shown', async () => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json({ ok: false, code: 'claim-used', message: 'Used already', status }));
      const { outcome } = await api.connect('x');
      expect(outcome).toEqual({ ok: false, code: 'claim-used', message: 'Used already' });
    });

    it('ask for transactions after a cursor', async () => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json({ transactions: [], latestSeq: 9, hasMore: false }));
      await api.transactions(9);
      expect(fetchSpy.mock.calls[0]![0]).toBe(`${DEFAULT_SERVER_URL}/api/transactions?since=9`);
    });

    it('encode the account id when changing its sign', async () => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json(status));
      await api.setInvertSign('ACT/weird id', true);
      const [url, init] = fetchSpy.mock.calls[0]!;
      expect(url).toBe(`${DEFAULT_SERVER_URL}/api/accounts/ACT%2Fweird%20id`);
      expect(init).toMatchObject({ method: 'PATCH', body: JSON.stringify({ invertSign: true }) });
    });

    it('disconnect returns the new status', async () => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json({ ok: true, status: { ...status, connected: false } }));
      expect((await api.disconnect()).connected).toBe(false);
    });
  });

  describe('errors', () => {
    const kindOf = async (call: () => Promise<unknown>) => (await call().catch((e: unknown) => e) as BankApiError).kind;

    it.each([
      [401, 'unauthorized'],
      [403, 'rejected'],
      [421, 'rejected'],
      [500, 'server'],
      [404, 'server'],
    ] as const)('HTTP %i is "%s"', async (code, kind) => {
      const api = fresh();
      fetchSpy.mockResolvedValueOnce(json({ error: 'x' }, code));
      expect(await kindOf(() => api.status())).toBe(kind);
    });

    it('a network failure is "offline"', async () => {
      const api = fresh();
      fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await kindOf(() => api.status())).toBe('offline');
    });

    it('a timeout is "offline" too', async () => {
      const api = fresh();
      fetchSpy.mockRejectedValueOnce(new DOMException('timed out', 'TimeoutError'));
      expect(await kindOf(() => api.status())).toBe('offline');
    });
  });
});
