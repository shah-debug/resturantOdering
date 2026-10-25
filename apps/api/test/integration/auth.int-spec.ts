import { apiErrorResponseSchema, meResponseSchema } from '@app/contracts';
import request from 'supertest';
import {
  API,
  Client,
  createHarness,
  type Harness,
  logIn,
  ORIGIN,
  PASSWORD,
  registerUser,
  signUpAndVerify,
  uniqueEmail,
} from '../support/auth-harness';

function errorCode(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

describe('authentication (in-memory Postgres)', () => {
  let harness: Harness;

  beforeAll(async () => {
    harness = await createHarness({ AUTH_LOCKOUT_THRESHOLD: '3' });
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('signup and verification', () => {
    it('responds identically for new and existing emails and never logs anyone in', async () => {
      const email = uniqueEmail('signup');
      const anonymous = new Client(harness.app);
      const first = await anonymous
        .post('/auth/signup', { email, password: PASSWORD, fullName: 'New Owner' })
        .expect(202);
      const second = await anonymous
        .post('/auth/signup', { email, password: PASSWORD, fullName: 'Someone Else' })
        .expect(202);

      expect(second.body).toEqual(first.body);
      expect(first.headers['set-cookie']).toBeUndefined();
      expect(harness.mailer.latestTo(email)?.subject).toBe('Sign-up attempt for your account');
    });

    it('normalizes email case and whitespace', async () => {
      const email = uniqueEmail('casing');
      await signUpAndVerify(harness, email);
      await logIn(harness, `  ${email.toUpperCase()} `);
    });

    it('rejects login until the email is verified', async () => {
      const email = uniqueEmail('unverified');
      await new Client(harness.app)
        .post('/auth/signup', { email, password: PASSWORD, fullName: 'Pending User' })
        .expect(202);
      const response = await new Client(harness.app)
        .post('/auth/login', { email, password: PASSWORD })
        .expect(403);
      expect(errorCode(response.body)).toBe('EMAIL_NOT_VERIFIED');
    });

    it('accepts a verification link only once', async () => {
      const email = uniqueEmail('once');
      const anonymous = new Client(harness.app);
      await anonymous
        .post('/auth/signup', { email, password: PASSWORD, fullName: 'Once' })
        .expect(202);
      const token = harness.mailer.tokenFor(email, '/verify-email');
      await anonymous.post('/auth/email/verify', { token }).expect(200);
      const reused = await anonymous.post('/auth/email/verify', { token }).expect(400);
      expect(errorCode(reused.body)).toBe('INVALID_TOKEN');
    });

    it('validates input with field-level errors', async () => {
      const response = await new Client(harness.app)
        .post('/auth/signup', { email: 'not-an-email', password: 'short', fullName: 'X' })
        .expect(400);
      const fields = apiErrorResponseSchema
        .parse(response.body)
        .details?.map((detail) => detail.field);
      expect(fields).toEqual(expect.arrayContaining(['email', 'password', 'fullName']));
    });
  });

  describe('login and session cookie', () => {
    it('sets an HttpOnly, SameSite=Lax session cookie and returns the user', async () => {
      const email = uniqueEmail('login');
      await signUpAndVerify(harness, email, 'Login User');
      const response = await new Client(harness.app)
        .post('/auth/login', { email, password: PASSWORD })
        .expect(200);

      const cookie = String(response.headers['set-cookie']);
      expect(cookie).toMatch(/^session=[A-Za-z0-9_-]{43};/);
      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('SameSite=Lax');
      expect(cookie).toContain('Path=/');
      expect(cookie).not.toContain('Domain=');

      const me = meResponseSchema.parse(response.body);
      expect(me.user).toMatchObject({ email, fullName: 'Login User', emailVerified: true });
      expect(JSON.stringify(response.body)).not.toMatch(/token|password/i);
    });

    it('stores only a hash of the session token', async () => {
      const { client } = await registerUser(harness, 'hash');
      const token = client.cookie?.split('=')[1] ?? '';
      const rows = await harness.prisma.session.findMany({ where: { tokenHash: token } });
      expect(rows).toHaveLength(0);
    });

    it('returns the same error for a wrong password and an unknown email', async () => {
      const email = uniqueEmail('wrong');
      await signUpAndVerify(harness, email);
      const anonymous = new Client(harness.app);
      const wrongPassword = await anonymous
        .post('/auth/login', { email, password: 'not the right password' })
        .expect(401);
      const unknownEmail = await anonymous
        .post('/auth/login', { email: uniqueEmail('nobody'), password: PASSWORD })
        .expect(401);

      expect(errorCode(wrongPassword.body)).toBe('INVALID_CREDENTIALS');
      expect(apiErrorResponseSchema.parse(unknownEmail.body).message).toBe(
        apiErrorResponseSchema.parse(wrongPassword.body).message,
      );
      expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    });

    it('locks the account after repeated failures, even for the right password', async () => {
      const email = uniqueEmail('lockout');
      await signUpAndVerify(harness, email);
      const anonymous = new Client(harness.app);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await anonymous.post('/auth/login', { email, password: 'wrong password!!' }).expect(401);
      }
      const locked = await anonymous.post('/auth/login', { email, password: PASSWORD }).expect(423);
      expect(errorCode(locked.body)).toBe('ACCOUNT_LOCKED');
    });

    it('rejects requests without a session, or with a forged one', async () => {
      await new Client(harness.app).get('/auth/me').expect(401);
      const forged = await new Client(harness.app, 'session=forged-token-value-that-does-not-exist')
        .get('/auth/me')
        .expect(401);
      expect(errorCode(forged.body)).toBe('UNAUTHENTICATED');
    });
  });

  describe('logout and revocation', () => {
    it('revokes the session on logout and clears the cookie', async () => {
      const { client } = await registerUser(harness, 'logout');
      await client.get('/auth/me').expect(200);
      const response = await client.post('/auth/logout').expect(204);
      expect(String(response.headers['set-cookie'])).toMatch(
        /^session=;.*Expires=Thu, 01 Jan 1970/,
      );
      await client.get('/auth/me').expect(401);
    });

    it('logout-all revokes every session of the user', async () => {
      const { email, client: first } = await registerUser(harness, 'everywhere');
      const second = await logIn(harness, email);
      await first.post('/auth/logout-all').expect(204);
      await first.get('/auth/me').expect(401);
      await second.get('/auth/me').expect(401);
    });

    it('rejects sessions of suspended users immediately', async () => {
      const { email, client } = await registerUser(harness, 'suspended');
      await harness.prisma.user.update({ where: { email }, data: { status: 'SUSPENDED' } });
      await client.get('/auth/me').expect(401);
    });

    it('rejects expired and idle sessions', async () => {
      const { email, client } = await registerUser(harness, 'expired');
      const user = await harness.prisma.user.findUniqueOrThrow({ where: { email } });
      await harness.prisma.session.updateMany({
        where: { userId: user.id },
        data: { lastSeenAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      });
      await client.get('/auth/me').expect(401);
    });
  });

  describe('password reset and change', () => {
    it('resets the password once, signs out all sessions and allows the new password', async () => {
      const { email, client } = await registerUser(harness, 'reset');
      const anonymous = new Client(harness.app);
      await anonymous.post('/auth/password/forgot', { email }).expect(202);
      const token = harness.mailer.tokenFor(email, '/reset-password');
      const newPassword = 'a brand new passphrase';

      await anonymous.post('/auth/password/reset', { token, password: newPassword }).expect(200);
      await client.get('/auth/me').expect(401);
      await anonymous.post('/auth/password/reset', { token, password: newPassword }).expect(400);
      await anonymous.post('/auth/login', { email, password: PASSWORD }).expect(401);
      await logIn(harness, email, newPassword);
    });

    it('does not reveal whether an email exists when requesting a reset', async () => {
      const response = await new Client(harness.app)
        .post('/auth/password/forgot', { email: uniqueEmail('ghost') })
        .expect(202);
      expect(response.body).toEqual({
        message: 'If that address can be used, we have sent an email with next steps.',
      });
    });

    it('changes the password, keeping only the current session', async () => {
      const { email, client } = await registerUser(harness, 'change');
      const other = await logIn(harness, email);
      await client
        .post('/auth/password/change', {
          currentPassword: 'wrong current pw',
          newPassword: 'another passphrase!',
        })
        .expect(400);
      await client
        .post('/auth/password/change', {
          currentPassword: PASSWORD,
          newPassword: 'another passphrase!',
        })
        .expect(200);
      await client.get('/auth/me').expect(200);
      await other.get('/auth/me').expect(401);
    });
  });

  describe('CSRF protection', () => {
    it('rejects state-changing requests without an allowed Origin', async () => {
      const { client } = await registerUser(harness, 'csrf');
      const server = harness.app.getHttpServer();
      const cookie = client.cookie ?? '';

      const missing = await request(server)
        .post(`${API}/auth/logout`)
        .set('Cookie', cookie)
        .expect(403);
      expect(errorCode(missing.body)).toBe('CSRF_REJECTED');
      await request(server)
        .post(`${API}/auth/logout`)
        .set('Cookie', cookie)
        .set('Origin', 'https://evil.example.com')
        .expect(403);
      await client.get('/auth/me').expect(200);
      await request(server)
        .post(`${API}/auth/logout`)
        .set('Cookie', cookie)
        .set('Origin', ORIGIN)
        .expect(204);
    });
  });

  describe('audit trail', () => {
    it('records sensitive actions without secrets', async () => {
      const { email, client } = await registerUser(harness, 'audit');
      await client.post('/auth/logout').expect(204);
      const user = await harness.prisma.user.findUniqueOrThrow({ where: { email } });
      const logs = await harness.prisma.auditLog.findMany({
        where: { actorUserId: user.id },
        orderBy: { createdAt: 'asc' },
      });
      expect(logs.map((log) => log.action)).toEqual(
        expect.arrayContaining([
          'auth.signup',
          'auth.email_verified',
          'auth.login_succeeded',
          'auth.logout',
        ]),
      );
      expect(JSON.stringify(logs)).not.toContain(PASSWORD);
    });
  });
});
