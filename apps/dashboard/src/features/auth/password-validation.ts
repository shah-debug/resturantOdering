import { passwordSchema } from '@app/contracts';
import type { FieldErrors } from '@/lib/form';

export const PASSWORD_MISMATCH_MESSAGE = 'Passwords do not match';

export function validateNewPassword(password: string, confirmation: string): FieldErrors {
  const errors: FieldErrors = {};
  const result = passwordSchema.safeParse(password);
  if (!result.success) {
    errors.password = result.error.issues[0]?.message ?? 'Enter a valid password';
  }
  if (password !== confirmation) {
    errors.confirmPassword = PASSWORD_MISMATCH_MESSAGE;
  }
  return errors;
}
