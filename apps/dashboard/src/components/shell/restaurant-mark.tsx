import { Avatar, AvatarFallback, AvatarImage } from '@app/web/ui';
import { cn } from '@/lib/utils';

export function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
  return letters || '?';
}

export function RestaurantMark({
  name,
  logoUrl,
  className,
}: {
  name: string;
  logoUrl?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={cn('size-9 rounded-lg border bg-background', className)}>
      {logoUrl ? <AvatarImage src={logoUrl} alt="" /> : null}
      <AvatarFallback className="rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
