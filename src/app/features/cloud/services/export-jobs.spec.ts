import { TestBed } from '@angular/core/testing';
import { ExpenseStore } from '../../../core/expense-store';
import type { DestinationId, ExportRequest } from '../model/cloud-types';
import { defaultOptions } from '../model/destinations';
import { DEFAULT_PARAMS } from '../reports/report-builders';
import { CloudStore } from './cloud-store';
import { ExportJobs } from './export-jobs';

const NOW = new Date();

function request(destination: DestinationId, patch: Partial<ExportRequest> = {}): ExportRequest {
  return {
    template: 'ledger',
    params: DEFAULT_PARAMS(NOW),
    format: 'csv',
    destination,
    options: defaultOptions('Full Ledger'),
    trigger: 'manual',
    ...patch,
  };
}

describe('ExportJobs', () => {
  let jobs: ExportJobs;
  let store: CloudStore;
  let downloads: { filename: string; size: number }[];
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    downloads = [];
    let lastBlob!: Blob;
    URL.createObjectURL = vi.fn((blob: Blob) => ((lastBlob = blob), 'blob:test'));
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ filename: this.download, size: lastBlob.size });
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    TestBed.inject(ExpenseStore).addMany([
      { date: '2026-09-01', amount: 100, category: 'Bills', description: 'Rent' },
      { date: '2026-09-02', amount: 20, category: 'Food', description: 'Lunch' },
    ]);
    jobs = TestBed.inject(ExportJobs);
    store = TestBed.inject(CloudStore);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  const settle = () => vi.advanceTimersByTimeAsync(6000);

  it('runs in the background with staged progress, then completes', async () => {
    jobs.start(request('download'));
    expect(jobs.jobs()[0]).toMatchObject({ state: 'running', stage: 'Preparing report' });
    expect(jobs.runningCount()).toBe(1);

    await vi.advanceTimersByTimeAsync(600);
    const mid = jobs.jobs()[0]!;
    expect(mid.state).toBe('running');
    expect(mid.progress).toBeGreaterThan(0.2);
    expect(mid.progress).toBeLessThan(1);

    await settle();
    expect(jobs.jobs()[0]).toMatchObject({ state: 'done', progress: 1 });
    expect(jobs.runningCount()).toBe(0);
  });

  it('downloads a real file and records it in history', async () => {
    jobs.start(request('download'));
    await settle();
    expect(downloads).toHaveLength(1);
    expect(downloads[0]!.filename).toMatch(/^expense-ledger-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(downloads[0]!.size).toBeGreaterThan(50);
    expect(store.history()[0]).toMatchObject({ status: 'completed', destination: 'download', records: 2, trigger: 'manual' });
    expect(store.history()[0]!.bytes).toBe(downloads[0]!.size);
  });

  it('removes a finished job from the tray after a while', async () => {
    jobs.start(request('download'));
    await settle();
    expect(jobs.jobs()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(7000);
    expect(jobs.jobs()).toHaveLength(0);
  });

  it('keeps a failed job in the tray until dismissed', async () => {
    const id = jobs.start(request('email'));
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(jobs.jobs()[0]).toMatchObject({ id, state: 'failed' });
    jobs.dismiss(id);
    expect(jobs.jobs()).toEqual([]);
  });

  it('fails email without recipients, saying why, and records the failure', async () => {
    jobs.start(request('email'));
    await settle();
    expect(jobs.jobs()[0]!.error).toBe('Add at least one recipient.');
    expect(store.history()[0]).toMatchObject({ status: 'failed', error: 'Add at least one recipient.' });
    expect(downloads).toHaveLength(0);
  });

  it('sends a (simulated) email to every recipient', async () => {
    const options = defaultOptions('Full Ledger');
    options.email.to = ['a@x.co', 'b@x.co'];
    jobs.start(request('email', { options }));
    await settle();
    expect(store.history()[0]).toMatchObject({ status: 'completed', detail: 'Sent to a@x.co, b@x.co' });
    expect(downloads).toHaveLength(0); // email doesn't download anything
  });

  it('refuses a provider that is not connected', async () => {
    jobs.start(request('dropbox'));
    await settle();
    expect(jobs.jobs()[0]!.error).toMatch(/Dropbox isn’t connected/);
    expect(store.history()[0]!.status).toBe('failed');
  });

  it('refuses a provider whose sign-in expired', async () => {
    store.connect('dropbox');
    store.patchConnection('dropbox', { status: 'error' });
    jobs.start(request('dropbox'));
    await settle();
    expect(jobs.jobs()[0]!.error).toMatch(/needs to be reconnected/);
  });

  it('uploads to a connected provider and updates its last-sync time', async () => {
    store.connect('dropbox');
    const options = defaultOptions('Full Ledger');
    options.storage.folder = '/Documents/Finance';
    jobs.start(request('dropbox', { options }));
    await settle();
    const entry = store.history()[0]!;
    expect(entry.status).toBe('completed');
    expect(entry.detail).toMatch(/^Dropbox: \/Documents\/Finance\/expense-ledger-.*\.csv$/);
    expect(store.connection('dropbox')!.lastSyncAt).not.toBeNull();
    expect(store.usedBytes('dropbox')).toBe(entry.bytes);
  });

  it('writes rows to Google Sheets', async () => {
    store.connect('sheets');
    jobs.start(request('sheets'));
    await settle();
    expect(store.history()[0]!.detail).toBe('Spendwise Export › Spendwise · 2 rows (create)');
  });

  it('creates a real share link with a snapshot of the report', async () => {
    const options = defaultOptions('Full Ledger');
    options.link = { expiresIn: '24h', allowDownload: false };
    jobs.start(request('link', { options }));
    await settle();
    const link = store.shares()[0]!;
    expect(link).toMatchObject({ template: 'ledger', allowDownload: false, views: 0, revoked: false });
    expect(link.snapshot.recordCount).toBe(2);
    expect(new Date(link.expiresAt!).getTime()).toBeGreaterThan(Date.now());
    expect(store.history()[0]!.detail).toContain(`/shared/${link.id}`);
  });

  it('updates the schedule with the result of a scheduled run', async () => {
    const options = defaultOptions('Full Ledger');
    store.addSchedule({
      id: 's1', name: 'n', template: 'ledger', params: DEFAULT_PARAMS(NOW), format: 'csv', destination: 'email', options,
      frequency: 'daily', weekday: 0, dayOfMonth: 1, time: '08:00', enabled: true,
      createdAt: NOW.toISOString(), nextRunAt: NOW.toISOString(), lastRunAt: null, lastStatus: null,
    });
    jobs.start(request('email', { trigger: 'scheduled', scheduleId: 's1', catchUp: true }));
    await settle();
    expect(store.schedules()[0]!.lastStatus).toBe('failed'); // no recipients
    expect(store.schedules()[0]!.lastRunAt).not.toBeNull();
    expect(store.history()[0]).toMatchObject({ trigger: 'scheduled', catchUp: true, scheduleId: 's1' });
  });

  it('lets several jobs run at once', async () => {
    jobs.start(request('download'));
    jobs.start(request('download'));
    expect(jobs.runningCount()).toBe(2);
    await settle();
    expect(downloads).toHaveLength(2);
  });
});
