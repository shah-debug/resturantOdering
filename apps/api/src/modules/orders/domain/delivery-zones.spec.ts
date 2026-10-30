import {
  type DeliveryZoneCandidate,
  distanceMeters,
  matchDeliveryZone,
  normalizePlaceName,
} from './delivery-zones';

const BRANCH = { city: 'Lahore', coordinates: { latitude: 31.5204, longitude: 74.3587 } };

function zone(overrides: Partial<DeliveryZoneCandidate>): DeliveryZoneCandidate {
  return {
    id: overrides.name ?? 'zone',
    name: 'zone',
    feeMinor: 15_000,
    minOrderMinor: 0,
    estimatedMinutes: 40,
    radiusMeters: null,
    areas: [],
    ...overrides,
  };
}

function northOf(meters: number) {
  return { latitude: 31.5204 + meters / 111_195, longitude: 74.3587 };
}

describe('delivery zones', () => {
  it('normalises place names', () => {
    expect(normalizePlaceName('  Gulberg   III ')).toBe('gulberg iii');
  });

  it('measures great-circle distance', () => {
    expect(distanceMeters(BRANCH.coordinates, northOf(1000))).toBeCloseTo(1000, 0);
  });

  it('covers the whole branch city when a zone has no areas or radius', () => {
    const city = zone({ name: 'city' });
    expect(
      matchDeliveryZone([city], BRANCH, { area: 'Anywhere', city: ' lahore ', coordinates: null }),
    ).toBe(city);
    expect(
      matchDeliveryZone([city], BRANCH, { area: 'Clifton', city: 'Karachi', coordinates: null }),
    ).toBeNull();
  });

  it('only covers listed areas', () => {
    const listed = zone({ name: 'listed', areas: ['Gulberg III', 'DHA Phase 5'] });
    expect(
      matchDeliveryZone([listed], BRANCH, {
        area: 'gulberg iii',
        city: 'Lahore',
        coordinates: null,
      }),
    ).toBe(listed);
    expect(
      matchDeliveryZone([listed], BRANCH, {
        area: 'Johar Town',
        city: 'Lahore',
        coordinates: null,
      }),
    ).toBeNull();
  });

  it('includes the exact radius boundary and excludes points just beyond it', () => {
    const radius = zone({ name: 'radius', radiusMeters: 3000 });
    const inside = matchDeliveryZone([radius], BRANCH, {
      area: 'x',
      city: 'Lahore',
      coordinates: northOf(2999),
    });
    const outside = matchDeliveryZone([radius], BRANCH, {
      area: 'x',
      city: 'Lahore',
      coordinates: northOf(3005),
    });
    expect(inside).toBe(radius);
    expect(outside).toBeNull();
  });

  it('needs coordinates on both sides for a radius zone', () => {
    const radius = zone({ name: 'radius', radiusMeters: 3000 });
    expect(
      matchDeliveryZone([radius], BRANCH, { area: 'x', city: 'Lahore', coordinates: null }),
    ).toBeNull();
    expect(
      matchDeliveryZone(
        [radius],
        { city: 'Lahore', coordinates: null },
        {
          area: 'x',
          city: 'Lahore',
          coordinates: northOf(10),
        },
      ),
    ).toBeNull();
  });

  it('prefers the cheapest covering zone', () => {
    const near = zone({ name: 'near', feeMinor: 10_000, radiusMeters: 2000 });
    const wide = zone({ name: 'wide', feeMinor: 25_000 });
    const destination = { area: 'x', city: 'Lahore', coordinates: northOf(500) };
    expect(matchDeliveryZone([wide, near], BRANCH, destination)).toBe(near);
    expect(
      matchDeliveryZone([wide, near], BRANCH, { ...destination, coordinates: northOf(5000) }),
    ).toBe(wide);
  });
});
