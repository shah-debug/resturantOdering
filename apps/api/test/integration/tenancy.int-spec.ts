import { randomUUID } from 'node:crypto';
import { apiErrorResponseSchema } from '@app/contracts';
import {
  addMember,
  Client,
  createHarness,
  createOrganization,
  type Harness,
  logIn,
  PASSWORD,
  registerUser,
} from '../support/auth-harness';

function errorCode(body: unknown): string | undefined {
  return apiErrorResponseSchema.safeParse(body).data?.code;
}

describe('organization access and tenant isolation (in-memory Postgres)', () => {
  let harness: Harness;
  let ownerA: Client;
  let ownerAEmail: string;
  let orgA: string;
  let ownerB: Client;
  let orgB: string;
  let memberOfB: string;
  let branchOfB: string;
  let manager: Client;
  let managerMembershipId: string;
  let kitchen: Client;
  let kitchenMembershipId: string;
  let rider: Client;
  let orderStaff: Client;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: ownerA, email: ownerAEmail } = await registerUser(harness, 'owner-a'));
    orgA = await createOrganization(ownerA, 'alpha');
    ({ client: ownerB } = await registerUser(harness, 'owner-b'));
    orgB = await createOrganization(ownerB, 'bravo');

    ({ membershipId: memberOfB } = await addMember(
      harness,
      ownerB,
      orgB,
      'ORDER_STAFF',
      'b-staff',
    ));
    branchOfB = (
      await harness.prisma.branch.create({
        data: {
          organizationId: orgB,
          name: 'B Branch',
          slug: 'b-main',
          addressLine: '1 B Road',
          city: 'Karachi',
        },
      })
    ).id;

    ({ client: manager, membershipId: managerMembershipId } = await addMember(
      harness,
      ownerA,
      orgA,
      'MANAGER',
      'a-manager',
    ));
    ({ client: kitchen, membershipId: kitchenMembershipId } = await addMember(
      harness,
      ownerA,
      orgA,
      'KITCHEN_STAFF',
      'a-kitchen',
    ));
    ({ client: rider } = await addMember(harness, ownerA, orgA, 'RIDER', 'a-rider'));
    ({ client: orderStaff } = await addMember(harness, ownerA, orgA, 'ORDER_STAFF', 'a-orders'));
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('cross-tenant access', () => {
    it('lets owners read their own organization', async () => {
      await ownerA.get(`/organizations/${orgA}`).expect(200);
      await ownerA.get(`/organizations/${orgA}/members`).expect(200);
    });

    it('lists only organizations the user belongs to', async () => {
      const response = await ownerA.get('/organizations').expect(200);
      const ids = (response.body as { id: string }[]).map((organization) => organization.id);
      expect(ids).toEqual([orgA]);
    });

    it('hides another organization behind 404 for reads and writes', async () => {
      const responses = await Promise.all([
        ownerA.get(`/organizations/${orgB}`),
        ownerA.patch(`/organizations/${orgB}`, { name: 'Hijacked' }),
        ownerA.get(`/organizations/${orgB}/members`),
        ownerA.post(`/organizations/${orgB}/members`, {
          email: 'intruder@example.com',
          fullName: 'Intruder',
          role: 'OWNER',
        }),
        ownerA.patch(`/organizations/${orgB}/members/${memberOfB}`, { role: 'OWNER' }),
        ownerA.delete(`/organizations/${orgB}/members/${memberOfB}`),
      ]);
      for (const response of responses) {
        expect(response.status).toBe(404);
        expect(errorCode(response.body)).toBe('NOT_FOUND');
      }
      const organizationB = await harness.prisma.organization.findUniqueOrThrow({
        where: { id: orgB },
      });
      expect(organizationB.name).not.toBe('Hijacked');
    });

    it('does not find another organization’s membership through its own organization route', async () => {
      await ownerA
        .patch(`/organizations/${orgA}/members/${memberOfB}`, { role: 'OWNER' })
        .expect(404);
      await ownerA.delete(`/organizations/${orgA}/members/${memberOfB}`).expect(404);
      const membership = await harness.prisma.membership.findUniqueOrThrow({
        where: { id: memberOfB },
      });
      expect(membership).toMatchObject({ organizationId: orgB, role: 'ORDER_STAFF' });
    });

    it('ignores organization IDs smuggled into request bodies', async () => {
      const response = await ownerA
        .patch(`/organizations/${orgA}`, { name: 'Alpha Kitchen', organizationId: orgB })
        .expect(400);
      expect(errorCode(response.body)).toBe('VALIDATION_FAILED');
    });

    it('rejects branches from another organization', async () => {
      const response = await ownerA
        .post(`/organizations/${orgA}/members`, {
          email: `branch-${randomUUID().slice(0, 6)}@example.com`,
          fullName: 'Branch Person',
          role: 'ORDER_STAFF',
          branchId: branchOfB,
        })
        .expect(400);
      expect(apiErrorResponseSchema.parse(response.body).details?.[0]?.field).toBe('branchId');
    });

    it('returns 404 for malformed and unknown organization IDs', async () => {
      await ownerA.get('/organizations/not-a-uuid').expect(404);
      await ownerA.get(`/organizations/${randomUUID()}`).expect(404);
    });
  });

  describe('role permissions', () => {
    it.each([
      ['kitchen staff', () => kitchen],
      ['riders', () => rider],
      ['order staff', () => orderStaff],
    ])('lets %s read the organization but not manage it', async (_label, client) => {
      await client().get(`/organizations/${orgA}`).expect(200);
      await client().get(`/organizations/${orgA}/members`).expect(403);
      await client().patch(`/organizations/${orgA}`, { name: 'Renamed' }).expect(403);
      await client()
        .post(`/organizations/${orgA}/members`, {
          email: 'x@example.com',
          fullName: 'X Person',
          role: 'RIDER',
        })
        .expect(403);
    });

    it('lets managers invite staff but not managers or owners', async () => {
      await manager
        .post(`/organizations/${orgA}/members`, {
          email: `kitchen-${randomUUID().slice(0, 6)}@example.com`,
          fullName: 'New Cook',
          role: 'KITCHEN_STAFF',
        })
        .expect(201);
      for (const role of ['MANAGER', 'OWNER']) {
        await manager
          .post(`/organizations/${orgA}/members`, {
            email: `${role.toLowerCase()}-${randomUUID().slice(0, 6)}@example.com`,
            fullName: 'Too Senior',
            role,
          })
          .expect(403);
      }
    });

    it('does not let managers change or remove owners', async () => {
      const owners = await harness.prisma.membership.findMany({
        where: { organizationId: orgA, role: 'OWNER' },
      });
      const ownerMembershipId = owners[0]?.id ?? '';
      await manager
        .patch(`/organizations/${orgA}/members/${ownerMembershipId}`, { role: 'RIDER' })
        .expect(403);
      await manager.delete(`/organizations/${orgA}/members/${ownerMembershipId}`).expect(403);
    });

    it('does not let anyone change their own membership', async () => {
      await manager
        .patch(`/organizations/${orgA}/members/${managerMembershipId}`, { role: 'OWNER' })
        .expect(403);
    });
  });

  describe('revoked access', () => {
    it('removes access immediately when a member is suspended, and restores it on reactivation', async () => {
      await kitchen.get(`/organizations/${orgA}`).expect(200);
      await ownerA
        .patch(`/organizations/${orgA}/members/${kitchenMembershipId}`, { status: 'SUSPENDED' })
        .expect(200);
      await kitchen.get(`/organizations/${orgA}`).expect(404);
      const me = await kitchen.get('/auth/me').expect(200);
      expect((me.body as { memberships: unknown[] }).memberships).toEqual([]);
      await ownerA
        .patch(`/organizations/${orgA}/members/${kitchenMembershipId}`, { status: 'ACTIVE' })
        .expect(200);
      await kitchen.get(`/organizations/${orgA}`).expect(200);
    });

    it('removes access immediately when a member is removed', async () => {
      const removed = await addMember(harness, ownerA, orgA, 'RIDER', 'a-removed');
      await removed.client.get(`/organizations/${orgA}`).expect(200);
      await ownerA.delete(`/organizations/${orgA}/members/${removed.membershipId}`).expect(204);
      await removed.client.get(`/organizations/${orgA}`).expect(404);
    });

    it('gives invited members no access until they accept, and invitations work once', async () => {
      const { client: invitee, email } = await registerUser(harness, 'invitee');
      await ownerA
        .post(`/organizations/${orgA}/members`, { email, fullName: 'Invitee', role: 'ORDER_STAFF' })
        .expect(201);
      await invitee.get(`/organizations/${orgA}`).expect(404);

      const token = harness.mailer.tokenFor(email, '/accept-invitation');
      await new Client(harness.app).post('/auth/invitations/accept', { token }).expect(200);
      await invitee.get(`/organizations/${orgA}`).expect(200);
      await new Client(harness.app).post('/auth/invitations/accept', { token }).expect(400);
    });

    it('requires a password when the invited person has no account yet', async () => {
      const email = `fresh-${randomUUID().slice(0, 6)}@example.com`;
      await ownerA
        .post(`/organizations/${orgA}/members`, { email, fullName: 'Fresh Person', role: 'RIDER' })
        .expect(201);
      const token = harness.mailer.tokenFor(email, '/accept-invitation');
      const response = await new Client(harness.app)
        .post('/auth/invitations/accept', { token })
        .expect(400);
      expect(apiErrorResponseSchema.parse(response.body).details?.[0]?.field).toBe('password');
      await new Client(harness.app)
        .post('/auth/invitations/accept', { token, password: PASSWORD })
        .expect(200);
      await logIn(harness, email);
    });

    it('blocks members of a suspended organization', async () => {
      const { client: owner } = await registerUser(harness, 'owner-c');
      const orgC = await createOrganization(owner, 'charlie');
      await harness.prisma.organization.update({
        where: { id: orgC },
        data: { status: 'SUSPENDED' },
      });
      await owner.get(`/organizations/${orgC}`).expect(403);
    });
  });

  describe('ownership safeguards', () => {
    it('always keeps at least one active owner', async () => {
      const { client: founder } = await registerUser(harness, 'founder');
      const orgD = await createOrganization(founder, 'delta');
      const partner = await addMember(harness, founder, orgD, 'MANAGER', 'partner');
      await founder
        .patch(`/organizations/${orgD}/members/${partner.membershipId}`, { role: 'OWNER' })
        .expect(200);

      const founderMembership = await harness.prisma.membership.findFirstOrThrow({
        where: { organizationId: orgD, role: 'OWNER', NOT: { id: partner.membershipId } },
      });
      await partner.client
        .patch(`/organizations/${orgD}/members/${founderMembership.id}`, { status: 'SUSPENDED' })
        .expect(200);

      const { email: adminEmail } = await registerUser(harness, 'platform-admin');
      await harness.prisma.user.update({
        where: { email: adminEmail },
        data: { platformRole: 'SUPER_ADMIN' },
      });
      const admin = await logIn(harness, adminEmail);
      const response = await admin
        .patch(`/organizations/${orgD}/members/${partner.membershipId}`, { role: 'MANAGER' })
        .expect(409);
      expect(apiErrorResponseSchema.parse(response.body).message).toMatch(
        /at least one active owner/,
      );
    });
  });

  describe('platform roles', () => {
    let support: Client;
    let superAdmin: Client;

    beforeAll(async () => {
      const { email: supportEmail } = await registerUser(harness, 'support');
      await harness.prisma.user.update({
        where: { email: supportEmail },
        data: { platformRole: 'SUPPORT' },
      });
      support = await logIn(harness, supportEmail);
      const { email: adminEmail } = await registerUser(harness, 'super-admin');
      await harness.prisma.user.update({
        where: { email: adminEmail },
        data: { platformRole: 'SUPER_ADMIN' },
      });
      superAdmin = await logIn(harness, adminEmail);
    });

    it('lets support staff read any organization but not change it', async () => {
      await support.get(`/organizations/${orgB}`).expect(200);
      await support.get(`/organizations/${orgB}/members`).expect(200);
      await support.patch(`/organizations/${orgB}`, { name: 'Support Edit' }).expect(403);
      await support
        .post(`/organizations/${orgB}/members`, {
          email: 'x@example.com',
          fullName: 'X Person',
          role: 'RIDER',
        })
        .expect(403);
    });

    it('lets super admins manage any organization', async () => {
      await superAdmin.patch(`/organizations/${orgB}`, { primaryColor: '#123456' }).expect(200);
    });

    it('restricts the platform organization list to platform roles', async () => {
      const response = await support.get('/platform/organizations?page=1&pageSize=2').expect(200);
      expect(response.body).toMatchObject({ page: 1, pageSize: 2 });
      expect((response.body as { items: unknown[] }).items).toHaveLength(2);
      await ownerA.get('/platform/organizations').expect(403);
    });
  });

  describe('audit trail', () => {
    it('records membership changes against the right organization only', async () => {
      const ownerUser = await harness.prisma.user.findUniqueOrThrow({
        where: { email: ownerAEmail },
      });
      const logs = await harness.prisma.auditLog.findMany({ where: { actorUserId: ownerUser.id } });
      const organizationActions = logs.filter((log) => log.organizationId !== null);
      expect(organizationActions.length).toBeGreaterThan(0);
      expect(organizationActions.every((log) => log.organizationId === orgA)).toBe(true);
      expect(organizationActions.map((log) => log.action)).toEqual(
        expect.arrayContaining([
          'organization.created',
          'membership.invited',
          'membership.updated',
          'membership.removed',
        ]),
      );
    });
  });
});
