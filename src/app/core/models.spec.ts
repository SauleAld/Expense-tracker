import { CATEGORIES, categoryColor, isCategory, isRenamedCategory, parseCategory } from './models';

describe('CATEGORIES', () => {
  it('has the ten categories, related ones together', () => {
    expect([...CATEGORIES]).toEqual([
      'Groceries',
      'Dining',
      'Transportation',
      'Travel',
      'Entertainment',
      'Subscriptions',
      'Shopping',
      'Home Improvement',
      'Bills',
      'Other',
    ]);
  });

  it('has no duplicates, and the old "Food" name is gone', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
    expect(isCategory('Food')).toBe(false);
  });
});

describe('isCategory', () => {
  it('accepts the current names only', () => {
    expect(isCategory('Dining')).toBe(true);
    expect(isCategory('Home Improvement')).toBe(true);
    for (const bad of ['dining', 'Pets', '', null, undefined, 5, {}]) expect(isCategory(bad)).toBe(false);
  });
});

describe('parseCategory (keeps data saved under an old name)', () => {
  it('passes current names through', () => {
    for (const c of CATEGORIES) expect(parseCategory(c)).toBe(c);
  });

  it('turns the old "Food" into "Groceries"', () => {
    expect(parseCategory('Food')).toBe('Groceries');
    expect(isRenamedCategory('Food')).toBe(true);
    expect(isRenamedCategory('Groceries')).toBe(false);
  });

  it('rejects anything it does not know, including object-prototype names', () => {
    for (const bad of ['Pets', 'food', '', 'constructor', '__proto__', 'toString', 'hasOwnProperty', null, undefined, 3, [], {}]) {
      expect(parseCategory(bad)).toBeNull();
    }
  });
});

describe('categoryColor', () => {
  const slot = (c: (typeof CATEGORIES)[number]) => Number(/--cat-(\d)/.exec(categoryColor(c))![1]);

  it('gives every category one of the six palette colors', () => {
    for (const c of CATEGORIES) expect(slot(c)).toBeGreaterThanOrEqual(1);
    for (const c of CATEGORIES) expect(slot(c)).toBeLessThanOrEqual(6);
    expect(new Set(CATEGORIES.map(slot))).toEqual(new Set([1, 2, 3, 4, 5, 6]));
  });

  it('groups related categories into a color family', () => {
    expect(slot('Groceries')).toBe(slot('Dining'));
    expect(slot('Transportation')).toBe(slot('Travel'));
    expect(slot('Entertainment')).toBe(slot('Subscriptions'));
    expect(slot('Shopping')).toBe(slot('Home Improvement'));
  });

  it('keeps unrelated categories on different colors', () => {
    const families = [['Groceries'], ['Transportation'], ['Entertainment'], ['Shopping'], ['Bills'], ['Other']] as const;
    expect(new Set(families.map(([c]) => slot(c))).size).toBe(6);
  });

  it('only ever steps to the same color or the NEXT one down the list, which is what keeps the palette check valid', () => {
    // Charts stack categories in this order. The palette was validated for neighbours that are
    // consecutive slots (1-2, 2-3, ...), so any other jump would need re-validating.
    const slots = CATEGORIES.map(slot);
    for (let i = 1; i < slots.length; i++) expect([0, 1]).toContain(slots[i]! - slots[i - 1]!);
  });
});
