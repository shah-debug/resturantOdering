import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';
import { PrismaService } from '../../src/database/prisma.service';
import { PasswordHasher } from '../../src/modules/auth/crypto/password-hasher';
import { Mailer, type MailMessage } from '../../src/modules/mail/mailer';
import { createTestApp } from '../create-test-app';

export const ORIGIN = 'http://localhost:3000';
export const PASSWORD = 'correct horse battery staple';
export const API = '/api/v1';

export class RecordingMailer extends Mailer {
  readonly messages: MailMessage[] = [];

  send(message: MailMessage): Promise<void> {
    this.messages.push(message);
    return Promise.resolve();
  }

  latestTo(email: string): MailMessage | undefined {
    return this.messages.filter((message) => message.to === email).at(-1);
  }

  tokenFor(email: string, path: string): string {
    const text = this.latestTo(email)?.text ?? '';
    const match = new RegExp(`${path}\\?token=([A-Za-z0-9_%-]+)`).exec(text);
    if (!match?.[1]) {
      throw new Error(`No ${path} link emailed to ${email}`);
    }
    return decodeURIComponent(match[1]);
  }
}

export interface Harness {
  app: NestExpressApplication;
  mailer: RecordingMailer;
  prisma: PrismaService;
  close: () => Promise<void>;
}

export async function createHarness(env: Record<string, string> = {}): Promise<Harness> {
  const mailer = new RecordingMailer();
  const app = await createTestApp({
    env: { AUTH_RATE_LIMIT_MAX_REQUESTS: '1000', RATE_LIMIT_MAX_REQUESTS: '10000', ...env },
    overrides: [
      { provide: Mailer, useValue: mailer },
      {
        provide: PasswordHasher,
        useValue: new PasswordHasher({
          cost: 2 ** 10,
          blockSize: 8,
          parallelization: 1,
          keyLength: 32,
          saltLength: 16,
        }),
      },
    ],
  });
  return { app, mailer, prisma: app.get(PrismaService), close: () => app.close() };
}

export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@example.com`;
}

export function sessionCookieFrom(response: Response): string {
  const header: unknown = response.headers['set-cookie'];
  const values: unknown[] = Array.isArray(header) ? header : [header];
  const cookies = values.filter((value): value is string => typeof value === 'string');
  const session = cookies.find((cookie) => cookie.startsWith('session='));
  if (!session) {
    throw new Error('No session cookie in response');
  }
  return session.split(';')[0] ?? '';
}

export class Client {
  constructor(
    private readonly app: NestExpressApplication,
    readonly cookie: string | null = null,
  ) {}

  get(path: string) {
    const req = request(this.app.getHttpServer()).get(`${API}${path}`);
    return this.cookie ? req.set('Cookie', this.cookie) : req;
  }

  post(path: string, body: object = {}) {
    return this.withAuth(request(this.app.getHttpServer()).post(`${API}${path}`)).send(body);
  }

  patch(path: string, body: object = {}) {
    return this.withAuth(request(this.app.getHttpServer()).patch(`${API}${path}`)).send(body);
  }

  delete(path: string) {
    return this.withAuth(request(this.app.getHttpServer()).delete(`${API}${path}`));
  }

  private withAuth(req: request.Test): request.Test {
    const withOrigin = req.set('Origin', ORIGIN);
    return this.cookie ? withOrigin.set('Cookie', this.cookie) : withOrigin;
  }
}

export async function signUpAndVerify(
  harness: Harness,
  email: string,
  fullName = 'Test User',
): Promise<void> {
  const anonymous = new Client(harness.app);
  await anonymous.post('/auth/signup', { email, password: PASSWORD, fullName }).expect(202);
  const token = harness.mailer.tokenFor(email, '/verify-email');
  await anonymous.post('/auth/email/verify', { token }).expect(200);
}

export async function logIn(harness: Harness, email: string, password = PASSWORD): Promise<Client> {
  const response = await new Client(harness.app)
    .post('/auth/login', { email, password })
    .expect(200);
  return new Client(harness.app, sessionCookieFrom(response));
}

export async function registerUser(
  harness: Harness,
  label: string,
): Promise<{ email: string; client: Client }> {
  const email = uniqueEmail(label);
  await signUpAndVerify(harness, email, `${label} user`);
  return { email, client: await logIn(harness, email) };
}

export async function createOrganization(client: Client, label: string): Promise<string> {
  const slug = `${label}-${randomUUID().slice(0, 6)}`.toLowerCase();
  const response = await client
    .post('/organizations', { name: `${label} Kitchen`, slug })
    .expect(201);
  const body = response.body as { id: string };
  return body.id;
}

export async function addMember(
  harness: Harness,
  owner: Client,
  organizationId: string,
  role: string,
  label: string,
): Promise<{ email: string; membershipId: string; client: Client }> {
  const email = uniqueEmail(label);
  const invite = await owner
    .post(`/organizations/${organizationId}/members`, { email, fullName: `${label} member`, role })
    .expect(201);
  const token = harness.mailer.tokenFor(email, '/accept-invitation');
  await new Client(harness.app)
    .post('/auth/invitations/accept', { token, password: PASSWORD })
    .expect(200);
  const body = invite.body as { membershipId: string };
  return { email, membershipId: body.membershipId, client: await logIn(harness, email) };
}
