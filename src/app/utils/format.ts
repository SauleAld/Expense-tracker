import { parseISODate } from './dates';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const currencyWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});
const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 0 });

export const formatCurrency = (amount: number): string => currency.format(amount);
export const formatWhole = (amount: number): string => currencyWhole.format(amount);
export const formatPercent = (ratio: number): string => percent.format(ratio);

/** Axis tick: `$1,000` for whole numbers, `$0.50` otherwise. */
export function formatTick(value: number): string {
  return Number.isInteger(value) ? currencyWhole.format(value) : currency.format(value);
}

const dateFormats = {
  short: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }),
  medium: new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  long: new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }),
};

export function formatDate(iso: string, style: keyof typeof dateFormats = 'medium'): string {
  return dateFormats[style].format(parseISODate(iso));
}

export function formatMonth(date: Date, style: 'short' | 'long' = 'short'): string {
  return new Intl.DateTimeFormat('en-US', {
    month: style,
    ...(style === 'long' ? { year: 'numeric' } : {}),
  }).format(date);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? singular : plural}`;
}

const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });
export const formatDateTime = (date: Date): string => dateTime.format(date);
