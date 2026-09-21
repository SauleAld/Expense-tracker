import { Injectable, signal } from '@angular/core';
import { isCategory, type Category } from '../../../core/models';
import { merchantKey, suggestCategory, type LearnedRules } from '../utils/categorize';

export const RULES_STORAGE_KEY = 'spendwise.bank.rules.v1';

/** Category choices you have made in the review inbox, remembered per merchant. */
@Injectable({ providedIn: 'root' })
export class CategoryRules {
  readonly learned = signal<LearnedRules>({});

  constructor() {
    try {
      const raw = localStorage.getItem(RULES_STORAGE_KEY);
      const data: unknown = raw ? JSON.parse(raw) : null;
      if (typeof data === 'object' && data !== null && !Array.isArray(data)) {
        this.learned.set(
          Object.fromEntries(Object.entries(data).filter((entry): entry is [string, Category] => isCategory(entry[1]))),
        );
      }
    } catch {
      // Unreadable rules just mean the suggestions start from the built-in keywords again.
    }
  }

  suggest(description: string) {
    return suggestCategory(description, this.learned());
  }

  learn(description: string, category: Category): void {
    const key = merchantKey(description);
    if (!key) return;
    this.learned.update((rules) => ({ ...rules, [key]: category }));
    this.persist();
  }

  forget(key: string): void {
    this.learned.update(({ [key]: _removed, ...rest }) => rest);
    this.persist();
  }

  private persist(): void {
    try {
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(this.learned()));
    } catch {
      // Not saving the rules is not worth interrupting the review for.
    }
  }
}
