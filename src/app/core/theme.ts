import { Injectable, effect, signal } from '@angular/core';

export type ThemeName = 'light' | 'dark';

const STORAGE_KEY = 'spendwise.theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  readonly current = signal<ThemeName>(this.initial());

  constructor() {
    effect(() => {
      const theme = this.current();
      document.documentElement.setAttribute('data-theme', theme);
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        // Preference just won't persist.
      }
    });
  }

  toggle(): void {
    this.current.update((t) => (t === 'dark' ? 'light' : 'dark'));
  }

  private initial(): ThemeName {
    // index.html has already stamped the resolved theme on <html>.
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }
}
