import { isValidEmail, splitRecipients } from './email';

describe('email helpers', () => {
  it.each(['a@b.co', 'first.last+tag@sub.example.com', ' padded@example.org '])('accepts %j', (v) => {
    expect(isValidEmail(v)).toBe(true);
  });
  it.each(['', 'plain', '@example.com', 'a@b', 'a b@example.com', 'a@b.c'])('rejects %j', (v) => {
    expect(isValidEmail(v)).toBe(false);
  });
  it('splits on commas, semicolons, spaces and newlines', () => {
    expect(splitRecipients('a@x.co, b@x.co;c@x.co\nd@x.co  ')).toEqual(['a@x.co', 'b@x.co', 'c@x.co', 'd@x.co']);
    expect(splitRecipients('  ')).toEqual([]);
  });
});
