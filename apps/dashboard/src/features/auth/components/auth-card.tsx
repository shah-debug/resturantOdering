import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@app/web/ui';

export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="grid gap-4">{children}</CardContent>
      {footer ? <CardFooter className="text-sm text-muted-foreground">{footer}</CardFooter> : null}
    </Card>
  );
}

export const textLinkClasses =
  'font-medium text-foreground underline underline-offset-4 hover:text-foreground/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none rounded-sm';
