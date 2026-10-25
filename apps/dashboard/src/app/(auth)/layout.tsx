import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 p-4">
      <Link
        href="/"
        className="self-center rounded-sm text-lg font-semibold tracking-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Restaurant Dashboard
      </Link>
      {children}
    </main>
  );
}
