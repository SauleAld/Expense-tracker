import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DepositStore } from '../../core/deposit-store';
import { ExpenseStore } from '../../core/expense-store';
import { addMonths, todayISO, toISODate } from '../../utils/dates';
import { formatMonth } from '../../utils/format';
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

describe('Dashboard, stepping the category chart through months', () => {
  const now = new Date();
  const lastMonthDate = toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 15));
  const twoMonthsAgo = toISODate(new Date(now.getFullYear(), now.getMonth() - 2, 10));
  const label = (monthsBack: number) => formatMonth(addMonths(now, -monthsBack), 'long');

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    const store = TestBed.inject(ExpenseStore);
    store.add({ date: todayISO(), amount: 40, category: 'Groceries', description: 'Market' });
    store.add({ date: lastMonthDate, amount: 120, category: 'Travel', description: 'Train tickets' });
    store.add({ date: lastMonthDate, amount: 30, category: 'Groceries', description: 'Old market' });
    store.add({ date: twoMonthsAgo, amount: 9, category: 'Dining', description: 'Coffee' });
  });

  async function setup() {
    const fixture = TestBed.createComponent(Dashboard);
    await fixture.whenStable();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const card = () => el.querySelector('app-category-breakdown')!;
    const button = (name: string) => card().querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
    const click = async (b: HTMLButtonElement) => {
      b.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    /** Each legend row as "Category $total", ignoring the share. */
    const legend = () =>
      [...card().querySelectorAll('li button')].map((b) => {
        const [name, total] = [...b.querySelectorAll('span')].slice(1, 3).map((x) => x.textContent!.trim());
        return `${name} ${total}`;
      });
    return { el, card, button, click, legend };
  }

  it('starts on this month, with no next month', async () => {
    const { card, button, legend } = await setup();
    expect(card().textContent).toContain(label(0));
    expect(button('Next month').disabled).toBe(true);
    expect(button('Previous month').disabled).toBe(false);
    expect(legend()).toEqual(['Groceries $40.00']);
  });

  it('steps back to last month and shows its categories, then forward again', async () => {
    const { card, button, click, legend } = await setup();
    await click(button('Previous month'));
    expect(card().textContent).toContain(label(1));
    expect(legend()).toEqual(['Travel $120.00', 'Groceries $30.00']);
    expect(button('Next month').disabled).toBe(false);
    await click(button('Next month'));
    expect(card().textContent).toContain(label(0));
  });

  it('stops at the month of your first expense', async () => {
    const { button, click, legend } = await setup();
    await click(button('Previous month'));
    await click(button('Previous month'));
    expect(legend()).toEqual(['Dining $9.00']);
    expect(button('Previous month').disabled).toBe(true);
  });

  it('an open category list follows the month you step to', async () => {
    const { el, button, click, card } = await setup();
    await click(card().querySelector<HTMLButtonElement>('li button')!); // Groceries, this month
    const panel = () => el.querySelector('app-drilldown-panel')!;
    expect(panel().textContent).toContain('Market');
    await click(button('Previous month'));
    expect(panel().querySelector('h2')!.textContent).toBe(`Groceries · ${label(1)}`);
    expect(panel().textContent).toContain('Old market');
    expect(panel().textContent).not.toContain('Train tickets');
    expect(panel().querySelector('a')!.getAttribute('href')).toContain(`from=${lastMonthDate.slice(0, 7)}-01`);
  });

  it('says so for a month with no spending in the chosen category', async () => {
    const { el, button, click, card } = await setup();
    await click(card().querySelector<HTMLButtonElement>('li button')!); // Groceries
    await click(button('Previous month'));
    await click(button('Previous month')); // only Dining that month
    expect(el.querySelector('app-drilldown-panel')!.textContent).toContain('No expenses here.');
  });

  it('leaves the stat cards on this month', async () => {
    const { el, button, click } = await setup();
    await click(button('Previous month'));
    expect(el.querySelector('section[aria-label="Summary"]')!.textContent).toContain(`Spent in ${label(0)}`);
  });
});
