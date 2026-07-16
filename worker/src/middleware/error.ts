import type { ErrorHandler } from 'hono';
import type { AppType } from '../types';
import { fail, errorMessage, ERR } from '../utils/response';
import { ValidationError } from '../utils/validate';

/**
 * Global error handler. Converts thrown errors to the unified envelope.
 * ValidationError -> 422, everything else -> 500 with a safe message.
 */
export const onError: ErrorHandler<AppType> = (err, c) => {
  if (err instanceof ValidationError) {
    return fail(c, 422, ERR.VALIDATION, err.message);
  }
  console.error('[moments] unhandled error:', err);
  return fail(
    c,
    500,
    ERR.INTERNAL,
    errorMessage(err, 'Something went wrong.'),
  );
};
