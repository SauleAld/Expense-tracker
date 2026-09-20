import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast';
import { Icon } from './icon';

@Component({
  selector: 'app-toast-container',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="pointer-events-none fixed inset-x-4 bottom-24 z-50 flex flex-col items-center gap-2 lg:inset-x-auto lg:right-6 lg:bottom-6 lg:items-end"
      aria-live="polite"
    >
      @for (toast of toasts.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pr-2 pl-3.5 shadow-lg"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <app-icon
            [name]="toast.kind === 'error' ? 'warning' : 'check'"
            [class]="toast.kind === 'error' ? 'text-danger' : 'text-success'"
          />
          <p class="min-w-0 flex-1 text-sm text-ink">{{ toast.message }}</p>
          @if (toast.action; as action) {
            <button
              type="button"
              class="rounded-md px-2.5 py-1 text-sm font-semibold text-accent-text hover:bg-subtle"
              (click)="action.run(); toasts.dismiss(toast.id)"
            >
              {{ action.label }}
            </button>
          }
          <button type="button" class="icon-btn size-7" aria-label="Dismiss" (click)="toasts.dismiss(toast.id)">
            <app-icon name="close" [size]="16" />
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainer {
  protected readonly toasts = inject(ToastService);
}
