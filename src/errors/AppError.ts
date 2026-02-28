export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  unauthorized: (msg = 'Unauthorized') => new AppError('UNAUTHORIZED', msg, 401),
  forbidden: (msg = 'Forbidden') => new AppError('FORBIDDEN', msg, 403),
  notFound: (msg = 'Not found') => new AppError('NOT_FOUND', msg, 404),
  badRequest: (msg = 'Bad request') => new AppError('BAD_REQUEST', msg, 400),
  conflict: (msg = 'Conflict') => new AppError('CONFLICT', msg, 409),
} as const;
