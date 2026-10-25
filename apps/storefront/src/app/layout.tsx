import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { StoreProvider } from '@/store/store-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Order Online',
    template: '%s · Order Online',
  },
  description: 'Order food online for delivery or pickup.',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  await connection();

  return (
    <html lang="en">
      <body className="min-h-dvh">
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
