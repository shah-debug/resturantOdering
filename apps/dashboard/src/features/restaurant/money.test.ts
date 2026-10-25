import { formatRupees, paisaToRupees, rupeesToPaisa } from './money';

describe('money helpers', () => {
  it.each([
    ['150', 15000],
    ['150.5', 15050],
    ['150.05', 15005],
    [' 1,250 ', 125000],
    ['0', 0],
  ])('converts Rs %s to %i paisa', (input, paisa) => {
    expect(rupeesToPaisa(input)).toBe(paisa);
  });

  it.each(['', 'abc', '-10', '1.234', '1e3'])('rejects %j', (input) => {
    expect(rupeesToPaisa(input)).toBeNull();
  });

  it('converts paisa back to an editable rupee amount', () => {
    expect(paisaToRupees(15000)).toBe('150');
    expect(paisaToRupees(15050)).toBe('150.50');
    expect(paisaToRupees(5)).toBe('0.05');
    expect(rupeesToPaisa(paisaToRupees(123456))).toBe(123456);
  });

  it('formats paisa for display', () => {
    expect(formatRupees(15000)).toBe('Rs 150');
    expect(formatRupees(125050)).toBe('Rs 1,250.50');
  });
});
