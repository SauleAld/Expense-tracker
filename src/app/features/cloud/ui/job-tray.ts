import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/icon';
import { Spinner } from '../../../shared/spinner';
import { ExportJobs } from '../services/export-jobs';
import { DestTile } from './dest-tile';

/** Shows exports running in the background, wherever you are in the app. */
@Component({
  selector: 'app-job-tray',
  imports: [Icon, Spinner, DestTile, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed z-40 flex flex-col gap-2 max-lg:inset-x-4 max-lg:top-16 lg:bottom-6 lg:left-[17rem] lg:w-96"
      aria-live="polite"
    >
      @for (job of jobs.jobs(); track job.id) {
        <div class="pointer-events-auto rounded-xl border border-line bg-surface p-3 shadow-lg" [attr.data-state]="job.state">
          <div class="flex items-center gap-3">
            <app-dest-tile [id]="job.destination" [size]="34" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ job.title }}</p>
              @switch (job.state) {
                @case ('running') {
                  <p class="truncate text-xs text-ink-2">{{ job.stage }}…</p>
                }
                @case ('done') {
                  <p class="truncate text-xs text-ink-2">{{ job.detail }}</p>
                }
                @case ('failed') {
                  <p class="text-xs text-danger" role="alert">{{ job.error }}</p>
                }
              }
            </div>
            @switch (job.state) {
              @case ('running') {
                <app-spinner class="text-accent" />
              }
              @case ('done') {
                <app-icon name="check" [size]="20" class="text-success" />
              }
              @case ('failed') {
                <app-icon name="warning" [size]="20" class="text-danger" />
              }
            }
            @if (job.state !== 'running') {
              <button type="button" class="icon-btn size-7" aria-label="Dismiss" (click)="jobs.dismiss(job.id)">
                <app-icon name="close" [size]="16" />
              </button>
            }
          </div>
          @if (job.state === 'running') {
            <div
              class="mt-2.5 h-1.5 overflow-hidden rounded-full bg-subtle"
              role="progressbar"
              aria-label="Export progress"
              aria-valuemin="0"
              aria-valuemax="100"
              [attr.aria-valuenow]="Math.round(job.progress * 100)"
            >
              <div class="h-full rounded-full bg-accent" [style.width.%]="job.progress * 100"></div>
            </div>
          } @else if (job.state === 'failed') {
            <a routerLink="/export/history" class="mt-2 inline-block text-xs font-medium text-accent-text hover:underline">View history</a>
          } @else if (job.destination === 'link') {
            <a routerLink="/export/sharing" class="mt-2 inline-block text-xs font-medium text-accent-text hover:underline">Open sharing</a>
          }
        </div>
      }
    </div>
  `,
})
export class JobTray {
  protected readonly jobs = inject(ExportJobs);
  protected readonly Math = Math;
}
