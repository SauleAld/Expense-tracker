import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ExpenseDialog, type DialogState } from '../core/expense-dialog';
import { ExpenseStore } from '../core/expense-store';
import { CATEGORIES, categoryColor, type Category } from '../core/models';
import { ToastService } from '../core/toast';
import { todayISO } from '../utils/dates';
import {
  MAX_AMOUNT,
  MAX_DESCRIPTION,
  maxDecimals,
  notBlank,
  validDate,
} from './expense-validators';
import { Icon } from './icon';

type FieldName = 'amount' | 'date' | 'description';

const MESSAGES: Record<FieldName, Record<string, string>> = {
  amount: {
    required: 'Enter an amount.',
    min: 'Amount must be greater than $0.',
    max: 'Amount can be at most $1,000,000.',
    decimals: 'Use at most two decimal places.',
  },
  date: {
    required: 'Pick a date.',
    date: 'Enter a valid date.',
    dateTooOld: 'Date must be in 2000 or later.',
    dateFuture: 'Date can’t be in the future.',
  },
  description: {
    required: 'Enter a description.',
    blank: 'Enter a description.',
    maxlength: `Keep it under ${MAX_DESCRIPTION} characters.`,
  },
};

@Component({
  selector: 'app-expense-form-dialog',
  imports: [ReactiveFormsModule, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './expense-form-dialog.html',
})
export class ExpenseFormDialog {
  private readonly dialog = inject(ExpenseDialog);
  private readonly store = inject(ExpenseStore);
  private readonly toast = inject(ToastService);
  private readonly dialogEl = viewChild<ElementRef<HTMLDialogElement>>('dialogEl');

  protected readonly categories = CATEGORIES;
  protected readonly maxDescription = MAX_DESCRIPTION;
  protected readonly isEdit = computed(() => this.dialog.state()?.mode === 'edit');
  protected readonly submitted = signal(false);
  protected readonly maxDate = signal(todayISO());

  protected readonly form = new FormGroup({
    amount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
      Validators.max(MAX_AMOUNT),
      maxDecimals(2),
    ]),
    date: new FormControl('', { nonNullable: true, validators: [Validators.required, validDate()] }),
    category: new FormControl<Category>('Food', { nonNullable: true }),
    description: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, notBlank, Validators.maxLength(MAX_DESCRIPTION)],
    }),
  });

  constructor() {
    effect(() => {
      const state = this.dialog.state();
      const el = this.dialogEl()?.nativeElement;
      if (!el) return;
      if (state) {
        untracked(() => {
          this.resetFor(state);
          if (!el.open) el.showModal();
        });
      } else if (el.open) {
        el.close();
      }
    });
  }

  protected color(category: Category): string {
    return categoryColor(category);
  }

  protected close(): void {
    this.dialog.close();
  }

  protected onDialogClick(event: MouseEvent): void {
    // Only the <dialog> itself is hit when clicking the backdrop (the content wrapper fills it).
    if (event.target === this.dialogEl()?.nativeElement) this.close();
  }

  protected error(name: FieldName): string | null {
    const control = this.form.controls[name];
    if (!control.errors || !(control.touched || this.submitted())) return null;
    const key = Object.keys(control.errors)[0]!;
    return MESSAGES[name][key] ?? 'Invalid value.';
  }

  protected submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      const firstInvalid = (['amount', 'date', 'description'] as const).find(
        (name) => this.form.controls[name].invalid,
      );
      this.dialogEl()
        ?.nativeElement.querySelector<HTMLElement>(`[formControlName="${firstInvalid}"]`)
        ?.focus();
      return;
    }

    const { amount, date, category, description } = this.form.getRawValue();
    const input = { amount: amount!, date, category, description: description.trim() };
    const state = this.dialog.state();

    if (state?.mode === 'edit') {
      const updated = this.store.update(state.expense.id, input);
      updated ? this.toast.show('Expense updated') : this.toast.error('That expense no longer exists.');
    } else {
      this.store.add(input);
      this.toast.show('Expense added');
    }
    this.close();
  }

  private resetFor(state: DialogState): void {
    this.submitted.set(false);
    this.maxDate.set(todayISO());
    if (state.mode === 'edit') {
      const { amount, date, category, description } = state.expense;
      this.form.reset({ amount, date, category, description });
    } else {
      this.form.reset({ amount: null, date: todayISO(), category: 'Food', description: '' });
    }
  }
}
