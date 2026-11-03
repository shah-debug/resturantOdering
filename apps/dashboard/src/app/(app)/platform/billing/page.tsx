import type { Metadata } from 'next';
import { PaymentsReviewPage } from '@/features/platform';

export const metadata: Metadata = { title: 'Payments · Platform' };

export default function PlatformBillingPage() {
  return <PaymentsReviewPage />;
}
