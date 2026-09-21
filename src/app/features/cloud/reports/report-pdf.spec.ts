import { pdfSafe } from './report-pdf';

describe('pdfSafe', () => {
  it('keeps Latin-1 and common typographic characters', () => {
    expect(pdfSafe('Café – “quoted” € 5…')).toBe('Café – “quoted” € 5…');
  });

  it('replaces characters the built-in fonts cannot draw, one "?" per character', () => {
    expect(pdfSafe('Lunch 🍕 東京')).toBe('Lunch ? ??');
  });
});
