import { ApiStatus } from '@app/web/system';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Restaurant Dashboard</h1>
      <p className="text-muted-foreground">Manage your menu, orders and riders from one place.</p>
      <ApiStatus />
    </main>
  );
}
