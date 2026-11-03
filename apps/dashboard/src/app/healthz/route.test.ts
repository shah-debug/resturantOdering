import { config } from '@/proxy';
import { GET } from './route';

describe('GET /healthz', () => {
  it('answers without touching the API and is never cached', async () => {
    const response = GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('is excluded from the page proxy so it is never redirected to sign-in', () => {
    const [matcher] = config.matcher;
    const pattern = new RegExp(`^${matcher?.source ?? ''}$`);
    expect(pattern.test('/healthz')).toBe(false);
    expect(pattern.test('/orders')).toBe(true);
  });
});
