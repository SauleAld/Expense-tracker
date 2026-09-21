import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import type { TemplateId, TemplateParams } from '../model/cloud-types';
import { templateMeta } from '../model/templates';

/** The one setting a template exposes (year, months or period), if it has one. */
@Component({
  selector: 'app-template-params',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (param()) {
      @case ('year') {
        <label class="field-label" [for]="idPrefix() + '-year'">Tax year</label>
        <select #yearSelect [id]="idPrefix() + '-year'" class="field" (change)="set('year', +yearSelect.value)">
          @for (y of years(); track y) {
            <option [value]="y" [selected]="params().year === y">{{ y }}</option>
          }
        </select>
      }
      @case ('months') {
        <label class="field-label" [for]="idPrefix() + '-months'">Period</label>
        <select #monthsSelect [id]="idPrefix() + '-months'" class="field" (change)="set('months', +monthsSelect.value === 3 ? 3 : +monthsSelect.value === 12 ? 12 : 6)">
          <option value="3" [selected]="params().months === 3">Last 3 months</option>
          <option value="6" [selected]="params().months === 6">Last 6 months</option>
          <option value="12" [selected]="params().months === 12">Last 12 months</option>
        </select>
      }
      @case ('period') {
        <label class="field-label" [for]="idPrefix() + '-period'">Period</label>
        <select #periodSelect [id]="idPrefix() + '-period'" class="field" (change)="set('period', periodSelect.value === 'year' ? 'year' : periodSelect.value === '90d' ? '90d' : 'all')">
          <option value="all" [selected]="params().period === 'all'">All time</option>
          <option value="year" [selected]="params().period === 'year'">This year</option>
          <option value="90d" [selected]="params().period === '90d'">Last 90 days</option>
        </select>
      }
    }
  `,
})
export class TemplateParamsForm {
  readonly template = input.required<TemplateId>();
  readonly params = model.required<TemplateParams>();
  readonly years = input<number[]>([new Date().getFullYear()]);
  readonly idPrefix = input('tp');

  protected readonly param = computed(() => templateMeta(this.template()).param);

  protected set<K extends keyof TemplateParams>(key: K, value: TemplateParams[K]): void {
    this.params.update((p) => ({ ...p, [key]: value }));
  }
}
