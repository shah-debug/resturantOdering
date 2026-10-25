import { ApiStatus } from '@app/web/system';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-4 px-4 py-12">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Order Online</h1>
      <p className="text-muted-foreground">Browse the menu and order for delivery or pickup.</p>
      <ApiStatus />
    </main>
  );
}
