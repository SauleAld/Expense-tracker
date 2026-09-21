import { parseCsv } from './csv-parse';

describe('parseCsv', () => {
  it('parses plain rows and drops the trailing newline', () => {
    expect(parseCsv('a,b,c\n1,2,3\n')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
  });

  it('handles quoted fields with commas, escaped quotes and line breaks', () => {
    const csv = 'name,note\n"Smith, J","said ""hi"""\n"multi\nline",x\n';
    expect(parseCsv(csv)).toEqual([['name', 'note'], ['Smith, J', 'said "hi"'], ['multi\nline', 'x']]);
  });

  it('understands CRLF, LF and CR line endings', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([['a', 'b'], ['1', '2']]);
    expect(parseCsv('a,b\r1,2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('ignores a byte-order mark', () => {
    expect(parseCsv(String.fromCharCode(0xfeff) + 'Date,Amount\n1,2')[0]).toEqual(['Date', 'Amount']);
  });

  it('detects semicolon and tab delimiters', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([['a', 'b', 'c'], ['1', '2', '3']]);
    expect(parseCsv('a\tb\n1\t2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('keeps commas inside quotes when the delimiter is a semicolon', () => {
    expect(parseCsv('a;b\n"1,5";2')).toEqual([['a', 'b'], ['1,5', '2']]);
  });

  it('drops empty rows but keeps empty fields inside real rows', () => {
    expect(parseCsv('a,b,c\n\n,,\n1,,3\n')).toEqual([['a', 'b', 'c'], ['1', '', '3']]);
  });

  it('returns nothing for empty input', () => {
    expect(parseCsv('')).toEqual([]);
    expect(parseCsv('\n\n')).toEqual([]);
  });

  it('copes with an unterminated quote instead of hanging', () => {
    expect(parseCsv('a,"unclosed\nstill')).toEqual([['a', 'unclosed\nstill']]);
  });
});
