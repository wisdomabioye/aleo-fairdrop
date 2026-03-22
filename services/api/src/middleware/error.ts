import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message, code: 'HTTP_ERROR' }, err.status);
  }
  console.error('[api] unhandled error', err);
  return c.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, 500);
};
