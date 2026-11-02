import { Request } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type RequiredPermission =
  | 'VIEW_OBSERVATIONS'
  | 'MANAGE_OBSERVATIONS'
  | 'VIEW_TASKS'
  | 'MANAGE_TASKS'
  | 'VIEW_CONSULTATIONS'
  | 'MANAGE_CONSULTATIONS'
  | 'VIEW_DOCUMENTS'
  | 'MANAGE_DOCUMENTS'
  | 'SHARE_RECORDS'
  | 'VIEW_CARE_PLAN'
  | 'MANAGE_CARE_PLAN';

export class AuthorizationError extends Error {
  status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export async function resolvePatientContext(
  req: Request,
  permission: RequiredPermission
): Promise<{ effectivePatientId: string; isDelegated: boolean }> {
  const authenticatedUserId = (req as any).user?.id;
  if (!authenticatedUserId) {
    const err = new Error('Authentication required');
    (err as any).status = 401;
    throw err;
  }

  const targetPatientId = req.headers['x-target-patient-id'] as string | undefined;

  // Direct access to the patient's own master record
  if (!targetPatientId || targetPatientId === authenticatedUserId) {
    return { effectivePatientId: authenticatedUserId, isDelegated: false };
  }

  // Delegated access check via active consent
  const authenticatedUser = await prisma.user.findUnique({
    where: { id: authenticatedUserId },
    select: { email: true },
  });

  if (!authenticatedUser) {
    throw new AuthorizationError('Authenticated user record not found');
  }

  const consent = await prisma.caregiverConsent.findFirst({
    where: {
      patientId: targetPatientId,
      caregiverEmail: authenticatedUser.email,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!consent) {
    throw new AuthorizationError(
      `Forbidden: Access denied: No active caregiver consent from patient ${targetPatientId}`
    );
  }

  const grantedPermissions: string[] = JSON.parse(consent.permissions || '[]');

  const hasPermission =
    grantedPermissions.includes(permission) ||
    (permission.startsWith('VIEW_') && grantedPermissions.includes(permission.replace('VIEW_', 'MANAGE_'))) ||
    (permission === 'VIEW_CARE_PLAN' && (grantedPermissions.includes('VIEW_TASKS') || grantedPermissions.includes('MANAGE_TASKS')));

  if (!hasPermission) {
    throw new AuthorizationError(`Forbidden: Caregiver grant does not include permission [${permission}]`);
  }

  return { effectivePatientId: targetPatientId, isDelegated: true };
}