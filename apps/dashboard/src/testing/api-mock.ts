import { vi } from 'vitest';
import {
  type Branch,
  type MeResponse,
  ONBOARDING_STEPS,
  type OnboardingStatus,
  type OnboardingStepId,
  type Organization,
} from '@app/contracts';
import { jsonResponse } from '@app/web/testing';

export interface ApiCall {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

export type ApiHandler = (call: ApiCall) => Response | undefined;

function parseBody(text: string): unknown {
  if (!text) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function mockApi(handler: ApiHandler) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const contentType = request.headers.get('content-type') ?? '';
    const multipart = contentType.startsWith('multipart/form-data');
    const formData = multipart ? await request.formData() : undefined;
    const text = multipart ? '' : await request.text();
    const call: ApiCall = {
      method: request.method,
      path: url.pathname.replace(/^\/api\/v1/, ''),
      search: url.search,
      body: formData ?? parseBody(text),
    };
    calls.push(call);
    return (
      handler(call) ?? errorResponse(404, 'NOT_FOUND', `No mock for ${call.method} ${call.path}`)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

export function errorResponse(
  statusCode: number,
  code: string,
  message: string,
  details?: { field: string; message: string }[],
): Response {
  return jsonResponse(
    {
      statusCode,
      code,
      message,
      ...(details ? { details } : {}),
      path: '/api/v1/test',
      timestamp: '2026-01-01T00:00:00.000Z',
    },
    statusCode,
  );
}

export const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
export const USER_ID = '22222222-2222-4222-8222-222222222222';

export function meFixture(role: MeResponse['memberships'][number]['role'] = 'OWNER'): MeResponse {
  return {
    user: {
      id: USER_ID,
      email: 'owner@example.pk',
      fullName: 'Ayesha Khan',
      emailVerified: true,
      platformRole: null,
    },
    memberships: [
      {
        membershipId: '33333333-3333-4333-8333-333333333333',
        organizationId: ORGANIZATION_ID,
        organizationName: 'Karachi Grill',
        organizationSlug: 'karachi-grill',
        role,
        branchId: null,
      },
    ],
  };
}

export const BRANCH_ID = '88888888-8888-4888-8888-888888888888';
export const SECOND_ORGANIZATION_ID = '99999999-9999-4999-8999-999999999999';

export function withSecondMembership(me: MeResponse): MeResponse {
  return {
    ...me,
    memberships: [
      ...me.memberships,
      {
        membershipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        organizationId: SECOND_ORGANIZATION_ID,
        organizationName: 'Lahore Tikka House',
        organizationSlug: 'lahore-tikka',
        role: 'MANAGER',
        branchId: null,
      },
    ],
  };
}

export function organizationFixture(overrides: Partial<Organization> = {}): Organization {
  return {
    id: ORGANIZATION_ID,
    slug: 'karachi-grill',
    name: 'Karachi Grill',
    status: 'ACTIVE',
    currency: 'PKR',
    timezone: 'Asia/Karachi',
    contactEmail: null,
    contactPhone: null,
    primaryColor: null,
    logoUrl: null,
    description: null,
    onboardingCompletedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function branchFixture(overrides: Partial<Branch> = {}): Branch {
  return {
    id: BRANCH_ID,
    name: 'Clifton',
    slug: 'clifton',
    status: 'ACTIVE',
    isAcceptingOrders: false,
    phone: '+923001234567',
    addressLine: 'Plot 12, Block 5',
    area: 'Clifton',
    city: 'Karachi',
    deliveryEnabled: false,
    pickupEnabled: false,
    preparationMinutes: 20,
    delivery: null,
    openingHours: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export function onboardingFixture(
  complete: readonly OnboardingStepId[] = ['restaurant'],
  overrides: Partial<OnboardingStatus> = {},
): OnboardingStatus {
  return {
    organizationId: ORGANIZATION_ID,
    completedAt: null,
    primaryBranchId: null,
    steps: ONBOARDING_STEPS.map((id) => ({ id, complete: complete.includes(id) })),
    checks: [],
    canComplete: false,
    ...overrides,
  };
}
