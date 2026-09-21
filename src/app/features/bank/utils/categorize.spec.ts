import { isTransferLike, merchantKey, suggestCategory, tidyDescription } from './categorize';

describe('merchantKey', () => {
  it.each([
    ['TRADER JOE S #123 SAN FRANCISCO CA', 'TRADER JOE'],
    ['TRADER JOE S #456 OAKLAND CA', 'TRADER JOE'],
    ['SQ *BLUE BOTTLE COFFEE 0123', 'BLUE BOTTLE'],
    ['UBER *TRIP HELP.UBER.COM', 'UBER TRIP'],
    ['CHECKCARD 0912 SHELL OIL 57444', 'SHELL OIL'],
    ['PURCHASE AUTHORIZED ON 09/01 NETFLIX.COM', 'NETFLIX COM'],
    ['  amazon mktplace pmts  ', 'AMAZON MKTPLACE'],
  ])('%s -> %s', (description, key) => expect(merchantKey(description)).toBe(key));

  it('gives the same key to different stores of the same chain', () => {
    expect(merchantKey('TRADER JOE S #123 SAN FRANCISCO')).toBe(merchantKey('TRADER JOE S #999 OAKLAND'));
  });

  it('does not let the city leak into a one-word merchant when there is a store number', () => {
    expect(merchantKey('TARGET 00012345 OAKLAND CA')).toBe('TARGET');
    expect(merchantKey('TARGET T-1234 SEATTLE WA')).toBe('TARGET');
    expect(merchantKey('STARBUCKS #55 NYC')).toBe('STARBUCKS');
  });

  it('is empty for descriptions with no letters', () => {
    expect(merchantKey('12345 6789')).toBe('');
  });
});

describe('suggestCategory', () => {
  it.each([
    ['TRADER JOES #123', 'Groceries'],
    ["TRADER JOE'S 456", 'Groceries'],
    ['MCDONALDS F1234', 'Dining'],
    ['WHOLE FOODS MKT 10234', 'Groceries'],
    ['SAFEWAY GROCERY 0234', 'Groceries'],
    ['CITY UTILITIES BILL PAY', 'Bills'],
    ['MACYS 0012', 'Shopping'],
    ['WAL-MART SUPERCENTER', 'Shopping'],
    ['STARBUCKS STORE 55', 'Dining'],
    ['DOORDASH*CHIPOTLE', 'Dining'],
    ['UBER EATS HELP.UBER.COM', 'Dining'], // more specific than UBER
    ['UBER *TRIP', 'Transportation'],
    ['SHELL OIL 57444', 'Transportation'],
    ['DELTA AIR LINES', 'Travel'],
    ['NETFLIX.COM', 'Subscriptions'],
    ['AMC THEATRES', 'Entertainment'],
    ['AMAZON MKTPLACE PMTS', 'Shopping'],
    ['TARGET 00012345', 'Shopping'],
    ['PG&E WEB ONLINE', 'Bills'],
    ['COMCAST CABLE', 'Bills'],
    ['RENT PAYMENT SEPT', 'Bills'],
    ['SPOTIFY USA', 'Subscriptions'],
    ['DISNEY PLUS', 'Subscriptions'],
    ['DISNEY+ 8005551', 'Subscriptions'],
    ['DISNEYPLUS', 'Subscriptions'],
    ['DISNEYWORLD RESORT', 'Entertainment'],
    ['DISNEYLAND PARK TICKETS', 'Entertainment'], // the parks are entertainment, the streaming service is a subscription
    ['MARRIOTT HOTELS 0012', 'Travel'],
    ['AIRBNB * HM4XYZ', 'Travel'],
    ['UNITED AIRLINES 0167', 'Travel'],
    ['AMTRAK 4021', 'Travel'],
    ['UBER *TRIP', 'Transportation'],
    ['HOME DEPOT #1234', 'Home Improvement'],
    ["LOWE'S #0334", 'Home Improvement'],
    ['ACE HARDWARE OAKLAND', 'Home Improvement'],
    ['IKEA OAKLAND', 'Shopping'],
    ['MYSTERY MERCHANT LLC', 'Other'],
  ] as const)('%s -> %s', (description, category) => {
    expect(suggestCategory(description).category).toBe(category);
  });

  it('says where the suggestion came from', () => {
    expect(suggestCategory('STARBUCKS').source).toBe('builtin');
    expect(suggestCategory('MYSTERY LLC').source).toBe('default');
  });

  it('prefers a rule you taught it over the built-in keywords', () => {
    const learned = { [merchantKey('TARGET 123')]: 'Groceries' } as const;
    expect(suggestCategory('TARGET 999 OAKLAND', learned)).toEqual({ category: 'Groceries', source: 'learned' });
    expect(suggestCategory('WALMART 5', learned).category).toBe('Shopping'); // other merchants unaffected
  });
});

describe('isTransferLike', () => {
  it.each(['ONLINE TRANSFER TO SAVINGS', 'PAYMENT THANK YOU', 'AUTOPAY PAYMENT', 'MOBILE PAYMENT - THANK YOU', 'XFER FROM CHECKING'])(
    'treats %j as a transfer',
    (d) => expect(isTransferLike(d)).toBe(true),
  );
  it.each(['STARBUCKS', 'ZELLE TO BOB', 'RENT', 'TRANSFERWISE FEE?'])('does not treat %j as a transfer', (d) => {
    // Zelle/Venmo to people can be real spending, so they are left for you to decide.
    expect(isTransferLike(d)).toBe(false);
  });
});

describe('tidyDescription', () => {
  it('turns shouting into words, and leaves mixed case alone', () => {
    expect(tidyDescription('TRADER JOES #123')).toBe('Trader Joes #123');
    expect(tidyDescription("TRADER JOE'S")).toBe("Trader Joe's");
    expect(tidyDescription('  AMAZON   MKTPLACE ')).toBe('Amazon Mktplace');
    expect(tidyDescription('Lunch with Sam')).toBe('Lunch with Sam');
    expect(tidyDescription('Netflix.com')).toBe('Netflix.com');
  });
});
