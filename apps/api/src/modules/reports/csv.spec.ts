import { escapeCsvCell, toCsv } from '@app/contracts';

describe('CSV export', () => {
  it('neutralises spreadsheet formulas', () => {
    for (const value of ['=HYPERLINK("x")', '+92 300', '-1+1', '@SUM(A1)', '\tcmd']) {
      expect(escapeCsvCell(value).replace(/^"/, '').startsWith("'")).toBe(true);
    }
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(escapeCsvCell('Karahi, Half')).toBe('"Karahi, Half"');
    expect(escapeCsvCell('He said "hi"')).toBe('"He said ""hi"""');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(1500)).toBe('1500');
  });

  it('joins rows with CRLF', () => {
    expect(
      toCsv([
        ['a', 'b'],
        [1, null],
      ]),
    ).toBe('a,b\r\n1,\r\n');
  });
});
