import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ExpenseStore } from '../../core/expense-store';
import { BankInbox } from '../bank/services/bank-inbox';
import { Expenses } from './expenses';

async function render() {
  const fixture = TestBed.createComponent(Expenses);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, store: TestBed.inject(ExpenseStore) };
}

describe('Expenses page, refunds', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'expenses', component: Expenses }])] });
    const store = TestBed.inject(ExpenseStore);
    const shoes = store.add({ date: '2026-09-01', amount: 80, category: 'Shopping', description: 'Shoes', externalId: 'p', source: 'csv' });
    store.addRefund(shoes.id, { externalId: 'r', date: '2026-09-08', amount: 80, description: 'Shoes refund', source: 'csv' });
    store.add({ date: '2026-09-02', amount: 20, category: 'Dining', description: 'Lunch' });
  });

  it('shows a refunded expense at what it really cost, with the original crossed out', async () => {
    const { el } = await render();
    const row = [...el.querySelectorAll('li')].find((li) => li.textContent!.includes('Shoes'))!;
    expect(row.textContent).toContain('Refunded $80.00 on Sep 8, 2026');
    expect(row.textContent).toContain('$0.00');
    expect(row.querySelector('.line-through')!.textContent).toContain('$80.00');
  });

  it('totals the list after refunds', async () => {
    const { el } = await render();
    expect(el.textContent).toMatch(/Total\s*\$20\.00/);
  });

  it('"Unmatch" takes the refund off and sends it back to Bank sync', async () => {
    const { el, fixture, store } = await render();
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Unmatch')!;
    button.click();
    await fixture.whenStable();
    expect(store.expenses().find((e) => e.description === 'Shoes')!.refunds).toBeUndefined();
    expect(TestBed.inject(BankInbox).toReview()).toMatchObject([{ id: 'r', kind: 'refund' }]);
    expect(el.textContent).not.toContain('Refunded');
    expect(el.textContent).toMatch(/Total\s*\$100\.00/);
  });
});

describe('Expenses page, opened from a dashboard link', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: 'expenses', component: Expenses }])] });
    const store = TestBed.inject(ExpenseStore);
    store.add({ date: '2026-09-03', amount: 40, category: 'Groceries', description: 'Market' });
    store.add({ date: '2026-09-04', amount: 15, category: 'Dining', description: 'Tacos' });
    store.add({ date: '2026-08-20', amount: 70, category: 'Groceries', description: 'August shop' });
  });

  async function open(url: string) {
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(Expenses);
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('applies the category and dates from the link', async () => {
    const el = await open('/expenses?category=Groceries&from=2026-09-01&to=2026-09-30');
    expect(el.querySelector<HTMLSelectElement>('#filter-category')!.value).toBe('Groceries');
    expect(el.querySelector<HTMLInputElement>('#filter-from')!.value).toBe('2026-09-01');
    expect(el.textContent).toContain('Market');
    expect(el.textContent).not.toContain('Tacos');
    expect(el.textContent).not.toContain('August shop');
    expect(el.textContent).toMatch(/1 expense\s*matching your filters/);
  });

  it('ignores filters it does not understand', async () => {
    const el = await open('/expenses?category=Pets&from=yesterday');
    expect(el.textContent).toContain('3 expenses');
    expect(el.textContent).not.toContain('matching your filters');
  });
});
