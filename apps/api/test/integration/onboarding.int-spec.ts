import { randomUUID } from 'node:crypto';
import {
  apiErrorResponseSchema,
  branchSchema,
  onboardingStatusSchema,
  organizationSchema,
  slugAvailabilitySchema,
} from '@app/contracts';
import {
  addMember,
  Client,
  createHarness,
  createOrganization,
  type Harness,
  registerUser,
} from '../support/auth-harness';

function fields(body: unknown): string[] {
  return apiErrorResponseSchema.parse(body).details?.map((detail) => detail.field) ?? [];
}

const PROFILE = {
  description: 'Charcoal karahi and BBQ cooked fresh to order.',
  contactPhone: '+923001234567',
  timezone: 'Asia/Karachi',
  logoUrl: 'https://cdn.example.com/logo.png',
};

const BRANCH = {
  name: 'Gulberg',
  phone: '+924235000000',
  addressLine: '12 Main Boulevard',
  area: 'Gulberg III',
  city: 'Lahore',
};

const DELIVERY = { feeMinor: 15_000, minimumOrderMinor: 80_000, estimatedMinutes: 40 };

describe('onboarding (in-memory Postgres)', () => {
  let harness: Harness;
  let owner: Client;
  let organizationId: string;

  beforeAll(async () => {
    harness = await createHarness();
    ({ client: owner } = await registerUser(harness, 'onboard-owner'));
    organizationId = await createOrganization(owner, 'karahi');
  });

  afterAll(async () => {
    await harness.close();
  });

  async function status() {
    const response = await owner.get(`/organizations/${organizationId}/onboarding`).expect(200);
    return onboardingStatusSchema.parse(response.body);
  }

  describe('slugs', () => {
    it('reports availability for free, taken, reserved and invalid slugs', async () => {
      const organization = organizationSchema.parse(
        (await owner.get(`/organizations/${organizationId}`).expect(200)).body,
      );
      const check = async (slug: string) =>
        slugAvailabilitySchema.parse(
          (
            await owner
              .get(`/organizations/slug-availability?slug=${encodeURIComponent(slug)}`)
              .expect(200)
          ).body,
        );

      expect(await check(`fresh-${randomUUID().slice(0, 6)}`)).toMatchObject({
        available: true,
        reason: null,
      });
      expect(await check(organization.slug.toUpperCase())).toMatchObject({
        available: false,
        reason: 'taken',
      });
      expect(await check('admin')).toMatchObject({ available: false, reason: 'reserved' });
      expect(await check('-bad-')).toMatchObject({ available: false, reason: 'invalid' });
    });

    it('rejects a duplicate slug on the slug field, regardless of case', async () => {
      const organization = organizationSchema.parse(
        (await owner.get(`/organizations/${organizationId}`).expect(200)).body,
      );
      const { client: someoneElse } = await registerUser(harness, 'dup-slug');
      const response = await someoneElse
        .post('/organizations', { name: 'Copycat', slug: organization.slug.toUpperCase() })
        .expect(409);
      expect(fields(response.body)).toEqual(['slug']);
    });

    it('requires authentication to check slugs', async () => {
      await new Client(harness.app).get('/organizations/slug-availability?slug=abc').expect(401);
    });
  });

  describe('profile', () => {
    it('validates the time zone, logo URL and description', async () => {
      const response = await owner
        .patch(`/organizations/${organizationId}`, {
          timezone: 'Mars/Olympus_Mons',
          logoUrl: 'http://insecure.example.com/logo.png',
          description: 'short',
          contactPhone: '0300 1234567',
        })
        .expect(400);
      expect(fields(response.body)).toEqual(
        expect.arrayContaining(['timezone', 'logoUrl', 'description', 'contactPhone']),
      );
    });

    it('starts incomplete and cannot be completed early', async () => {
      const initial = await status();
      expect(initial.canComplete).toBe(false);
      expect(initial.primaryBranchId).toBeNull();
      expect(initial.steps.find((step) => step.id === 'profile')?.complete).toBe(false);
      const early = await owner
        .post(`/organizations/${organizationId}/onboarding/complete`)
        .expect(409);
      expect(fields(early.body)).toEqual(
        expect.arrayContaining(['description', 'contact_phone', 'branch']),
      );
    });

    it('saves the profile and marks the profile step complete', async () => {
      const response = await owner.patch(`/organizations/${organizationId}`, PROFILE).expect(200);
      expect(organizationSchema.parse(response.body)).toMatchObject(PROFILE);
      expect((await status()).steps.find((step) => step.id === 'profile')?.complete).toBe(true);
    });
  });

  describe('branch, hours and fulfillment', () => {
    let branchId: string;

    it('validates and creates the initial branch with a derived slug', async () => {
      const invalid = await owner
        .post(`/organizations/${organizationId}/branches`, { ...BRANCH, phone: '12345', city: '' })
        .expect(400);
      expect(fields(invalid.body)).toEqual(expect.arrayContaining(['phone', 'city']));

      const created = branchSchema.parse(
        (await owner.post(`/organizations/${organizationId}/branches`, BRANCH).expect(201)).body,
      );
      branchId = created.id;
      expect(created).toMatchObject({
        slug: 'gulberg',
        deliveryEnabled: true,
        delivery: null,
        openingHours: [],
      });
      expect((await status()).primaryBranchId).toBe(branchId);

      const second = branchSchema.parse(
        (await owner.post(`/organizations/${organizationId}/branches`, BRANCH).expect(201)).body,
      );
      expect(second.slug).toBe('gulberg-2');
      expect((await status()).primaryBranchId).toBe(branchId);
    });

    it('updates the branch', async () => {
      const updated = branchSchema.parse(
        (
          await owner
            .patch(`/organizations/${organizationId}/branches/${branchId}`, {
              area: 'MM Alam Road',
            })
            .expect(200)
        ).body,
      );
      expect(updated.area).toBe('MM Alam Road');
    });

    it('rejects overlapping and zero-length opening hours', async () => {
      const overlapping = await owner
        .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
          intervals: [
            { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
            { dayOfWeek: 6, opensAt: '01:00', closesAt: '04:00' },
          ],
        })
        .expect(400);
      expect(fields(overlapping.body)).toEqual(['intervals.1']);

      const zero = await owner
        .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
          intervals: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '09:00' }],
        })
        .expect(400);
      expect(fields(zero.body)).toEqual(['intervals.0.closesAt']);

      await owner
        .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
          intervals: [{ dayOfWeek: 8, opensAt: '25:00', closesAt: '10:00' }],
        })
        .expect(400);
    });

    it('replaces opening hours, including overnight shifts', async () => {
      const intervals = [
        { dayOfWeek: 1, opensAt: '12:00', closesAt: '15:00' },
        { dayOfWeek: 1, opensAt: '18:00', closesAt: '23:30' },
        { dayOfWeek: 5, opensAt: '18:00', closesAt: '02:00' },
      ];
      const saved = branchSchema.parse(
        (
          await owner
            .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
              intervals,
            })
            .expect(200)
        ).body,
      );
      expect(saved.openingHours).toEqual(intervals);

      const replaced = branchSchema.parse(
        (
          await owner
            .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
              intervals: intervals.slice(0, 1),
            })
            .expect(200)
        ).body,
      );
      expect(replaced.openingHours).toHaveLength(1);
      expect((await status()).steps.find((step) => step.id === 'hours')?.complete).toBe(true);
    });

    it('requires at least one fulfillment method and delivery settings when delivering', async () => {
      const path = `/organizations/${organizationId}/branches/${branchId}/fulfillment`;
      const neither = await owner
        .put(path, {
          deliveryEnabled: false,
          pickupEnabled: false,
          preparationMinutes: 20,
          delivery: null,
        })
        .expect(400);
      expect(fields(neither.body)).toEqual(['pickupEnabled']);

      const noSettings = await owner
        .put(path, {
          deliveryEnabled: true,
          pickupEnabled: true,
          preparationMinutes: 20,
          delivery: null,
        })
        .expect(400);
      expect(fields(noSettings.body)).toEqual(['delivery']);

      const badSettings = await owner
        .put(path, {
          deliveryEnabled: true,
          pickupEnabled: true,
          preparationMinutes: 2,
          delivery: { ...DELIVERY, feeMinor: -1 },
        })
        .expect(400);
      expect(fields(badSettings.body)).toEqual(
        expect.arrayContaining(['preparationMinutes', 'delivery.feeMinor']),
      );
    });

    it('saves delivery and pickup settings', async () => {
      const saved = branchSchema.parse(
        (
          await owner
            .put(`/organizations/${organizationId}/branches/${branchId}/fulfillment`, {
              deliveryEnabled: true,
              pickupEnabled: true,
              preparationMinutes: 25,
              delivery: DELIVERY,
            })
            .expect(200)
        ).body,
      );
      expect(saved).toMatchObject({
        deliveryEnabled: true,
        preparationMinutes: 25,
        delivery: DELIVERY,
      });

      const pickupOnly = branchSchema.parse(
        (
          await owner
            .put(`/organizations/${organizationId}/branches/${branchId}/fulfillment`, {
              deliveryEnabled: false,
              pickupEnabled: true,
              preparationMinutes: 25,
              delivery: null,
            })
            .expect(200)
        ).body,
      );
      expect(pickupOnly.deliveryEnabled).toBe(false);
    });
  });

  describe('readiness and completion', () => {
    it('reports readiness with the menu as upcoming, then completes once', async () => {
      const ready = await status();
      expect(ready.canComplete).toBe(true);
      expect(ready.checks.find((check) => check.id === 'menu')?.status).toBe('upcoming');
      expect(ready.checks.filter((check) => check.status === 'missing')).toEqual([]);

      const completed = onboardingStatusSchema.parse(
        (await owner.post(`/organizations/${organizationId}/onboarding/complete`).expect(200)).body,
      );
      expect(completed.completedAt).not.toBeNull();
      expect(completed.steps.every((step) => step.complete)).toBe(true);

      const again = onboardingStatusSchema.parse(
        (await owner.post(`/organizations/${organizationId}/onboarding/complete`).expect(200)).body,
      );
      expect(again.completedAt).toBe(completed.completedAt);
    });

    it('records audit events for setup changes', async () => {
      const actions = (
        await harness.prisma.auditLog.findMany({
          where: { organizationId },
          select: { action: true },
        })
      ).map((log) => log.action);
      expect(actions).toEqual(
        expect.arrayContaining([
          'organization.updated',
          'branch.created',
          'branch.opening_hours_updated',
          'branch.fulfillment_updated',
          'organization.onboarding_completed',
        ]),
      );
    });
  });

  describe('authorization', () => {
    let kitchen: Client;
    let rider: Client;
    let branchId: string;

    beforeAll(async () => {
      ({ client: kitchen } = await addMember(
        harness,
        owner,
        organizationId,
        'KITCHEN_STAFF',
        'onb-kitchen',
      ));
      ({ client: rider } = await addMember(harness, owner, organizationId, 'RIDER', 'onb-rider'));
      branchId = (await status()).primaryBranchId ?? '';
    });

    it('lets staff read setup status but not change the restaurant or its branches', async () => {
      await kitchen.get(`/organizations/${organizationId}/onboarding`).expect(200);
      await kitchen.get(`/organizations/${organizationId}/branches`).expect(200);
      await kitchen
        .patch(`/organizations/${organizationId}`, { description: 'Kitchen rewrote this text' })
        .expect(403);
      await kitchen.post(`/organizations/${organizationId}/branches`, BRANCH).expect(403);
      await kitchen
        .patch(`/organizations/${organizationId}/branches/${branchId}`, { city: 'Karachi' })
        .expect(403);
      await kitchen
        .put(`/organizations/${organizationId}/branches/${branchId}/opening-hours`, {
          intervals: [],
        })
        .expect(403);
      await kitchen.post(`/organizations/${organizationId}/onboarding/complete`).expect(403);
      await rider.get(`/organizations/${organizationId}/branches`).expect(403);
    });

    it('hides other restaurants and their branches', async () => {
      const { client: outsider } = await registerUser(harness, 'onb-outsider');
      const otherOrganization = await createOrganization(outsider, 'outsider');
      const otherBranch = branchSchema.parse(
        (await outsider.post(`/organizations/${otherOrganization}/branches`, BRANCH).expect(201))
          .body,
      );

      await owner.patch(`/organizations/${otherOrganization}`, PROFILE).expect(404);
      await owner.get(`/organizations/${otherOrganization}/onboarding`).expect(404);
      await owner.post(`/organizations/${otherOrganization}/branches`, BRANCH).expect(404);
      await owner.get(`/organizations/${organizationId}/branches/${otherBranch.id}`).expect(404);
      await owner
        .put(`/organizations/${organizationId}/branches/${otherBranch.id}/opening-hours`, {
          intervals: [{ dayOfWeek: 1, opensAt: '09:00', closesAt: '17:00' }],
        })
        .expect(404);
      const untouched = branchSchema.parse(
        (
          await outsider
            .get(`/organizations/${otherOrganization}/branches/${otherBranch.id}`)
            .expect(200)
        ).body,
      );
      expect(untouched.openingHours).toEqual([]);
    });

    it('never lets a client grant itself owner or platform-admin rights', async () => {
      const { client, email } = await registerUser(harness, 'escalate');
      await client
        .post('/organizations', {
          name: 'Sneaky',
          slug: `sneaky-${randomUUID().slice(0, 6)}`,
          role: 'OWNER',
          platformRole: 'SUPER_ADMIN',
        })
        .expect(400);
      await kitchen
        .patch(`/organizations/${organizationId}`, { platformRole: 'SUPER_ADMIN' })
        .expect(403);
      await owner
        .patch(`/organizations/${organizationId}`, { ownerId: randomUUID(), role: 'OWNER' })
        .expect(400);
      await client.patch(`/organizations/${organizationId}`, { name: 'Taken over' }).expect(404);

      const user = await harness.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(user.platformRole).toBeNull();
      const memberships = await harness.prisma.membership.count({ where: { userId: user.id } });
      expect(memberships).toBe(0);
    });
  });
});
