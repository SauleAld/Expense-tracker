import type { Frequency } from '../model/cloud-types';

export interface Recurrence {
  frequency: Frequency;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** 1–28, so every month has the day. */
  dayOfMonth: number;
  /** Local time, `HH:MM`. */
  time: string;
}

function at(date: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m, 0, 0);
}

/** The first run strictly after `after`. */
export function computeNextRun(rule: Recurrence, after: Date): Date {
  const today = new Date(after.getFullYear(), after.getMonth(), after.getDate());

  if (rule.frequency === 'daily') {
    const candidate = at(today, rule.time);
    return candidate > after ? candidate : at(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1), rule.time);
  }

  if (rule.frequency === 'weekly') {
    const ahead = (rule.weekday - today.getDay() + 7) % 7;
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + ahead);
    const candidate = at(day, rule.time);
    return candidate > after ? candidate : at(new Date(day.getFullYear(), day.getMonth(), day.getDate() + 7), rule.time);
  }

  const thisMonth = at(new Date(today.getFullYear(), today.getMonth(), rule.dayOfMonth), rule.time);
  return thisMonth > after ? thisMonth : at(new Date(today.getFullYear(), today.getMonth() + 1, rule.dayOfMonth), rule.time);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const WEEKDAY_NAMES = WEEKDAYS;

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

function clock(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** "Every month on the 1st at 8:00 AM". */
export function describeRecurrence(rule: Recurrence): string {
  const when = `at ${clock(rule.time)}`;
  switch (rule.frequency) {
    case 'daily':
      return `Every day ${when}`;
    case 'weekly':
      return `Every ${WEEKDAYS[rule.weekday]} ${when}`;
    case 'monthly':
      return `Every month on the ${ordinal(rule.dayOfMonth)} ${when}`;
  }
}
