import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { categoryColor, type Category } from '../core/models';

@Component({
  selector: 'app-category-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex items-center gap-1.5 rounded-full bg-subtle px-2.5 py-1 text-xs font-medium text-ink-2' },
  template: `
    <span class="size-2 rounded-full" [style.background-color]="color()"></span>
    {{ category() }}
  `,
})
export class CategoryBadge {
  readonly category = input.required<Category>();
  protected color() {
    return categoryColor(this.category());
  }
}
