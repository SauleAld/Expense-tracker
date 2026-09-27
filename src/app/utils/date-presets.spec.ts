import { presetRange } from './date-presets';

describe('presetRange', () => {
  const now = new Date(2026, 8, 20); // Sep 20, 2026

  it('gives inclusive ranges ending today', () => {
    expect(presetRange('all', now)).toEqual({ from: '', to: '' });
    expect(presetRange('month', now)).toEqual({ from: '2026-09-01', to: '2026-09-20' });
    expect(presetRange('30d', now)).toEqual({ from: '2026-08-22', to: '2026-09-20' });
    expect(presetRange('90d', now)).toEqual({ from: '2026-06-23', to: '2026-09-20' });
    expect(presetRange('year', now)).toEqual({ from: '2026-01-01', to: '2026-09-20' });
  });
});
