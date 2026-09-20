import { addMonths, isValidISODate, parseISODate, toISODate } from './dates';

describe('dates', () => {
  it('formats local calendar days without UTC shift', () => {
    expect(toISODate(new Date(2026, 0, 1, 0, 30))).toBe('2026-01-01');
    expect(toISODate(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });

  it('round-trips ISO strings', () => {
    expect(toISODate(parseISODate('2026-02-28'))).toBe('2026-02-28');
  });

  it('validates real calendar dates only', () => {
    expect(isValidISODate('2026-02-28')).toBe(true);
    expect(isValidISODate('2024-02-29')).toBe(true);
    expect(isValidISODate('2026-02-29')).toBe(false);
    expect(isValidISODate('2026-13-01')).toBe(false);
    expect(isValidISODate('26-01-01')).toBe(false);
    expect(isValidISODate('')).toBe(false);
  });

  it('adds months from the 1st so month-end dates cannot overflow', () => {
    expect(toISODate(addMonths(new Date(2026, 2, 31), -1))).toBe('2026-02-01');
  });
});
