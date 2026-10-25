'use client';

import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { getErrorMessage } from '@app/web/api';
import { Alert, Button, buttonVariants, Select } from '@app/web/ui';
import { useLogoutMutation, useMeQuery } from '@/features/auth/auth-api';
import { dashboardApi, hasHttpStatus } from '@/lib/api';
import { buildLoginPath } from '@/lib/auth-redirect';
import { useAppDispatch } from '@/store/hooks';

function FullPageStatus({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh max-w-lg content-center gap-4 px-4 py-12">
      {children}
    </main>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ organizationId?: string }>();
  const dispatch = useAppDispatch();
  const { data: me, error, isLoading, isFetching, refetch } = useMeQuery();
  const [logout, { isLoading: isSigningOut }] = useLogoutMutation();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const signingOut = useRef(false);
  const unauthenticated = hasHttpStatus(error, 401);

  useEffect(() => {
    if (unauthenticated && !signingOut.current) {
      router.replace(buildLoginPath(`${pathname}${window.location.search}`));
    }
  }, [unauthenticated, pathname, router]);

  async function handleLogout() {
    signingOut.current = true;
    setLogoutError(null);
    const response = await logout();
    if ('error' in response) {
      signingOut.current = false;
      setLogoutError(getErrorMessage(response.error));
      return;
    }
    router.replace('/login');
    dispatch(dashboardApi.util.resetApiState());
  }

  if (isLoading || unauthenticated) {
    return (
      <FullPageStatus>
        <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">
          {unauthenticated ? 'Redirecting to sign in…' : 'Loading your account…'}
        </p>
      </FullPageStatus>
    );
  }

  if (!me) {
    return (
      <FullPageStatus>
        <Alert variant="destructive" title="We couldn't load your account">
          <p>{getErrorMessage(error)}</p>
        </Alert>
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => void refetch()}
          pending={isFetching}
          pendingText="Retrying…"
        >
          Retry
        </Button>
      </FullPageStatus>
    );
  }

  const currentOrganizationId = params.organizationId ?? '';

  return (
    <div className="min-h-dvh">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
          <Link
            href="/"
            className="rounded-sm font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            Restaurant Dashboard
          </Link>
          {me.memberships.length > 0 ? (
            <Select
              aria-label="Switch organization"
              className="h-9 w-auto max-w-full min-w-44 flex-1 sm:flex-none"
              value={currentOrganizationId}
              onChange={(event) => {
                const organizationId = event.target.value;
                router.push(organizationId ? `/organizations/${organizationId}/members` : '/');
              }}
            >
              <option value="">All organizations</option>
              {me.memberships.map((membership) => (
                <option key={membership.membershipId} value={membership.organizationId}>
                  {membership.organizationName}
                </option>
              ))}
            </Select>
          ) : null}
          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <span className="mr-auto truncate text-sm text-muted-foreground sm:mr-2">
              {me.user.fullName}
            </span>
            <Link
              href="/account/password"
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Change password
            </Link>
            <Button
              variant="outline"
              size="sm"
              pending={isSigningOut}
              pendingText="Signing out…"
              onClick={() => void handleLogout()}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {logoutError ? (
          <Alert variant="destructive" className="mb-4">
            {logoutError}
          </Alert>
        ) : null}
        {children}
      </main>
    </div>
  );
}
