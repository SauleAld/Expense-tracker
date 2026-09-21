import { toISODate } from './dates';
import { formatDate, formatDateTime } from './format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 min ago", "3 h ago", "yesterday", "4 days ago", then a date. */
export function formatRelative(then: Date, now: Date): string {
  const diff = now.getTime() - then.getTime();
  if (diff < 0) {
    // The app's clock only ticks every 30s, so something that just happened can sit a few
    // seconds "ahead" of it. Treat that as now rather than as a future event.
    return diff > -MINUTE ? 'just now' : formatFuture(then, now);
  }
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return formatDate(toISODate(then), 'medium');
}

/** "in 5 min", "in 3 h", "tomorrow", "in 4 days", then a date and time. */
export function formatFuture(then: Date, now: Date): string {
  const diff = then.getTime() - now.getTime();
  if (diff <= 0) return 'now';
  if (diff < MINUTE) return 'in under a minute';
  if (diff < HOUR) return `in ${Math.ceil(diff / MINUTE)} min`;
  if (diff < DAY) return `in ${Math.floor(diff / HOUR)} h`;
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'tomorrow';
  if (days < 7) return `in ${days} days`;
  return formatDateTime(then);
}
