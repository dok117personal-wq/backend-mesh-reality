import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/AppError.js';
import { apiError } from '../types/api.js';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json(apiError(err.code, err.message));
    return;
  }
  if (err instanceof ZodError) {
    const msg = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    res.status(400).json(apiError('VALIDATION', msg));
    return;
  }
  const payloadErr = err as { statusCode?: number; type?: string };
  if (payloadErr.statusCode === 413 || payloadErr.type === 'entity.too.large') {
    res.status(413).json(apiError('PAYLOAD_TOO_LARGE', 'Request body is too large. Max 200MB.'));
    return;
  }
  const msg = err instanceof Error ? err.message : 'Internal server error';
  console.error('Unhandled error (500):', err);
  res.status(500).json(apiError('INTERNAL', process.env.NODE_ENV === 'development' ? msg : 'Internal server error'));
}
