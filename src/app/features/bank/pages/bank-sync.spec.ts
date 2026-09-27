import { TestBed } from '@angular/core/testing';
import { DepositStore } from '../../../core/deposit-store';
import { ExpenseStore } from '../../../core/expense-store';
import { ToastService } from '../../../core/toast';
import type { BankTransaction } from '../model/bank-transaction';
import { BankInbox } from '../services/bank-inbox';
import { BankSync } from './bank-sync';

const tx = (over: Partial<BankTransaction>): BankTransaction => ({
  id: 'x',
  accountName: 'Checking',
  date: '2026-09-10',
  amount: -20,
  description: 'X',
  pending: false,
  source: 'simplefin',
  ...over,
});

async function render() {
  const fixture = TestBed.createComponent(BankSync);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

const reviewRows = (el: HTMLElement) => [...el.querySelectorAll('ul[aria-label="Transactions to review"] > li')];
const approveButton = (el: HTMLElement) => [...el.querySelectorAll('button')].find((b) => b.textContent!.includes('Approve'))!;

describe('Bank sync page, refunds', () => {
  beforeEach(() => {
    localStorage.clear();
    // The connection card checks for the local sync server; there isn't one in tests.
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('shows a matched refund with its purchase chosen, and approves both together', async () => {
    TestBed.inject(BankInbox).add([
      tx({ id: 'p', description: 'TARGET 00012', amount: -50, date: '2026-09-01' }),
      tx({ id: 'r', description: 'REFUND TARGET 00012', amount: 50, date: '2026-09-08' }),
    ]);
    const { el, fixture } = await render();

    const refundRow = reviewRows(el).find((li) => li.textContent!.includes('REFUND TARGET'))!;
    expect(refundRow.textContent).toContain('Refund for');
    expect(refundRow.textContent).toContain('+$50.00');
    const select = refundRow.querySelector('select')!;
    expect(select.selectedOptions[0]!.textContent).toContain('Target 00012');
    expect(approveButton(el).textContent).toContain('Approve 2');

    approveButton(el).click();
    await fixture.whenStable();
    const [expense] = TestBed.inject(ExpenseStore).expenses();
    expect(expense!.refunds).toHaveLength(1);
    expect(reviewRows(el)).toHaveLength(0);
  });

  it('asks you to choose the purchase when it cannot tell, and counts the refund only once chosen', async () => {
    TestBed.inject(ExpenseStore).add({ date: '2026-09-01', amount: 90, category: 'Travel', description: 'Hotel' });
    TestBed.inject(BankInbox).add([tx({ id: 'r', description: 'REFUND 7781', amount: 30, date: '2026-09-05' })]);
    const { el, fixture } = await render();

    const select = reviewRows(el)[0]!.querySelector('select')!;
    expect(select.selectedOptions[0]!.textContent).toContain('Choose the purchase');
    expect(approveButton(el).disabled).toBe(true);

    select.value = select.options[1]!.value;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(approveButton(el).disabled).toBe(false);
    expect(approveButton(el).textContent).toContain('Approve 1');
  });

  it('says so when no purchase could be the one refunded', async () => {
    TestBed.inject(BankInbox).add([tx({ id: 'r', description: 'REFUND 7781', amount: 30 })]);
    const { el } = await render();
    expect(el.textContent).toContain('No purchase of this amount or more in the 6 months before');
  });

  it('shows money in as a deposit that can be switched to a refund', async () => {
    TestBed.inject(BankInbox).add([tx({ id: 'c', description: 'PAYROLL', amount: 1500 })]);
    const { el, fixture } = await render();
    const row = reviewRows(el)[0]!;
    expect(row.textContent).toContain('Deposit');
    expect(row.textContent).toContain('+$1,500.00');
    const button = [...row.querySelectorAll('button')].find((b) => b.textContent!.includes('It’s a refund'))!;
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(reviewRows(el)[0]!.textContent).toContain('Refund for');
    const back = [...reviewRows(el)[0]!.querySelectorAll('button')].find((b) => b.textContent!.includes('It’s a deposit'))!;
    back.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(reviewRows(el)[0]!.textContent).not.toContain('Refund for');
  });

  it('approves purchases, deposits and refunds together, and says what it did', async () => {
    TestBed.inject(BankInbox).add([
      tx({ id: 'p', description: 'TARGET 00012', amount: -50, date: '2026-09-01' }),
      tx({ id: 'r', description: 'REFUND TARGET 00012', amount: 20, date: '2026-09-08' }),
      tx({ id: 'd', description: 'PAYROLL', amount: 900, date: '2026-09-09' }),
    ]);
    const { el, fixture } = await render();
    expect(approveButton(el).textContent).toContain('Approve 3');
    approveButton(el).click();
    await fixture.whenStable();
    expect(TestBed.inject(ExpenseStore).count()).toBe(1);
    expect(TestBed.inject(DepositStore).count()).toBe(1);
    expect(TestBed.inject(ToastService).toasts().map((t) => t.message)).toContain(
      'Added 1 expense and 1 deposit, 1 refund taken off its purchase.',
    );
  });
});
