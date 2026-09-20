import { DATE_PRESETS, matchPreset, presetRange } from './date-presets';

const NOW = new Date(2026, 8, 20); // Sep 20, 2026

describe('date presets', () => {
  it('computes inclusive ranges ending today', () => {
    expect(presetRange('all', NOW)).toEqual({ from: '', to: '' });
    expect(presetRange('month', NOW)).toEqual({ from: '2026-09-01', to: '2026-09-20' });
    expect(presetRange('30d', NOW)).toEqual({ from: '2026-08-22', to: '2026-09-20' });
    expect(presetRange('90d', NOW)).toEqual({ from: '2026-06-23', to: '2026-09-20' });
    expect(presetRange('year', NOW)).toEqual({ from: '2026-01-01', to: '2026-09-20' });
  });

  it('round-trips every preset through matchPreset', () => {
    for (const { id } of DATE_PRESETS) {
      const { from, to } = presetRange(id, NOW);
      expect(matchPreset(from, to, NOW)).toBe(id);
    }
  });

  it('returns null for a custom range', () => {
    expect(matchPreset('2026-09-02', '2026-09-20', NOW)).toBeNull();
  });
});
