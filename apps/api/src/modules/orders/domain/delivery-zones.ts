const EARTH_RADIUS_METERS = 6_371_008.8;

export interface DeliveryZoneCandidate {
  id: string;
  name: string;
  feeMinor: number;
  minOrderMinor: number;
  estimatedMinutes: number;
  radiusMeters: number | null;
  areas: readonly string[];
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface DeliveryOrigin {
  city: string;
  coordinates: Coordinates | null;
}

export interface DeliveryDestination {
  area: string;
  city: string;
  coordinates: Coordinates | null;
}

export function normalizePlaceName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function distanceMeters(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(a)));
}

function zoneCovers(
  zone: DeliveryZoneCandidate,
  origin: DeliveryOrigin,
  destination: DeliveryDestination,
): boolean {
  if (normalizePlaceName(destination.city) !== normalizePlaceName(origin.city)) {
    return false;
  }
  if (zone.areas.length > 0) {
    const area = normalizePlaceName(destination.area);
    if (!zone.areas.some((name) => normalizePlaceName(name) === area)) {
      return false;
    }
  }
  if (zone.radiusMeters !== null) {
    if (!origin.coordinates || !destination.coordinates) {
      return false;
    }
    if (distanceMeters(origin.coordinates, destination.coordinates) > zone.radiusMeters) {
      return false;
    }
  }
  return true;
}

export function matchDeliveryZone<T extends DeliveryZoneCandidate>(
  zones: readonly T[],
  origin: DeliveryOrigin,
  destination: DeliveryDestination,
): T | null {
  const matches = zones.filter((zone) => zoneCovers(zone, origin, destination));
  matches.sort(
    (a, b) =>
      a.feeMinor - b.feeMinor ||
      a.minOrderMinor - b.minOrderMinor ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  return matches[0] ?? null;
}
