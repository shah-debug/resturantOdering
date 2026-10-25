import {
  allocateProportionally,
  percentageOf,
  roundHalfUpDivide,
  roundToNearestRupee,
} from './money';

describe('roundHalfUpDivide', () => {
  it.each([
    [10, 4, 3],
    [9, 4, 2],
    [14, 4, 4],
    [0, 7, 0],
    [5, 10, 1],
    [4, 10, 0],
  ])('%i / %i rounds half up to %i', (numerator, denominator, expected) => {
    expect(roundHalfUpDivide(numerator, denominator)).toBe(expected);
  });

  it('rejects negative numerators and non-positive denominators', () => {
    expect(() => roundHalfUpDivide(-1, 2)).toThrow(RangeError);
    expect(() => roundHalfUpDivide(1, 0)).toThrow(RangeError);
    expect(() => roundHalfUpDivide(1.5, 2)).toThrow(RangeError);
  });

  it('refuses amounts that would lose precision', () => {
    expect(() => roundHalfUpDivide(Number.MAX_SAFE_INTEGER, 2)).toThrow(RangeError);
  });
});

describe('percentageOf', () => {
  it('computes 16% GST on Rs 1,450.00 to the nearest paisa', () => {
    expect(percentageOf(145_000, 1_600)).toBe(23_200);
  });

  it('rounds half a paisa up', () => {
    expect(percentageOf(5, 1_000)).toBe(1);
    expect(percentageOf(4, 1_000)).toBe(0);
  });

  it('rejects rates above 100%', () => {
    expect(() => percentageOf(100, 10_001)).toThrow(RangeError);
  });
});

describe('allocateProportionally', () => {
  it('splits exactly when shares are whole', () => {
    expect(allocateProportionally(300, [100, 200])).toEqual([100, 200]);
  });

  it('always sums to the total using largest remainder', () => {
    const allocation = allocateProportionally(100, [100, 100, 100]);
    expect(allocation).toEqual([34, 33, 33]);
    expect(allocation.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('gives leftover units to the largest remainders first', () => {
    expect(allocateProportionally(10, [55_000, 120_000, 15_000])).toEqual([3, 6, 1]);
  });

  it('allocates zero without needing weights', () => {
    expect(allocateProportionally(0, [0, 0])).toEqual([0, 0]);
  });

  it('rejects impossible allocations', () => {
    expect(() => allocateProportionally(5, [0, 0])).toThrow(RangeError);
    expect(() => allocateProportionally(11, [5, 5])).toThrow(RangeError);
  });
});

describe('roundToNearestRupee', () => {
  it.each([
    [123_449, 123_400],
    [123_450, 123_500],
    [123_499, 123_500],
    [100, 100],
  ])('%i paisa rounds to %i', (amount, expected) => {
    expect(roundToNearestRupee(amount)).toBe(expected);
  });
});
