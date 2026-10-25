import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { StoreProvider } from '@/store/store-provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Restaurant Dashboard',
    template: '%s · Restaurant Dashboard',
  },
  description: 'Manage your restaurant, menu, orders and riders.',
  robots: { index: false, follow: false },
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
