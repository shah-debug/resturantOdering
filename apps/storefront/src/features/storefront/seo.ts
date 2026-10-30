import { DAYS_OF_WEEK, type Storefront } from '@app/contracts';

export function storefrontPath(slug: string): string {
  return `/r/${slug}`;
}

export function storefrontDescription(storefront: Storefront): string {
  if (storefront.description) {
    return storefront.description;
  }
  const cities = [...new Set(storefront.branches.map((branch) => branch.city))];
  const where = cities.length > 0 ? ` in ${cities.join(', ')}` : '';
  return `Order from ${storefront.name}${where} online for delivery or pickup.`;
}

export function storefrontJsonLd(storefront: Storefront, url: string): Record<string, unknown> {
  const branch = storefront.branches[0];
  return {
    '@context': 'https://schema.org',
    '@type': 'Restaurant',
    name: storefront.name,
    url,
    description: storefrontDescription(storefront),
    ...(storefront.logoUrl ? { image: storefront.logoUrl } : {}),
    ...(branch?.phone ? { telephone: branch.phone } : {}),
    currenciesAccepted: storefront.currency,
    ...(branch
      ? {
          address: {
            '@type': 'PostalAddress',
            streetAddress: branch.addressLine,
            addressLocality: branch.city,
            ...(branch.area ? { addressRegion: branch.area } : {}),
            addressCountry: 'PK',
          },
          openingHoursSpecification: branch.openingHours.map((interval) => ({
            '@type': 'OpeningHoursSpecification',
            dayOfWeek: DAYS_OF_WEEK.find((day) => day.value === interval.dayOfWeek)?.label,
            opens: interval.opensAt,
            closes: interval.closesAt,
          })),
        }
      : {}),
  };
}

export function serializeJsonLd(data: Record<string, unknown>): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}
