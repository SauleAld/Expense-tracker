import { computeNextRun, describeRecurrence } from './schedule-math';

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m - 1, d, h, min);

describe('computeNextRun', () => {
  describe('daily', () => {
    const rule = { frequency: 'daily', weekday: 0, dayOfMonth: 1, time: '08:00' } as const;
    it('runs later today if the time has not passed', () => {
      expect(computeNextRun(rule, at(2026, 9, 20, 7, 0))).toEqual(at(2026, 9, 20, 8, 0));
    });
    it('runs tomorrow once it has passed, and strictly after the reference time', () => {
      expect(computeNextRun(rule, at(2026, 9, 20, 8, 0))).toEqual(at(2026, 9, 21, 8, 0));
      expect(computeNextRun(rule, at(2026, 9, 20, 23, 59))).toEqual(at(2026, 9, 21, 8, 0));
    });
    it('rolls over month and year ends', () => {
      expect(computeNextRun(rule, at(2026, 12, 31, 9, 0))).toEqual(at(2027, 1, 1, 8, 0));
    });
  });

  describe('weekly', () => {
    const monday = { frequency: 'weekly', weekday: 1, dayOfMonth: 1, time: '09:30' } as const;
    it('finds the next matching weekday', () => {
      expect(computeNextRun(monday, at(2026, 9, 20, 12, 0))).toEqual(at(2026, 9, 21, 9, 30)); // Sun -> Mon
    });
    it('uses today if the time is still ahead, otherwise next week', () => {
      expect(computeNextRun(monday, at(2026, 9, 21, 8, 0))).toEqual(at(2026, 9, 21, 9, 30));
      expect(computeNextRun(monday, at(2026, 9, 21, 9, 30))).toEqual(at(2026, 9, 28, 9, 30));
    });
  });

  describe('monthly', () => {
    const first = { frequency: 'monthly', weekday: 0, dayOfMonth: 1, time: '08:00' } as const;
    it('uses this month if the day is still ahead', () => {
      expect(computeNextRun({ ...first, dayOfMonth: 25 }, at(2026, 9, 20))).toEqual(at(2026, 9, 25, 8, 0));
    });
    it('moves to next month once the day has passed', () => {
      expect(computeNextRun(first, at(2026, 9, 20))).toEqual(at(2026, 10, 1, 8, 0));
    });
    it('rolls December into January', () => {
      expect(computeNextRun(first, at(2026, 12, 15))).toEqual(at(2027, 1, 1, 8, 0));
    });
    it('handles the 28th in February', () => {
      expect(computeNextRun({ ...first, dayOfMonth: 28 }, at(2027, 2, 1))).toEqual(at(2027, 2, 28, 8, 0));
    });
  });
});

describe('describeRecurrence', () => {
  it('reads naturally', () => {
    expect(describeRecurrence({ frequency: 'daily', weekday: 0, dayOfMonth: 1, time: '08:00' })).toBe('Every day at 8:00 AM');
    expect(describeRecurrence({ frequency: 'weekly', weekday: 0, dayOfMonth: 1, time: '21:05' })).toBe('Every Sunday at 9:05 PM');
    expect(describeRecurrence({ frequency: 'monthly', weekday: 0, dayOfMonth: 1, time: '00:00' })).toBe('Every month on the 1st at 12:00 AM');
    expect(describeRecurrence({ frequency: 'monthly', weekday: 0, dayOfMonth: 22, time: '12:00' })).toBe('Every month on the 22nd at 12:00 PM');
    expect(describeRecurrence({ frequency: 'monthly', weekday: 0, dayOfMonth: 11, time: '12:00' })).toBe('Every month on the 11th at 12:00 PM');
  });
});
