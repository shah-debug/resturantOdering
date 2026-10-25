import { apiErrorResponseSchema } from '@app/contracts';
import { Client, createHarness, type Harness, registerUser } from '../support/auth-harness';

describe('rate limits on sensitive auth endpoints (in-memory Postgres)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness({ AUTH_RATE_LIMIT_MAX_REQUESTS: '3' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('throttles repeated login attempts from one client with RATE_LIMITED', async () => {
    const anonymous = new Client(harness.app);
    const attempt = () =>
      anonymous
        .post('/auth/login', { email: 'nobody@example.com', password: 'whatever password' })
        .set('X-Forwarded-For', '198.51.100.7');

    for (let i = 0; i < 3; i += 1) {
      await attempt().expect(401);
    }
    const throttled = await attempt().expect(429);
    expect(apiErrorResponseSchema.parse(throttled.body).code).toBe('RATE_LIMITED');
    expect(throttled.headers['retry-after-sensitive']).toBeDefined();

    await anonymous
      .post('/auth/login', { email: 'nobody@example.com', password: 'whatever password' })
      .set('X-Forwarded-For', '198.51.100.8')
      .expect(401);
  });

  it('does not apply the sensitive limit to ordinary authenticated reads', async () => {
    const { client } = await registerUser(harness, 'reader');
    for (let i = 0; i < 6; i += 1) {
      await client.get('/auth/me').expect(200);
    }
  });
});
