import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DepositStore } from '../../core/deposit-store';
import { ExpenseStore } from '../../core/expense-store';
import { todayISO } from '../../utils/dates';
import { Dashboard } from './dashboard';

async function render() {
  const fixture = TestBed.createComponent(Dashboard);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const card = (el: HTMLElement) => el.querySelector('section[aria-labelledby="cashflow-title"]');
/** Each figure as "label: value", read from the card's term and first detail. */
const figures = (el: HTMLElement) =>
  [...card(el)!.querySelectorAll('dl > div')].map(
    (d) => `${d.querySelector('dt')!.textContent!.trim()}: ${d.querySelector('dd')!.textContent!.trim()}`,
  );

describe('Dashboard, money in vs spending', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(ExpenseStore).add({ date: todayISO(), amount: 300, category: 'Bills', description: 'Power' });
  });

  it('stays hidden until there is a deposit', async () => {
    expect(card(await render())).toBeNull();
  });

  it('shows money in, spending and what is left over this month', async () => {
    TestBed.inject(DepositStore).addMany([
      { date: todayISO(), amount: 1000, description: 'Pay', accountName: '', externalId: 'd', source: 'csv' },
    ]);
    expect(figures(await render())).toEqual(['Money in: +$1,000.00', 'Spent: $300.00', 'Left over: +$700.00']);
  });

  it('says so when spending is more than came in', async () => {
    TestBed.inject(DepositStore).addMany([
      { date: todayISO(), amount: 100, description: 'Pay', accountName: '', externalId: 'd', source: 'csv' },
    ]);
    expect(figures(await render())[2]).toBe('Spent more than came in: −$200.00');
  });
});
