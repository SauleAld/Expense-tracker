import { niceScale, roundedTopBar } from './scale';

describe('niceScale', () => {
  it('rounds the max up to a clean number with ticks from 0', () => {
    expect(niceScale(1234)).toEqual({ max: 1500, ticks: [0, 500, 1000, 1500] });
    expect(niceScale(87)).toEqual({ max: 100, ticks: [0, 25, 50, 75, 100] });
  });

  it('never returns a max below the data', () => {
    for (const v of [0.5, 3, 47, 99.9, 100, 101, 5555, 123456]) {
      expect(niceScale(v).max).toBeGreaterThanOrEqual(v);
    }
  });

  it('has a sensible default for empty data', () => {
    expect(niceScale(0).max).toBe(100);
  });
});

describe('roundedTopBar', () => {
  it('produces a closed path and clamps the radius to the bar size', () => {
    expect(roundedTopBar(0, 0, 10, 2, 4)).toMatch(/^M0,2V2Q/);
    expect(roundedTopBar(0, 0, 10, 20, 4).endsWith('Z')).toBe(true);
  });
});
