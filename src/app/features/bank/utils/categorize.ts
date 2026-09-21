import type { Category } from '../../../core/models';

export type LearnedRules = Readonly<Record<string, Category>>;

/** Card processors and bank noise that say nothing about the merchant. Longest alternatives first. */
const NOISE_PREFIX =
  /^(?:PURCHASE AUTHORIZED ON|(?:DEBIT|CREDIT|CHECK) ?CARD|CHECKCARD|RECURRING|PURCHASE|APPLE PAY|PAYPAL \*|GOOGLE \*|WITHDRAWAL|SQ \*|TST \*|PP \*|POS|SQ|TST|VISA|ACH|DEBIT)\b[\s*:-]*/;

/**
 * A short, stable name for a merchant, so every store of a chain learns the same rule:
 * "TRADER JOE S #123 SAN FRANCISCO" and "TRADER JOE S #456 OAKLAND" both become "TRADER JOE".
 * The name is what comes before the store number or reference code, limited to two words.
 */
export function merchantKey(description: string): string {
  let text = description.toUpperCase().replace(/[^A-Z0-9&*#/ .'-]+/g, ' ');
  for (let i = 0; i < 3; i++) text = text.replace(NOISE_PREFIX, '').trim();
  const tokens = text.replace(/\*/g, ' ').split(/\s+/).filter(Boolean);
  // Leading dates or numbers, such as "0912" or "09/01".
  while (tokens.length > 0 && /^[#]?[\d/.-]+$/.test(tokens[0]!)) tokens.shift();
  // The merchant ends where a store number or reference code begins.
  const end = tokens.findIndex((t) => /\d/.test(t));
  const name = (end === -1 ? tokens : tokens.slice(0, end)).join(' ');
  return name.replace(/[^A-Z& ]+/g, ' ').split(/\s+/).filter(Boolean).slice(0, 2).join(' ');
}

/** Checked in order, so more specific rules (UBER EATS) come before broader ones (UBER). */
const BUILTIN_RULES: readonly { category: Category; pattern: RegExp }[] = [
  {
    category: 'Bills',
    pattern:
      /\b(RENT|MORTGAGE|PG&E|PGE|CON ?ED(?:ISON)?|ELECTRIC(?:ITY)?|UTILIT(?:Y|IES)|WATER|SEWER|COMCAST|XFINITY|VERIZON|AT&T|T-?MOBILE|SPECTRUM|INTERNET|INSURANCE|GEICO|STATE FARM|PROGRESSIVE|ALLSTATE|LOANS?|TUITION|HOA)\b/,
  },
  {
    category: 'Food',
    pattern:
      /\b(GROCER(?:Y|IES)|SAFEWAY|KROGER|TRADER JOE(?:[' ]?S)?|WHOLE FOODS|ALDI|PUBLIX|RESTAURANTS?|CAFES?|COFFEE|STARBUCKS|MCDONALD(?:[' ]?S)?|CHIPOTLE|DOORDASH|UBER EATS|GRUBHUB|PIZZ(?:A|ERIA)|BAKERY|DINER|SUSHI|TACOS?|BURGERS?|DUNKIN|SUBWAY|WENDY(?:[' ]?S)?|PANERA|BAR & GRILL|KITCHEN)\b/,
  },
  {
    category: 'Entertainment',
    pattern:
      /\b(NETFLIX|SPOTIFY|HULU|DISNEY|HBO|YOUTUBE|APPLE TV|AMC|CINEMAS?|THEATE?RS?|TICKETMASTER|STEAM|PLAYSTATION|NINTENDO|XBOX|CONCERTS?|GAMING)\b/,
  },
  {
    category: 'Transportation',
    pattern:
      /\b(UBER|LYFT|SHELL|CHEVRON|EXXON(?:MOBIL)?|MOBIL|ARCO|GAS STATION|FUEL|PARKING|TOLLS?|TRANSIT|MTA|BART|METRO|AMTRAK|AIRLINES?|DELTA|UNITED AIR|SOUTHWEST|JETBLUE|TAXI)\b/,
  },
  {
    category: 'Shopping',
    pattern:
      /\b(AMAZON|AMZN|TARGET|WAL-?MART|COSTCO|BEST BUY|HOME DEPOT|IKEA|NIKE|ETSY|EBAY|MACY(?:[' ]?S)?|NORDSTROM|WAYFAIR|APPLE\.COM)\b/,
  },
];

export type SuggestionSource = 'learned' | 'builtin' | 'default';

/** Your own corrections win, then the built-in keywords, then "Other". */
export function suggestCategory(
  description: string,
  learned: LearnedRules = {},
): { category: Category; source: SuggestionSource } {
  const learnedCategory = learned[merchantKey(description)];
  if (learnedCategory) return { category: learnedCategory, source: 'learned' };
  const upper = description.toUpperCase();
  const match = BUILTIN_RULES.find((rule) => rule.pattern.test(upper));
  return match ? { category: match.category, source: 'builtin' } : { category: 'Other', source: 'default' };
}

/** Money moving between your own accounts or paying a card isn't spending. */
const TRANSFER =
  /\b(TRANSFER|XFER|PAYMENT THANK YOU|AUTOPAY|AUTOMATIC PAYMENT|ONLINE PAYMENT|CARD PAYMENT|EPAYMENT|E-PAYMENT|MOBILE PAYMENT|TO SAVINGS|FROM SAVINGS|TO CHECKING|FROM CHECKING)\b/i;

export const isTransferLike = (description: string): boolean => TRANSFER.test(description);

/**
 * Banks shout: "TRADER JOES #123". If the text has no lowercase at all, make it "Trader Joes #123";
 * text that already has mixed case is left alone.
 */
export function tidyDescription(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (/[a-z]/.test(clean)) return clean;
  return clean.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}
