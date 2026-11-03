import { jsonResponse } from '@app/web/testing';
import { vi } from 'vitest';
import { storefrontFixture } from '@/testing/storefront-fixture';
import {
  getOrderTracking,
  getStorefront,
  listStorefronts,
  StorefrontApiError,
} from './storefront-api';

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

  it('forwards the visitor address and the token when tracking an order', async () => {
    const fetchMock = stubFetch(jsonResponse({}, 404));
    const orderId = '018f0000-0000-7000-8000-000000000999';
    const token = 'A'.repeat(43);
    await expect(
      getOrderTracking('karahi-house', orderId, token, '203.0.113.7, 10.0.0.2'),
    ).resolves.toBeNull();
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).toMatchObject({
      'X-Order-Token': token,
      'X-Forwarded-For': '203.0.113.7, 10.0.0.2',
    });
    expect(init).toMatchObject({ cache: 'no-store' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('drops a malformed forwarded address and never calls the API for a bad token', async () => {
    const fetchMock = stubFetch(jsonResponse({}, 404));
    const orderId = '018f0000-0000-7000-8000-000000000999';
    await getOrderTracking('karahi-house', orderId, 'A'.repeat(43), '203.0.113.7;X-Admin=1');
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init?.headers).not.toHaveProperty('X-Forwarded-For');
    fetchMock.mockClear();
    await expect(getOrderTracking('karahi-house', orderId, 'short')).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
