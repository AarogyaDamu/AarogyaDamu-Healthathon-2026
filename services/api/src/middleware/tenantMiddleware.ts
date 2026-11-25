import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';
import { prisma } from '../db/prisma';
import { PracticeRole } from '@aarogyadamu/contracts';
import { updateTenantContext } from '../db/tenantContext';

export interface TenantRequest extends AuthenticatedRequest {
  practiceId?: string;
  practiceRole?: PracticeRole;
}

/**
 * Resolves the authenticated user's active practice and membership role.
 */
export async function resolvePracticeContext(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const user = req.user;
  if (!user?.id) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const membership = await prisma.practiceMembership.findFirst({
      where: {
        userId: user.id,
        isActive: true,
      },
    });

    if (membership) {
      req.practiceId = membership.practiceId;
      req.practiceRole = membership.role as PracticeRole;
      updateTenantContext({
        practiceId: membership.practiceId,
        role: membership.role,
      });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to resolve practice context', details: error.message });
  }
}

/**
 * Enforces that the caller belongs to an active practice.
 */
export async function requirePracticeMembership(
  req: TenantRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.practiceId || !req.practiceRole) {
    res.status(403).json({
      error: 'NO_ACTIVE_PRACTICE',
      message: 'Active practice membership is required to access this resource.',
    });
    return;
  }
  next();
}

/**
 * Enforces role-based access control inside the practice (e.g. blocking receptionists from clinical records).
 */
export function requirePracticeRole(allowedRoles: PracticeRole[]) {
  return (req: TenantRequest, res: Response, next: NextFunction): void => {
    if (!req.practiceRole) {
      res.status(403).json({ error: 'NO_ACTIVE_PRACTICE', message: 'Practice membership required' });
      return;
    }

    if (!allowedRoles.includes(req.practiceRole)) {
      if (req.practiceRole === 'RECEPTIONIST' && !allowedRoles.includes('RECEPTIONIST')) {
        res.status(403).json({
          error: 'CLINICAL_ACCESS_RESTRICTED',
          message: 'Receptionist accounts are restricted from accessing clinical notes, diagnosis, and medical records.',
        });
        return;
      }

      res.status(403).json({
        error: 'INSUFFICIENT_PRACTICE_ROLE',
        message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`,
      });
      return;
    }

    next();
  };
}

