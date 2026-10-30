import { jsonResponse } from '@app/web/testing';
import { vi } from 'vitest';
import { storefrontFixture } from '@/testing/storefront-fixture';
import { getStorefront, listStorefronts, StorefrontApiError } from './storefront-api';

function stubFetch(response: Response) {
  const fetchMock = vi.fn<typeof fetch>(() => Promise.resolve(response));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('storefront data access', () => {
  it('fetches the public storefront endpoint with caching hints', async () => {
    const fetchMock = stubFetch(jsonResponse(storefrontFixture()));
    await expect(getStorefront('karahi-house')).resolves.toMatchObject({ name: 'Karahi House' });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('http://localhost:4000/api/v1/storefront/restaurants/karahi-house');
    expect(init).toMatchObject({ next: { revalidate: 30, tags: ['storefront:karahi-house'] } });
  });

  it('never calls the API for malformed slugs', async () => {
    const fetchMock = stubFetch(jsonResponse(storefrontFixture()));
    for (const slug of ['../admin', 'Karahi', 'a', 'x'.repeat(64), 'has space']) {
      await expect(getStorefront(slug)).resolves.toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('treats a 404 as not found', async () => {
    stubFetch(jsonResponse({ code: 'NOT_FOUND' }, 404));
    await expect(getStorefront('gone-kitchen')).resolves.toBeNull();
  });

  it('throws on server errors instead of showing a not-found page', async () => {
    stubFetch(jsonResponse({}, 503));
    await expect(getStorefront('busy-kitchen')).rejects.toBeInstanceOf(StorefrontApiError);
  });

  it('rejects responses that do not match the public contract', async () => {
    stubFetch(jsonResponse({ ...storefrontFixture(), categories: 'nope' }));
    await expect(getStorefront('odd-kitchen')).rejects.toThrow();
  });

  it('lists published restaurants for the sitemap', async () => {
    stubFetch(jsonResponse([{ slug: 'karahi-house', updatedAt: '2026-10-30T10:00:00.000Z' }]));
    await expect(listStorefronts()).resolves.toEqual([
      { slug: 'karahi-house', updatedAt: '2026-10-30T10:00:00.000Z' },
    ]);
  });
});
