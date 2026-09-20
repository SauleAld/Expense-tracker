import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';
import { isValidISODate, todayISO } from '../utils/dates';

export const MIN_DATE = '2000-01-01';
export const MAX_AMOUNT = 1_000_000;
export const MAX_DESCRIPTION = 80;

/** At most two decimal places. */
export const maxDecimals =
  (places: number): ValidatorFn =>
  (control: AbstractControl): ValidationErrors | null => {
    const value = control.value;
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const scaled = Math.round(value * 10 ** places * 1e6) / 1e6;
    return Number.isInteger(scaled) ? null : { decimals: { places } };
  };

export const notBlank: ValidatorFn = (control) =>
  typeof control.value === 'string' && control.value.trim() === '' ? { blank: true } : null;

export const validDate =
  (today: () => string = todayISO): ValidatorFn =>
  (control) => {
    const value = control.value;
    if (typeof value !== 'string' || value === '') return null; // `required` reports empty
    if (!isValidISODate(value)) return { date: true };
    if (value < MIN_DATE) return { dateTooOld: { min: MIN_DATE } };
    if (value > today()) return { dateFuture: true };
    return null;
  };
