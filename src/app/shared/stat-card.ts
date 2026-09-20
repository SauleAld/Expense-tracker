import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card block' },
  template: `
    <p class="text-sm text-ink-2">{{ label() }}</p>
    <p class="mt-2 truncate text-3xl font-semibold tracking-tight text-ink">{{ value() }}</p>
    <div class="mt-2 min-h-5 text-sm text-ink-2"><ng-content /></div>
  `,
})
export class StatCard {
  readonly label = input.required<string>();
  readonly value = input.required<string>();
}
