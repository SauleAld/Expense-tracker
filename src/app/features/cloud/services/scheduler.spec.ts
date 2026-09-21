import { TestBed } from '@angular/core/testing';
import { ExpenseStore } from '../../../core/expense-store';
import type { Schedule } from '../model/cloud-types';
import { defaultOptions } from '../model/destinations';
import { DEFAULT_PARAMS } from '../reports/report-builders';
import { CloudStore } from './cloud-store';
import { ExportJobs } from './export-jobs';
import { Scheduler } from './scheduler';

const NOW = new Date(2026, 8, 20, 12, 0);
const iso = (d: Date) => d.toISOString();

function schedule(over: Partial<Schedule> = {}): Schedule {
  const options = defaultOptions('x');
  options.email.to = ['a@x.co'];
  return {
    id: 's1', name: 'n', template: 'tax', params: { ...DEFAULT_PARAMS(NOW), year: 2020 }, format: 'csv', destination: 'email', options,
    frequency: 'monthly', weekday: 1, dayOfMonth: 1, time: '08:00', enabled: true,
    createdAt: iso(NOW), nextRunAt: iso(new Date(2026, 8, 20, 11, 0)), lastRunAt: null, lastStatus: null,
    ...over,
  };
}

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let store: CloudStore;
  let jobs: ExportJobs;
  let started: unknown[];

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    TestBed.inject(ExpenseStore);
    store = TestBed.inject(CloudStore);
    jobs = TestBed.inject(ExportJobs);
    scheduler = TestBed.inject(Scheduler);
    started = [];
    vi.spyOn(jobs, 'start').mockImplementation((r) => (started.push(r), 'id'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('starts a due automation and moves it to its next slot before the job runs', () => {
    store.addSchedule(schedule());
    expect(scheduler.runDue(NOW, false)).toBe(1);
    const s = store.schedules()[0]!;
    expect(s.nextRunAt).toBe(iso(new Date(2026, 9, 1, 8, 0))); // Oct 1, 08:00
    expect(s.lastRunAt).toBe(iso(NOW));
    expect(started[0]).toMatchObject({ trigger: 'scheduled', scheduleId: 's1', destination: 'email', catchUp: false });
  });

  it('does not run twice for the same slot', () => {
    store.addSchedule(schedule());
    scheduler.runDue(NOW, false);
    expect(scheduler.runDue(NOW, false)).toBe(0);
    expect(started).toHaveLength(1);
  });

  it('skips paused automations and ones not yet due', () => {
    store.addSchedule(schedule({ id: 'paused', enabled: false }));
    store.addSchedule(schedule({ id: 'future', nextRunAt: iso(new Date(2026, 8, 21)) }));
    expect(scheduler.runDue(NOW, false)).toBe(0);
    expect(store.schedules().find((s) => s.id === 'paused')!.nextRunAt).toBe(iso(new Date(2026, 8, 20, 11, 0))); // untouched
  });

  it('runs the Tax Report for the current year, whatever year was saved', () => {
    store.addSchedule(schedule());
    scheduler.runDue(NOW, false);
    expect((started[0] as { params: { year: number } }).params.year).toBe(2026);
  });

  it('runs each due automation once when catching up on open, marked as a catch-up', () => {
    store.addSchedule(schedule({ id: 'a', nextRunAt: iso(new Date(2026, 8, 1)) })); // missed weeks ago
    store.addSchedule(schedule({ id: 'b' }));
    scheduler.start();
    expect(started).toHaveLength(2);
    expect(started.every((r) => (r as { catchUp: boolean }).catchUp)).toBe(true);
  });

  it('keeps checking on a timer once started, and only starts once', async () => {
    scheduler.start();
    scheduler.start();
    store.addSchedule(schedule({ nextRunAt: iso(new Date(Date.now() + 20_000)) }));
    await vi.advanceTimersByTimeAsync(31_000);
    expect(started).toHaveLength(1);
    expect((started[0] as { catchUp: boolean }).catchUp).toBe(false);
  });

  it('"Run now" runs immediately without moving the schedule', () => {
    store.addSchedule(schedule({ nextRunAt: iso(new Date(2026, 9, 1)) }));
    scheduler.runNow('s1');
    expect(started[0]).toMatchObject({ trigger: 'manual', scheduleId: 's1' });
    expect(store.schedules()[0]!.nextRunAt).toBe(iso(new Date(2026, 9, 1)));
    scheduler.runNow('missing');
    expect(started).toHaveLength(1);
  });
});
