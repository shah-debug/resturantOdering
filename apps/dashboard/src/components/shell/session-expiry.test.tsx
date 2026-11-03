import { jsonResponse, renderWithStore } from '@app/web/testing';
import { waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AuthGate } from '@/components/shell/session';
import { authApi } from '@/features/auth/auth-api';
import { useGetBillingOverviewQuery } from '@/features/billing/billing-api';
import { makeStore } from '@/store/store';
import { errorResponse, meFixture, mockApi, ORGANIZATION_ID } from '@/testing/api-mock';

const navigation = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => navigation,
  usePathname: () => `/organizations/${ORGANIZATION_ID}/billing`,
}));

function BillingProbe() {
  const query = useGetBillingOverviewQuery(ORGANIZATION_ID);
  return <p>{query.isError ? 'failed' : 'loading'}</p>;
}

describe('session expiry', () => {
  it('sends the user to sign in when any request finds the session has expired', async () => {
    let meCalls = 0;
    mockApi((call) => {
      if (call.path === '/auth/me') {
        meCalls += 1;
        return meCalls === 1
          ? jsonResponse(meFixture('OWNER'))
          : errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue');
      }
      if (call.path.endsWith('/billing')) {
        return errorResponse(401, 'UNAUTHENTICATED', 'Sign in to continue');
      }
      return undefined;
    });
    renderWithStore(
      <AuthGate>
        <BillingProbe />
      </AuthGate>,
      makeStore(),
    );
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith(
        expect.stringContaining(
          `/login?next=${encodeURIComponent(`/organizations/${ORGANIZATION_ID}/billing`)}`,
        ),
      ),
    );
    expect(meCalls).toBe(2);
  });

  it('does not treat a wrong password as an expired session', async () => {
    const store = makeStore();
    let meCalls = 0;
    mockApi((call) => {
      if (call.path === '/auth/me') {
        meCalls += 1;
        return jsonResponse(meFixture('OWNER'));
      }
      if (call.path === '/auth/password/change') {
        return errorResponse(401, 'INVALID_CREDENTIALS', 'Current password is incorrect');
      }
      return undefined;
    });
    await store.dispatch(authApi.endpoints.me.initiate());
    await store.dispatch(
      authApi.endpoints.changePassword.initiate({
        currentPassword: 'wrong password',
        newPassword: 'a much longer new password',
      }),
    );
    expect(meCalls).toBe(1);
  });
});
