import { nextAvailableSlug, slugify } from './slug';

describe('slugify', () => {
  it.each([
    ['Chicken Karahi (Full)', 'chicken-karahi-full'],
    ['  Crème Brûlée  ', 'creme-brulee'],
    ['چکن کڑاہی', 'item'],
    ['---', 'item'],
  ])('%j becomes %j', (input, expected) => {
    expect(slugify(input, 'item')).toBe(expected);
  });
});

describe('nextAvailableSlug', () => {
  it('appends the first free numeric suffix', () => {
    expect(nextAvailableSlug('bbq', new Set())).toBe('bbq');
    expect(nextAvailableSlug('bbq', new Set(['bbq', 'bbq-2']))).toBe('bbq-3');
  });
});
