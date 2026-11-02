import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

export function requireClinician(req: Request, res: Response, next: NextFunction): void {
  const user = (req as AuthenticatedRequest).user;
  if (!user?.isClinician) {
    res.status(403).json({ error: 'An authorized clinician account is required.' });
    return;
  }
  next();
}
