import { safeNextPath } from './form';

describe('safeNextPath', () => {
  it.each([
    '/organizations/abc/orders',
    '/platform/billing?status=SUBMITTED',
    '/organizations/abc/orders#new',
  ])('keeps the in-app path %s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    undefined,
    '',
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    '\\\\evil.example',
    '/ /evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    ' /organizations',
  ])('falls back to the home page for %j', (path) => {
    expect(safeNextPath(path)).toBe('/');
  });
});
