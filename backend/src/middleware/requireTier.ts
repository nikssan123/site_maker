import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

const TIER_ORDER = ['free', 'pro', 'max'];

export function requireTier(min: 'pro' | 'max') {
  return (req: Request, _res: Response, next: NextFunction) => {
    const userTierIndex = TIER_ORDER.indexOf(req.user.tier);
    const minTierIndex = TIER_ORDER.indexOf(min);
    if (userTierIndex < minTierIndex) {
      return next(
        new AppError(402, 'Upgrade required', 'upgrade_required'),
      );
    }
    return next();
  };
}
