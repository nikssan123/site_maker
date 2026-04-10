import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user?.isAdmin) {
    return next(new AppError(403, 'Admin access required'));
  }
  return next();
}
