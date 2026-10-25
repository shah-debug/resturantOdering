import type { Metadata } from 'next';
import { SignupForm } from '@/features/auth';

export const metadata: Metadata = { title: 'Create account' };

export default function SignupPage() {
  return <SignupForm />;
}
