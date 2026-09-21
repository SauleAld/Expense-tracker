import type { Category, ExpenseInput } from '../core/models';
import { addDays, toISODate } from './dates';

/** Small deterministic PRNG so "load sample data" is reproducible. */
function mulberry32(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Template {
  category: Category;
  description: string;
  min: number;
  max: number;
}

const EVERYDAY: Template[] = [
  { category: 'Groceries', description: 'Groceries – Trader Joe’s', min: 32, max: 96 },
  { category: 'Dining', description: 'Lunch at Chipotle', min: 10, max: 17 },
  { category: 'Dining', description: 'Morning coffee', min: 3.5, max: 7 },
  { category: 'Dining', description: 'Dinner out', min: 28, max: 85 },
  { category: 'Groceries', description: 'Farmers market', min: 14, max: 40 },
  { category: 'Transportation', description: 'Uber ride', min: 9, max: 32 },
  { category: 'Transportation', description: 'Gas station', min: 34, max: 62 },
  { category: 'Transportation', description: 'Metro card top-up', min: 20, max: 40 },
  { category: 'Travel', description: 'Flight booking', min: 140, max: 380 },
  { category: 'Travel', description: 'Hotel stay', min: 95, max: 240 },
  { category: 'Entertainment', description: 'Movie tickets', min: 22, max: 38 },
  { category: 'Entertainment', description: 'Concert', min: 45, max: 130 },
  { category: 'Entertainment', description: 'Video game', min: 15, max: 60 },
  { category: 'Shopping', description: 'Amazon order', min: 12, max: 90 },
  { category: 'Shopping', description: 'New sneakers', min: 60, max: 140 },
  { category: 'Home Improvement', description: 'Home supplies', min: 15, max: 55 },
  { category: 'Other', description: 'Pharmacy', min: 6, max: 30 },
  { category: 'Other', description: 'Birthday gift', min: 20, max: 75 },
  { category: 'Other', description: 'Haircut', min: 25, max: 45 },
];

const MONTHLY: { day: number; template: Template }[] = [
  { day: 1, template: { category: 'Bills', description: 'Rent', min: 1450, max: 1450 } },
  { day: 4, template: { category: 'Bills', description: 'Electricity', min: 55, max: 110 } },
  { day: 8, template: { category: 'Bills', description: 'Internet', min: 65, max: 65 } },
  { day: 12, template: { category: 'Bills', description: 'Phone plan', min: 45, max: 45 } },
  { day: 15, template: { category: 'Subscriptions', description: 'Streaming subscriptions', min: 27.98, max: 27.98 } },
];

/** Roughly five months of plausible spending ending today. Never generates future dates. */
export function generateSampleExpenses(now: Date = new Date(), days = 150): ExpenseInput[] {
  const random = mulberry32(20260920);
  const between = (min: number, max: number) => Math.round((min + random() * (max - min)) * 100) / 100;
  const expenses: ExpenseInput[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    const day = addDays(now, -offset);
    const date = toISODate(day);

    for (const { day: dom, template } of MONTHLY) {
      if (day.getDate() === dom) {
        expenses.push({ date, category: template.category, description: template.description, amount: between(template.min, template.max) });
      }
    }

    // 0–2 everyday purchases per day, skewed towards 1.
    const roll = random();
    const purchases = roll < 0.25 ? 0 : roll < 0.75 ? 1 : 2;
    for (let i = 0; i < purchases; i++) {
      const t = EVERYDAY[Math.floor(random() * EVERYDAY.length)]!;
      expenses.push({ date, category: t.category, description: t.description, amount: between(t.min, t.max) });
    }
  }
  return expenses;
}
