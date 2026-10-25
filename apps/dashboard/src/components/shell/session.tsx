'use client';

import { usePathname, useRouter } from 'next/navigation';
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import type { MeResponse } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import { ErrorState, LoadingState } from '@/components/states';
import { useLogoutAllMutation, useLogoutMutation, useMeQuery } from '@/features/auth/auth-api';
import { dashboardApi, hasHttpStatus } from '@/lib/api';
import { buildLoginPath } from '@/lib/auth-redirect';
import { useAppDispatch } from '@/store/hooks';

export type SignOutScope = 'current' | 'all';

export interface Session {
  me: MeResponse;
  signOut: (scope: SignOutScope) => Promise<void>;
  signingOut: SignOutScope | null;
  signOutError: string | null;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) {
    throw new Error('useSession must be used inside <AuthGate>');
  }
  return session;
}

function FullPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-lg content-center p-4">{children}</main>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { data: me, error, isLoading, isFetching, refetch } = useMeQuery();
  const [logout] = useLogoutMutation();
  const [logoutAll] = useLogoutAllMutation();
  const [signingOut, setSigningOut] = useState<SignOutScope | null>(null);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signingOutRef = useRef(false);
  const unauthenticated = hasHttpStatus(error, 401);

  useEffect(() => {
    if (unauthenticated && !signingOutRef.current) {
      router.replace(buildLoginPath(`${pathname}${window.location.search}`));
    }
  }, [unauthenticated, pathname, router]);

  async function signOut(scope: SignOutScope) {
    signingOutRef.current = true;
    setSigningOut(scope);
    setSignOutError(null);
    const response = scope === 'all' ? await logoutAll() : await logout();
    if ('error' in response) {
      signingOutRef.current = false;
      setSigningOut(null);
      setSignOutError(getErrorMessage(response.error));
      return;
    }
    router.replace('/login');
    dispatch(dashboardApi.util.resetApiState());
  }

  if (isLoading || unauthenticated) {
    return (
      <FullPage>
        {unauthenticated ? (
          <p role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">
            Redirecting to sign in…
          </p>
        ) : (
          <LoadingState label="Loading your account…" rows={2} />
        )}
      </FullPage>
    );
  }

  if (!me) {
    return (
      <FullPage>
        <ErrorState
          title="We couldn't load your account"
          error={error}
          onRetry={() => void refetch()}
          retrying={isFetching}
        />
      </FullPage>
    );
  }

  return (
    <SessionContext value={{ me, signOut, signingOut, signOutError }}>{children}</SessionContext>
  );
}
