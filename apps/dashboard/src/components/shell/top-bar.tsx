'use client';

import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import {
  Alert,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@app/web/ui';
import { AccountMenu } from './account-menu';
import { useSession } from './session';

export interface Crumb {
  label: string;
  href?: string;
}

export function AppBreadcrumbs({ items }: { items: readonly Crumb[] }) {
  if (items.length === 0) {
    return null;
  }
  return (
    <Breadcrumb className="min-w-0">
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 ? <BreadcrumbSeparator /> : null}
              <BreadcrumbItem className={last ? 'min-w-0' : 'hidden min-w-0 sm:inline-flex'}>
                {last || !item.href ? (
                  <BreadcrumbPage>{item.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={item.href}>{item.label}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export function TopBar({
  leading,
  breadcrumbs,
  actions,
}: {
  leading?: ReactNode;
  breadcrumbs: readonly Crumb[];
  actions?: ReactNode;
}) {
  const { signingOut, signOutError } = useSession();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="flex h-14 items-center gap-2 px-4 sm:px-6 lg:px-8">
        {leading}
        <div className="min-w-0 flex-1">
          <AppBreadcrumbs items={breadcrumbs} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <AccountMenu />
        </div>
      </div>
      {signingOut ? (
        <p role="status" aria-live="polite" className="px-4 pb-2 text-sm text-muted-foreground">
          {signingOut === 'all' ? 'Signing out of all devices…' : 'Signing out…'}
        </p>
      ) : null}
      {signOutError ? (
        <div className="px-4 pb-3 sm:px-6 lg:px-8">
          <Alert variant="destructive" title="We couldn't sign you out">
            {signOutError}
          </Alert>
        </div>
      ) : null}
    </header>
  );
}
