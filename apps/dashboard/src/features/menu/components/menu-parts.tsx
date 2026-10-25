'use client';

import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import { ImageOff, Lock } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import type { MembershipRole, ProductStatus } from '@app/contracts';
import { getErrorMessage } from '@app/web/api';
import {
  Alert,
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Input,
} from '@app/web/ui';
import { useMeQuery } from '@/features/auth/auth-api';
import { canManageMenu, ROLE_LABELS } from '@/features/organizations/roles';
import { cn } from '@/lib/utils';

export interface MenuAccess {
  role: MembershipRole | undefined;
  canManage: boolean;
}

export function useMenuAccess(organizationId: string): MenuAccess {
  const { data: me } = useMeQuery();
  const role = me?.memberships.find((entry) => entry.organizationId === organizationId)?.role;
  return { role, canManage: canManageMenu(role) };
}

export function menuBase(organizationId: string): string {
  return `/organizations/${encodeURIComponent(organizationId)}/menu`;
}

export function ProductThumbnail({
  imageUrl,
  className,
}: {
  imageUrl: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted text-muted-foreground',
        className,
      )}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- media may be served from any https origin
        <img src={imageUrl} alt="" loading="lazy" className="size-full object-cover" />
      ) : (
        <ImageOff className="size-5" aria-hidden="true" />
      )}
    </span>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  return status === 'PUBLISHED' ? (
    <Badge variant="success">Published</Badge>
  ) : (
    <Badge variant="secondary">Draft</Badge>
  );
}

export function RupeeInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        Rs
      </span>
      <Input {...props} inputMode="decimal" className={cn('pl-9', className)} />
    </div>
  );
}

export function MenuReadOnlyNotice({ role }: { role: MembershipRole | undefined }) {
  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-lg border bg-muted/50 px-4 py-3 text-sm"
    >
      <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="grid gap-1">
        <p className="font-medium">View only</p>
        <p className="text-muted-foreground">
          {role ? `As ${ROLE_LABELS[role].toLowerCase()}, you can browse` : 'You can browse'} the
          menu, but only owners and managers can change it.
        </p>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pendingLabel,
  pending,
  error,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  pending: boolean;
  error: FetchBaseQueryError | SerializedError | undefined;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <Alert variant="destructive">{getErrorMessage(error)}</Alert> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button
            variant="destructive"
            pending={pending}
            pendingText={pendingLabel}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
