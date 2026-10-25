import {
  getErrorMessage,
  getFieldErrors,
  NETWORK_ERROR_MESSAGE,
  toApiError,
  UNKNOWN_ERROR_MESSAGE,
} from './api-error';

const envelope = {
  statusCode: 403,
  code: 'FORBIDDEN',
  message: 'You do not have access to this restaurant',
  path: '/api/v1/restaurants/x',
  timestamp: '2026-01-01T00:00:00.000Z',
} as const;

describe('api-error', () => {
  it('extracts the standard envelope from an HTTP error', () => {
    expect(toApiError({ status: 403, data: envelope })).toEqual(envelope);
    expect(getErrorMessage({ status: 403, data: envelope })).toBe(envelope.message);
  });

  it('maps validation details onto field names', () => {
    const validation = {
      ...envelope,
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'Validation failed',
      details: [
        { field: 'email', message: 'Email is taken' },
        { field: 'body.password', message: 'Too short' },
        { field: 'email', message: 'Ignored duplicate' },
      ],
    };
    expect(getFieldErrors({ status: 400, data: validation })).toEqual({
      email: 'Email is taken',
      password: 'Too short',
    });
    expect(getFieldErrors({ status: 403, data: envelope })).toEqual({});
    expect(getFieldErrors(undefined)).toEqual({});
  });

  it('returns a network message for fetch failures', () => {
    expect(getErrorMessage({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' })).toBe(
      NETWORK_ERROR_MESSAGE,
    );
  });

  it('falls back to a generic message for unknown shapes', () => {
    expect(toApiError({ status: 500, data: '<html>bad gateway</html>' })).toBeNull();
    expect(getErrorMessage({ status: 500, data: '<html>bad gateway</html>' })).toBe(
      UNKNOWN_ERROR_MESSAGE,
    );
    expect(getErrorMessage({ message: 'boom' })).toBe(UNKNOWN_ERROR_MESSAGE);
    expect(getErrorMessage(undefined)).toBe(UNKNOWN_ERROR_MESSAGE);
  });
});
