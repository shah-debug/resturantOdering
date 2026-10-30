import type { Metadata } from 'next';
import { RestaurantsPage } from '@/features/platform';

export const metadata: Metadata = { title: 'Restaurants · Platform' };

export default function PlatformRestaurantsPage() {
  return <RestaurantsPage />;
}
