import { addDays, toISODate } from './dates';

/** Quick date ranges for list filters. */
export type PresetId = 'all' | 'month' | '30d' | '90d' | 'year';

export const PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'month', label: 'This month' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'year', label: 'This year' },
];

export function presetRange(id: PresetId, now = new Date()): { from: string; to: string } {
  const today = toISODate(now);
  switch (id) {
    case 'all':
      return { from: '', to: '' };
    case 'month':
      return { from: toISODate(new Date(now.getFullYear(), now.getMonth(), 1)), to: today };
    case '30d':
      return { from: toISODate(addDays(now, -29)), to: today };
    case '90d':
      return { from: toISODate(addDays(now, -89)), to: today };
    case 'year':
      return { from: toISODate(new Date(now.getFullYear(), 0, 1)), to: today };
  }
}
