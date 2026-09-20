import { TestBed } from '@angular/core/testing';
import { CATEGORIES } from '../../core/models';
import { makeExpense } from '../../utils/test-helpers';
import { DataExport } from './data-export';

const filters = { from: '', to: '', categories: CATEGORIES };
const rows = [makeExpense({ date: '2026-09-01', category: 'Bills', amount: 1450, description: 'Rent' })];

describe('DataExport', () => {
  let saved: { filename: string; blob: Blob }[];
  let service: DataExport;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    vi.useFakeTimers();
    saved = [];
    // Capture what would be downloaded by stubbing the browser APIs downloadBlob relies on.
    let lastBlob!: Blob;
    URL.createObjectURL = vi.fn((blob: Blob) => ((lastBlob = blob), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ filename: this.download, blob: lastBlob });
    });
    service = TestBed.inject(DataExport);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  /** Runs an export to completion, fast-forwarding the minimum busy delay. */
  async function run(format: 'csv' | 'json' | 'pdf', filename: string) {
    const promise = service.export(rows, { format, filename, filters });
    await vi.advanceTimersByTimeAsync(1000);
    return promise;
  }

  it('downloads a CSV with BOM and the expected columns', async () => {
    const result = await run('csv', 'out.csv');
    expect(saved).toHaveLength(1);
    expect(saved[0]!.filename).toBe('out.csv');
    expect(saved[0]!.blob.type).toContain('text/csv');
    // Check the raw bytes: Blob.text() strips a leading BOM, so it can't prove one is there.
    const bytes = new Uint8Array(await saved[0]!.blob.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM so Excel detects the encoding
    const text = await saved[0]!.blob.text();
    expect(text).toBe('Date,Category,Amount,Description\r\n2026-09-01,Bills,1450.00,Rent\r\n');
    expect(result).toEqual({ filename: 'out.csv', bytes: saved[0]!.blob.size });
  });

  it('downloads valid JSON', async () => {
    await run('json', 'out.json');
    expect(saved[0]!.blob.type).toBe('application/json');
    expect(JSON.parse(await saved[0]!.blob.text()).summary.count).toBe(1);
  });

  it('downloads a PDF (lazy-loaded)', async () => {
    await run('pdf', 'out.pdf');
    expect(saved[0]!.blob.type).toBe('application/pdf');
  });

  it('keeps the busy state visible for a minimum time before downloading', async () => {
    const promise = service.export(rows, { format: 'csv', filename: 'x.csv', filters });
    await vi.advanceTimersByTimeAsync(300);
    expect(saved).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(400);
    await promise;
    expect(saved).toHaveLength(1);
  });

  it('rejects and downloads nothing when rendering fails', async () => {
    const bad = { ...rows[0]!, amount: undefined as unknown as number };
    const promise = service.export([bad], { format: 'csv', filename: 'x.csv', filters }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await promise).toBeInstanceOf(Error);
    expect(saved).toHaveLength(0);
  });
});
