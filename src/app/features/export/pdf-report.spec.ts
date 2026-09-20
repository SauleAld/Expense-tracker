import { CATEGORIES } from '../../core/models';
import { makeExpense } from '../../utils/test-helpers';
import { buildPdf, pdfSafe } from './pdf-report';

const meta = {
  filters: { from: '', to: '', categories: CATEGORIES },
  exportedAt: new Date(2026, 8, 20, 10, 30),
};

describe('pdfSafe', () => {
  it('keeps Latin-1 and common typographic characters', () => {
    expect(pdfSafe('Café – “quoted” € 5…')).toBe('Café – “quoted” € 5…');
  });
  it('replaces characters the built-in fonts cannot draw', () => {
    expect(pdfSafe('Lunch 🍕 東京')).toBe('Lunch ? ??');
  });
});

describe('buildPdf', () => {
  async function bytesOf(blob: Blob): Promise<string> {
    return new TextDecoder('latin1').decode(await blob.arrayBuffer());
  }

  it('produces a real PDF document', async () => {
    const blob = buildPdf([makeExpense({ description: 'Lunch' })], meta);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(500);
    expect((await bytesOf(blob)).startsWith('%PDF-')).toBe(true);
  });

  it('paginates long lists', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => makeExpense({ description: `Item ${i}` }));
    const text = await bytesOf(buildPdf(rows, meta));
    const pages = (text.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(pages).toBeGreaterThan(2);
  });
});
