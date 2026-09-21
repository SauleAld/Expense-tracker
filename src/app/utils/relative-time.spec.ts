import { formatFuture, formatRelative } from './relative-time';

const NOW = new Date(2026, 8, 20, 12, 0, 0);
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelative', () => {
  it('describes the recent past', () => {
    expect(formatRelative(ago(20_000), NOW)).toBe('just now');
    expect(formatRelative(ago(5 * MIN), NOW)).toBe('5 min ago');
    expect(formatRelative(ago(3 * HOUR + 10 * MIN), NOW)).toBe('3 h ago');
    expect(formatRelative(ago(DAY + HOUR), NOW)).toBe('yesterday');
    expect(formatRelative(ago(4 * DAY), NOW)).toBe('4 days ago');
  });
  it('treats a timestamp a few seconds ahead of a stale clock as "just now"', () => {
    expect(formatRelative(ahead(5_000), NOW)).toBe('just now');
    expect(formatRelative(ahead(59_000), NOW)).toBe('just now');
  });
  it('still describes a genuinely future time as future', () => {
    expect(formatRelative(ahead(5 * MIN), NOW)).toBe('in 5 min');
  });
  it('falls back to a date after a week', () => {
    expect(formatRelative(new Date(2026, 8, 1), NOW)).toBe('Sep 1, 2026');
  });
});

describe('formatFuture', () => {
  it('describes the near future', () => {
    expect(formatFuture(ahead(20_000), NOW)).toBe('in under a minute');
    expect(formatFuture(ahead(5 * MIN), NOW)).toBe('in 5 min');
    expect(formatFuture(ahead(3 * HOUR + 10 * MIN), NOW)).toBe('in 3 h');
    expect(formatFuture(ahead(DAY + HOUR), NOW)).toBe('tomorrow');
    expect(formatFuture(ahead(4 * DAY), NOW)).toBe('in 4 days');
  });
  it('says "now" for past times', () => {
    expect(formatFuture(ago(1000), NOW)).toBe('now');
  });
});
