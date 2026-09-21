import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icon } from '../../../shared/icon';
import type { DestinationId } from '../model/cloud-types';
import { destinationMeta } from '../model/destinations';

@Component({
  selector: 'app-dest-tile',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0' },
  template: `
    <span
      class="flex items-center justify-center rounded-xl text-white"
      [style.background-color]="meta().color"
      [style.width.px]="size()"
      [style.height.px]="size()"
    >
      <app-icon [name]="meta().icon" [size]="iconSize()" />
    </span>
  `,
})
export class DestTile {
  readonly id = input.required<DestinationId>();
  readonly size = input(40);
  protected readonly meta = computed(() => destinationMeta(this.id()));
  protected readonly iconSize = computed(() => Math.round(this.size() * 0.5));
}
