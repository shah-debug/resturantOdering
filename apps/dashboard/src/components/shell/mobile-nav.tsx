'use client';

import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Button, Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@app/web/ui';
import { MainNav, type NavItem } from './main-nav';
import { RestaurantMark } from './restaurant-mark';

export function MobileNav({
  items,
  restaurantName,
  logoUrl,
}: {
  items: readonly NavItem[];
  restaurantName: string;
  logoUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open navigation" className="md:hidden">
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" aria-describedby={undefined} closeLabel="Close navigation">
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-3 pr-8">
            <RestaurantMark name={restaurantName} logoUrl={logoUrl} />
            <span className="truncate">{restaurantName}</span>
          </SheetTitle>
        </SheetHeader>
        <div className="px-3">
          <MainNav items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
