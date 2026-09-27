import { TestBed } from '@angular/core/testing';
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
