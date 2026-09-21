import { DestroyRef, Injectable, inject } from '@angular/core';
import { CloudStore } from './cloud-store';
import { ExportJobs } from './export-jobs';
import { computeNextRun } from './schedule-math';

const CHECK_EVERY_MS = 15_000;

/**
 * Runs automations. There is no server here, so runs happen while Spendwise is open. On open it does
 * one catch-up run for anything that came due while the app was closed, then advances the schedule.
 */
@Injectable({ providedIn: 'root' })
export class Scheduler {
  private readonly store = inject(CloudStore);
  private readonly jobs = inject(ExportJobs);
  private readonly destroyRef = inject(DestroyRef);
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.runDue(new Date(), true);
    const id = setInterval(() => this.runDue(new Date(), false), CHECK_EVERY_MS);
    this.destroyRef.onDestroy(() => clearInterval(id));
  }

  /** Starts every enabled automation whose time has come. Returns how many were started. */
  runDue(now: Date, catchUp: boolean): number {
    let started = 0;
    for (const schedule of this.store.schedules()) {
      if (!schedule.enabled || new Date(schedule.nextRunAt) > now) continue;
      // Advance first so a slow job can never cause a second run of the same slot.
      this.store.patchSchedule(schedule.id, {
        nextRunAt: computeNextRun(schedule, now).toISOString(),
        lastRunAt: now.toISOString(),
      });
      this.jobs.start({
        template: schedule.template,
        // Tax Report on a schedule always means "the current year when it runs".
        params: { ...schedule.params, year: now.getFullYear() },
        format: schedule.format,
        destination: schedule.destination,
        options: schedule.options,
        trigger: 'scheduled',
        scheduleId: schedule.id,
        catchUp,
      });
      started++;
    }
    return started;
  }

  /** "Run now" on an automation: runs it immediately without moving its next scheduled time. */
  runNow(scheduleId: string): void {
    const schedule = this.store.schedules().find((s) => s.id === scheduleId);
    if (!schedule) return;
    this.jobs.start({
      template: schedule.template,
      params: { ...schedule.params, year: new Date().getFullYear() },
      format: schedule.format,
      destination: schedule.destination,
      options: schedule.options,
      trigger: 'manual',
      scheduleId,
    });
  }
}
