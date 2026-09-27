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

describe('Dashboard, click a chart to see its expenses', () => {
  const today = todayISO();
  const monthKey = today.slice(0, 7);

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const store = TestBed.inject(ExpenseStore);
    store.add({ date: today, amount: 40, category: 'Groceries', description: 'Market' });
    store.add({ date: today, amount: 25, category: 'Groceries', description: 'Bakery' });
    store.add({ date: today, amount: 300, category: 'Bills', description: 'Power' });
  });

  async function setup() {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { el, settle };
  }
  const panel = (el: HTMLElement) => el.querySelector('app-drilldown-panel');
  const legendButton = (el: HTMLElement, category: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('app-category-breakdown li button')].find((b) => b.textContent!.includes(category))!;

  it('clicking a category lists its expenses under the chart, biggest first', async () => {
    const { el, settle } = await setup();
    expect(panel(el)).toBeNull();
    legendButton(el, 'Groceries').click();
    await settle();
    const p = panel(el)!;
    expect(p.querySelector('h2')!.textContent).toMatch(/^Groceries · /);
    expect(p.textContent).toContain('2 expenses');
    expect(p.textContent).toContain('$65.00');
    expect([...p.querySelectorAll('li')].map((li) => li.querySelector('p')!.textContent!.trim())).toEqual(['Market', 'Bakery']);
    expect(p.textContent).not.toContain('Power');
    expect(legendButton(el, 'Groceries').getAttribute('aria-pressed')).toBe('true');
    // Right under the category chart, before the monthly chart.
    const order = [...el.querySelectorAll('app-category-breakdown, app-drilldown-panel, app-monthly-chart')].map((n) => n.tagName.toLowerCase());
    expect(order).toEqual(['app-category-breakdown', 'app-drilldown-panel', 'app-monthly-chart']);
  });

  it('a bar segment works too, and so does the keyboard', async () => {
    const { el, settle } = await setup();
    const segment = el.querySelector<HTMLElement>('app-category-breakdown [role="button"][aria-label^="Bills"]')!;
    segment.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(panel(el)!.textContent).toContain('Power');
  });

  it('clicking the same category again, or the close button, hides the list', async () => {
    const { el, settle } = await setup();
    legendButton(el, 'Groceries').click();
    await settle();
    legendButton(el, 'Groceries').click();
    await settle();
    expect(panel(el)).toBeNull();

    legendButton(el, 'Bills').click();
    await settle();
    panel(el)!.querySelector<HTMLButtonElement>('button[aria-label^="Close"]')!.click();
    await settle();
    expect(panel(el)).toBeNull();
  });

  it('clicking a month lists every category’s expenses for it, under the monthly chart', async () => {
    const { el, settle } = await setup();
    const bars = [...el.querySelectorAll<SVGRectElement>('app-monthly-chart rect[role="button"]')];
    expect(bars).toHaveLength(6);
    bars[5]!.dispatchEvent(new MouseEvent('click'));
    await settle();
    const p = panel(el)!;
    expect(p.textContent).toContain('3 expenses');
    expect(p.textContent).toContain('$365.00');
    expect(p.querySelectorAll('app-category-badge')).toHaveLength(3);
    expect(bars[5]!.getAttribute('aria-pressed')).toBe('true');
    // Right under the monthly chart, before the recent expenses.
    const order = [...el.querySelectorAll('app-monthly-chart, app-drilldown-panel, section')].map((n) => n.tagName.toLowerCase()).slice(-3);
    expect(order).toEqual(['app-monthly-chart', 'app-drilldown-panel', 'section']);
  });

  it('switching from a category to a month moves the list', async () => {
    const { el, settle } = await setup();
    legendButton(el, 'Groceries').click();
    await settle();
    el.querySelectorAll<SVGRectElement>('app-monthly-chart rect[role="button"]')[5]!.dispatchEvent(new MouseEvent('click'));
    await settle();
    expect(el.querySelectorAll('app-drilldown-panel')).toHaveLength(1);
    expect(panel(el)!.textContent).toContain('3 expenses');
    expect(legendButton(el, 'Groceries').getAttribute('aria-pressed')).toBe('false');
  });

  it('links to the Expenses page with the same filters', async () => {
    const { el, settle } = await setup();
    legendButton(el, 'Groceries').click();
    await settle();
    const href = panel(el)!.querySelector('a')!.getAttribute('href')!;
    expect(href).toBe(`/expenses?category=Groceries&from=${monthKey}-01&to=${today}`);
  });

  it('shows the first 8 and says how many more there are', async () => {
    const store = TestBed.inject(ExpenseStore);
    for (let i = 0; i < 9; i++) store.add({ date: today, amount: 1 + i, category: 'Dining', description: `Meal ${i}` });
    const { el, settle } = await setup();
    legendButton(el, 'Dining').click();
    await settle();
    expect(panel(el)!.querySelectorAll('li')).toHaveLength(8);
    expect(panel(el)!.textContent).toContain('See all 9 on the Expenses page');
  });
});
