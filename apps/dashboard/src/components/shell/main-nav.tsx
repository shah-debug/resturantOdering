'use client';

import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@app/web/ui';
import { cn } from '@/lib/utils';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  badge?: { text: string; label: string } | undefined;
}

export function isActivePath(pathname: string, item: Pick<NavItem, 'href' | 'exact'>): boolean {
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function MainNav({
  items,
  onNavigate,
}: {
  items: readonly NavItem[];
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main">
      <ul className="grid gap-1">
        {items.map((item) => {
          const active = isActivePath(pathname, item);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={cn(
                  'relative flex min-h-10 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all duration-200',
                  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  active
                    ? 'bg-accent text-accent-foreground before:absolute before:inset-y-2 before:left-0 before:w-1 before:rounded-full before:bg-primary'
                    : 'text-muted-foreground hover:translate-x-0.5 hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', active ? 'text-primary' : '')}
                  aria-hidden="true"
                />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge ? (
                  <Badge variant="secondary" className="tabular-nums">
                    <span aria-hidden="true">{item.badge.text}</span>
                    <span className="sr-only">{item.badge.label}</span>
                  </Badge>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
