import { addDays, toISODate } from './dates';

export type PresetId = 'all' | 'month' | '30d' | '90d' | 'year';

export const DATE_PRESETS: readonly { id: PresetId; label: string }[] = [
  { id: 'all', label: 'All time' },
  { id: 'month', label: 'This month' },
  { id: '30d', label: 'Last 30 days' },
  { id: '90d', label: 'Last 90 days' },
  { id: 'year', label: 'This year' },
];

/** Inclusive `YYYY-MM-DD` bounds for a preset; empty strings mean unbounded. */
export function presetRange(id: PresetId, now: Date = new Date()): { from: string; to: string } {
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

/** Which preset (if any) the given bounds correspond to. */
export function matchPreset(from: string, to: string, now: Date = new Date()): PresetId | null {
  return (
    DATE_PRESETS.find((p) => {
      const range = presetRange(p.id, now);
      return range.from === from && range.to === to;
    })?.id ?? null
  );
}
