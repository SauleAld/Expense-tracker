import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({ imports: [App], providers: [provideRouter([])] }).compileComponents();
  });

  it('renders the shell with navigation and the add-expense dialog', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Spendwise');
    expect(el.querySelectorAll('nav a').length).toBeGreaterThanOrEqual(2);
    expect(el.querySelector('dialog')).toBeTruthy();
  });
});
