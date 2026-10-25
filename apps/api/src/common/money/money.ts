export const BASIS_POINTS_PER_UNIT = 10_000;
export const MINOR_UNITS_PER_RUPEE = 100;

export function assertMinorAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(
      `${label} must be a non-negative integer amount in minor units, got ${value}`,
    );
  }
}

export function assertBasisPoints(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > BASIS_POINTS_PER_UNIT) {
    throw new RangeError(
      `${label} must be an integer between 0 and ${BASIS_POINTS_PER_UNIT}, got ${value}`,
    );
  }
}

export function roundHalfUpDivide(numerator: number, denominator: number): number {
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new RangeError(`numerator must be a non-negative safe integer, got ${numerator}`);
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new RangeError(`denominator must be a positive safe integer, got ${denominator}`);
  }
  const doubled = numerator * 2 + denominator;
  if (!Number.isSafeInteger(doubled)) {
    throw new RangeError('Amount is too large to round safely');
  }
  return Math.floor(doubled / (denominator * 2));
}

export function percentageOf(amountMinor: number, basisPoints: number): number {
  assertMinorAmount(amountMinor, 'amountMinor');
  assertBasisPoints(basisPoints, 'basisPoints');
  return roundHalfUpDivide(amountMinor * basisPoints, BASIS_POINTS_PER_UNIT);
}

export function allocateProportionally(totalMinor: number, weights: readonly number[]): number[] {
  assertMinorAmount(totalMinor, 'totalMinor');
  weights.forEach((weight, index) => assertMinorAmount(weight, `weights[${index}]`));

  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  if (totalMinor === 0) {
    return weights.map(() => 0);
  }
  if (weightSum === 0) {
    throw new RangeError('Cannot allocate a non-zero amount across zero weights');
  }
  if (totalMinor > weightSum) {
    throw new RangeError('Cannot allocate more than the sum of the weights');
  }

  const shares = weights.map((weight, index) => {
    const product = totalMinor * weight;
    if (!Number.isSafeInteger(product)) {
      throw new RangeError('Amount is too large to allocate safely');
    }
    return { index, base: Math.floor(product / weightSum), remainder: product % weightSum };
  });

  let unallocated = totalMinor - shares.reduce((sum, share) => sum + share.base, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  const allocation = shares.map((share) => share.base);
  for (const share of byRemainder) {
    if (unallocated === 0) {
      break;
    }
    allocation[share.index] = (allocation[share.index] ?? 0) + 1;
    unallocated -= 1;
  }
  return allocation;
}

export function roundToNearestRupee(amountMinor: number): number {
  assertMinorAmount(amountMinor, 'amountMinor');
  return roundHalfUpDivide(amountMinor, MINOR_UNITS_PER_RUPEE) * MINOR_UNITS_PER_RUPEE;
}
