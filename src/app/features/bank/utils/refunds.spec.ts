import { findRefundTarget, isRefundLike, rankRefundTargets, refundMerchantKey, type RefundTarget } from './refunds';

const target = (over: Partial<RefundTarget> = {}): RefundTarget => ({
  key: 'k',
  date: '2026-09-01',
  remainingCents: 5000,
  description: 'TARGET 00012 SAN FRANCISCO',
  category: 'Shopping',
  ...over,
});

describe('isRefundLike', () => {
  it('spots the words banks use for money given back', () => {
    expect(isRefundLike('REFUND - TARGET 00012')).toBe(true);
    expect(isRefundLike('AMAZON.COM*RETURN')).toBe(true);
    expect(isRefundLike('Merchandise credit Nordstrom')).toBe(true);
    expect(isRefundLike('PAYROLL ACME INC')).toBe(false);
  });
});

describe('refundMerchantKey', () => {
  it('ignores the refund wording, so the refund names the same merchant as the purchase', () => {
    expect(refundMerchantKey('REFUND - TARGET 00012')).toBe('TARGET');
    expect(refundMerchantKey('TRADER JOE S #552 RETURN')).toBe('TRADER JOE');
  });
});

describe('rankRefundTargets', () => {
  const refund = { date: '2026-09-10', amount: 50, description: 'REFUND TARGET 00099' };

  it('only offers purchases made before the refund and big enough to cover it', () => {
    const pool = [
      target({ key: 'later', date: '2026-09-11' }),
      target({ key: 'too-small', remainingCents: 4999 }),
      target({ key: 'too-old', date: '2026-01-01' }),
      target({ key: 'fits' }),
    ];
    expect(rankRefundTargets(refund, pool).map((t) => t.key)).toEqual(['fits']);
  });

  it('ranks the same merchant first, then the exact amount, then the most recent purchase', () => {
    const pool = [
      target({ key: 'other-shop', description: 'WALGREENS 1', remainingCents: 5000, date: '2026-09-09' }),
      target({ key: 'same-shop-bigger', remainingCents: 9000, date: '2026-09-09' }),
      target({ key: 'same-shop-exact-older', remainingCents: 5000, date: '2026-08-01' }),
      target({ key: 'same-shop-exact', remainingCents: 5000, date: '2026-09-05' }),
    ];
    expect(rankRefundTargets(refund, pool).map((t) => t.key)).toEqual([
      'same-shop-exact',
      'same-shop-exact-older',
      'same-shop-bigger',
      'other-shop',
    ]);
  });
});

describe('findRefundTarget', () => {
  it('matches on its own only when the merchant is the same', () => {
    const refund = { date: '2026-09-10', amount: 50, description: 'AMAZON.COM REFUND' };
    expect(findRefundTarget(refund, [target({ description: 'WALGREENS 1' })])).toBeNull();
    expect(findRefundTarget(refund, [target({ key: 'amzn', description: 'Amazon.com*AB12CD' })])?.key).toBe('amzn');
  });
});
