import { storefrontFixture } from '@/testing/storefront-fixture';
import { brandStyles, readableTextOn } from './branding';
import { serializeJsonLd, storefrontDescription, storefrontJsonLd } from './seo';

describe('storefront SEO', () => {
  it('falls back to a generated description', () => {
    expect(storefrontDescription(storefrontFixture({ description: null }))).toBe(
      'Order from Karahi House in Lahore online for delivery or pickup.',
    );
  });

  it('builds restaurant structured data without private fields', () => {
    const data = storefrontJsonLd(storefrontFixture(), 'https://order.example.com/r/karahi-house');
    expect(data).toMatchObject({
      '@type': 'Restaurant',
      name: 'Karahi House',
      url: 'https://order.example.com/r/karahi-house',
      telephone: '+924235000000',
      address: { addressLocality: 'Lahore', addressCountry: 'PK' },
    });
    expect(data).toHaveProperty('openingHoursSpecification.0.dayOfWeek', 'Monday');
  });

  it('escapes markup when embedding structured data', () => {
    const serialized = serializeJsonLd({ name: '</script><script>alert(1)</script>' });
    expect(serialized).not.toContain('<');
    expect(serialized).not.toContain('>');
    expect(JSON.parse(serialized)).toEqual({ name: '</script><script>alert(1)</script>' });
  });
});

describe('brand styles', () => {
  it('only accepts hex colours', () => {
    expect(brandStyles('#B45309')).toBe(
      '[data-storefront]{--primary:#b45309;--primary-foreground:#ffffff;--ring:#b45309}',
    );
    expect(brandStyles('red;}body{display:none')).toBeNull();
    expect(brandStyles(null)).toBeNull();
  });

  it('picks readable text on light and dark brand colours', () => {
    expect(readableTextOn('#fde047')).toBe('#111111');
    expect(readableTextOn('#1e3a8a')).toBe('#ffffff');
  });
});
