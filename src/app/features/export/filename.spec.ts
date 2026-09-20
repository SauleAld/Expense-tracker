import { defaultBaseName, fullFilename, validateFilename } from './filename';

describe('filename', () => {
  it('builds a dated default name', () => {
    expect(defaultBaseName(new Date(2026, 8, 20))).toBe('spendwise-expenses-2026-09-20');
  });

  describe('validateFilename', () => {
    it.each(['report', 'my expenses 2026', 'q3_report-final', 'résumé'])('accepts %j', (n) => {
      expect(validateFilename(n)).toBeNull();
    });
    it.each(['', '   '])('rejects empty %j', (n) => expect(validateFilename(n)).toMatch(/Enter a file name/));
    it.each(['a/b', 'a\\b', 'a:b', 'a*b', 'a?b', 'a"b', 'a<b', 'a>b', 'a|b', 'a\u0001b'])('rejects illegal characters in %j', (n) => {
      expect(validateFilename(n)).toMatch(/can’t contain/);
    });
    it('rejects names that are too long or end with a dot', () => {
      expect(validateFilename('x'.repeat(101))).toMatch(/under 100/);
      expect(validateFilename('x'.repeat(100))).toBeNull();
      expect(validateFilename('report.')).toMatch(/end with a dot/);
    });
  });

  describe('fullFilename', () => {
    it('appends the extension and trims', () => {
      expect(fullFilename('  report ', 'csv')).toBe('report.csv');
    });
    it('does not double a known extension, and swaps it for the chosen format', () => {
      expect(fullFilename('report.csv', 'csv')).toBe('report.csv');
      expect(fullFilename('report.CSV', 'json')).toBe('report.json');
      expect(fullFilename('data.v2', 'pdf')).toBe('data.v2.pdf');
    });
  });
});
