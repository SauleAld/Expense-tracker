import { expiryDate, newShareToken, shareStatus, shareUrl } from './sharing';

const NOW = new Date('2026-09-20T12:00:00Z');

describe('sharing', () => {
  it('computes expiry times', () => {
    expect(expiryDate('1h', NOW)).toBe('2026-09-20T13:00:00.000Z');
    expect(expiryDate('24h', NOW)).toBe('2026-09-21T12:00:00.000Z');
    expect(expiryDate('7d', NOW)).toBe('2026-09-27T12:00:00.000Z');
    expect(expiryDate('30d', NOW)).toBe('2026-10-20T12:00:00.000Z');
    expect(expiryDate('never', NOW)).toBeNull();
  });

  it('reports status: active, expired (boundary inclusive) or revoked', () => {
    expect(shareStatus({ revoked: false, expiresAt: null }, NOW)).toBe('active');
    expect(shareStatus({ revoked: false, expiresAt: '2026-09-20T12:00:01.000Z' }, NOW)).toBe('active');
    expect(shareStatus({ revoked: false, expiresAt: '2026-09-20T12:00:00.000Z' }, NOW)).toBe('expired');
    expect(shareStatus({ revoked: true, expiresAt: null }, NOW)).toBe('revoked');
    expect(shareStatus({ revoked: true, expiresAt: '2020-01-01T00:00:00.000Z' }, NOW)).toBe('revoked');
  });

  it('makes 12-character base-36 tokens that differ each time', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => newShareToken()));
    expect(tokens.size).toBe(50);
    for (const t of tokens) expect(t).toMatch(/^[0-9a-z]{12}$/);
  });

  it('builds the URL from an origin', () => {
    expect(shareUrl('abc123', 'https://example.test')).toBe('https://example.test/shared/abc123');
  });
});
