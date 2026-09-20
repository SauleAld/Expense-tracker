import { FormControl } from '@angular/forms';
import { maxDecimals, notBlank, validDate } from './expense-validators';

describe('expense validators', () => {
  describe('maxDecimals(2)', () => {
    const v = maxDecimals(2);
    it.each([1, 1.5, 12.34, 0.01, 1000])('accepts %s', (n) => expect(v(new FormControl(n))).toBeNull());
    it.each([1.234, 0.001, 10.999])('rejects %s', (n) => expect(v(new FormControl(n))).not.toBeNull());
    it('ignores empty values (required handles those)', () => expect(v(new FormControl(null))).toBeNull());
  });

  describe('notBlank', () => {
    it('rejects whitespace-only strings', () => {
      expect(notBlank(new FormControl('   '))).toEqual({ blank: true });
      expect(notBlank(new FormControl(' a '))).toBeNull();
    });
  });

  describe('validDate', () => {
    const v = validDate(() => '2026-09-20');
    it('accepts today and past dates', () => {
      expect(v(new FormControl('2026-09-20'))).toBeNull();
      expect(v(new FormControl('2026-01-01'))).toBeNull();
    });
    it('rejects future, ancient and impossible dates', () => {
      expect(v(new FormControl('2026-09-21'))).toEqual({ dateFuture: true });
      expect(v(new FormControl('1999-12-31'))).toHaveProperty('dateTooOld');
      expect(v(new FormControl('2026-02-30'))).toEqual({ date: true });
    });
  });
});
