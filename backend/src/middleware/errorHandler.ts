import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
    });
  }
  if (err instanceof ZodError) {
    const msg = err.errors[0]?.message ?? 'Invalid input';
    return res.status(400).json({ error: msg });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}
