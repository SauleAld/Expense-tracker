import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DepositStore } from '../../core/deposit-store';
import type { DepositInput } from '../../core/models';
import { ToastService } from '../../core/toast';
import { addMonths, todayISO, toISODate } from '../../utils/dates';
import { Deposits } from './deposits';

const today = todayISO();
const lastMonth = toISODate(addMonths(new Date(), -1));
const input = (over: Partial<DepositInput>): DepositInput => ({
  date: today,
  amount: 100,
  description: 'Payroll',
  accountName: 'Checking',
  externalId: Math.random().toString(36),
  source: 'simplefin',
  ...over,
});

async function render() {
  const fixture = TestBed.createComponent(Deposits);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('Deposits page', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('points you to Bank sync when there are no deposits yet', async () => {
    const { el } = await render();
    expect(el.textContent).toContain('No deposits yet');
    expect(el.querySelector('a[href="/bank"]')).toBeTruthy();
  });

  it('lists deposits newest first with account and amount, and shows this month and all-time totals', async () => {
    TestBed.inject(DepositStore).addMany([
      input({ date: lastMonth, amount: 1000, description: 'Old payroll' }),
      input({ amount: 2400.5, description: 'Payroll' }),
      input({ amount: 3.25, description: 'Interest', accountName: 'Savings' }),
    ]);
    const { el } = await render();
    const rows = [...el.querySelectorAll('section[aria-label="Deposit list"] li')];
    expect(rows).toHaveLength(3);
    expect(rows[2]!.textContent).toContain('Old payroll');
    expect(el.textContent).toContain('Savings');
    expect(el.textContent).toContain('+$2,400.50');
    const summary = el.querySelector('section[aria-label="Summary"]')!.textContent!;
    expect(summary).toContain('$2,403.75'); // this month
    expect(summary).toContain('$3,403.75'); // all time
    expect(summary).toContain('3 deposits · all time');
  });

  it('searches, and totals only what matches', async () => {
    TestBed.inject(DepositStore).addMany([input({ amount: 50, description: 'Venmo from Sam' }), input({ amount: 900 })]);
    const { el, fixture } = await render();
    const search = el.querySelector<HTMLInputElement>('#deposit-search')!;
    search.value = 'venmo';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelectorAll('section[aria-label="Deposit list"] li')).toHaveLength(1);
    expect(el.textContent).toMatch(/1 deposit\s*matching your filters/);
    expect(el.textContent).toMatch(/Total\s*\$50\.00/);
  });

  it('deletes a deposit, with undo', async () => {
    TestBed.inject(DepositStore).addMany([input({})]);
    const { el, fixture } = await render();
    el.querySelector<HTMLButtonElement>('button[aria-label="Delete Payroll"]')!.click();
    await fixture.whenStable();
    expect(TestBed.inject(DepositStore).count()).toBe(0);
    const [toast] = TestBed.inject(ToastService).toasts();
    expect(toast!.message).toBe('Deleted “Payroll”');
    toast!.action!.run();
    expect(TestBed.inject(DepositStore).count()).toBe(1);
  });
});
