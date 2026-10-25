'use client';

import { KeyRound, LogOut, MonitorSmartphone } from 'lucide-react';
import Link from 'next/link';
import {
  Avatar,
  AvatarFallback,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@app/web/ui';
import { initials } from './restaurant-mark';
import { useSession } from './session';

export function AccountMenu() {
  const { me, signOut, signingOut } = useSession();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Account menu"
          className="rounded-full"
          disabled={signingOut !== null}
        >
          <Avatar className="size-8">
            <AvatarFallback className="text-xs">{initials(me.user.fullName)}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="grid gap-0.5 font-normal">
          <span className="truncate text-sm font-medium">{me.user.fullName}</span>
          <span className="truncate text-xs text-muted-foreground">{me.user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account/password">
            <KeyRound aria-hidden="true" />
            Change password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut('current')}>
          <LogOut aria-hidden="true" />
          Sign out
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={() => void signOut('all')}>
          <MonitorSmartphone aria-hidden="true" />
          Sign out of all devices
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
