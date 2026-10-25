import type { Metadata } from 'next';
import { OrganizationsHome } from '@/features/organizations';

export const metadata: Metadata = { title: 'Organizations' };

export default function HomePage() {
  return <OrganizationsHome />;
}
