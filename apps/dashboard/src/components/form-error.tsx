import type { SerializedError } from '@reduxjs/toolkit';
import type { FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { ReactNode } from 'react';
import { getErrorMessage } from '@app/web/api';
import { Alert } from '@app/web/ui';

export function FormError({
  error,
  children,
}: {
  error: FetchBaseQueryError | SerializedError | undefined;
  children?: ReactNode;
}) {
  if (!error) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <p>{getErrorMessage(error)}</p>
      {children}
    </Alert>
  );
}
