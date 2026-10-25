import { vi } from 'vitest';
import type { MeResponse } from '@app/contracts';
import { jsonResponse } from '@app/web/testing';

export interface ApiCall {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

export type ApiHandler = (call: ApiCall) => Response | undefined;

export function mockApi(handler: ApiHandler) {
  const calls: ApiCall[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const text = await request.text();
    const call: ApiCall = {
      method: request.method,
      path: url.pathname.replace(/^\/api\/v1/, ''),
      search: url.search,
      body: text ? (JSON.parse(text) as unknown) : undefined,
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
