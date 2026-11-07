import { Request } from 'express';
import { prisma } from '../db/prisma';

export type RequiredPermission =
  | 'VIEW_OBSERVATIONS'
  | 'VIEW_HEALTH_SUMMARY'
  | 'MANAGE_OBSERVATIONS'
  | 'VIEW_TASKS'
  | 'MANAGE_TASKS'
  | 'COMPLETE_TASKS_ON_BEHALF'
  | 'VIEW_CONSULTATIONS'
  | 'VIEW_APPOINTMENTS'
  | 'MANAGE_CONSULTATIONS'
  | 'VIEW_DOCUMENTS'
  | 'VIEW_REPORTS'
  | 'MANAGE_DOCUMENTS'
  | 'SHARE_RECORDS'
  | 'VIEW_CARE_PLAN'
  | 'VIEW_HEALTH_TIMELINE'
  | 'MANAGE_CARE_PLAN'
  | 'VIEW_MEDICATIONS'
  | 'VIEW_MEDICATION_ADHERENCE'
  | 'MANAGE_MEDICATIONS'
  | 'LOG_ADHERENCE'
  | 'VIEW_LIFESTYLE'
  | 'MANAGE_LIFESTYLE'
  | 'VIEW_NOTIFICATIONS'
  | 'VIEW_REMINDERS'
  | 'MANAGE_REMINDERS'
  | 'VIEW_EMERGENCY'
  | 'MANAGE_EMERGENCY'
  | 'RECEIVE_ALERTS'
  | 'LOG_ON_BEHALF';

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

  // Delegated access check via active consent or doctor assignment
  const authenticatedUser = await prisma.user.findUnique({
    where: { id: authenticatedUserId },
    select: { email: true, isClinician: true },
  });

  if (!authenticatedUser) {
    throw new AuthorizationError('Authenticated user record not found');
  }

  if (authenticatedUser.isClinician) {
    const assignment = await prisma.doctorPatientAssignment.findUnique({
      where: {
        doctorId_patientId: {
          doctorId: authenticatedUserId,
          patientId: targetPatientId,
        },
      },
    });

    if (assignment && assignment.status === 'ACTIVE') {
      return { effectivePatientId: targetPatientId, isDelegated: true };
    }
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

  let grantedPermissions: string[] = [];
  try {
    const parsed = JSON.parse(consent.permissions || '[]');
    grantedPermissions = Array.isArray(parsed) ? parsed : [];
  } catch {
    grantedPermissions = [];
  }

  const hasPermission =
    grantedPermissions.includes(permission) ||
    // Task completion equivalence
    (permission === 'COMPLETE_TASKS_ON_BEHALF' && (grantedPermissions.includes('COMPLETE_TASKS_ON_BEHALF') || grantedPermissions.includes('MANAGE_TASKS'))) ||
    // Task view equivalence
    (permission === 'VIEW_TASKS' && (grantedPermissions.includes('VIEW_TASKS') || grantedPermissions.includes('COMPLETE_TASKS_ON_BEHALF') || grantedPermissions.includes('MANAGE_TASKS'))) ||
    // Health summary / observation equivalence
    ((permission === 'VIEW_HEALTH_SUMMARY' || permission === 'VIEW_OBSERVATIONS') &&
      (grantedPermissions.includes('VIEW_HEALTH_SUMMARY') || grantedPermissions.includes('VIEW_OBSERVATIONS') || grantedPermissions.includes('MANAGE_OBSERVATIONS'))) ||
    // Medication adherence equivalence
    (permission === 'VIEW_MEDICATION_ADHERENCE' &&
      (grantedPermissions.includes('VIEW_MEDICATION_ADHERENCE') || grantedPermissions.includes('MANAGE_MEDICATIONS'))) ||
    // Medication view equivalence
    (permission === 'VIEW_MEDICATIONS' &&
      (grantedPermissions.includes('VIEW_MEDICATIONS') || grantedPermissions.includes('MANAGE_MEDICATIONS'))) ||
    // Appointments equivalence
    ((permission === 'VIEW_APPOINTMENTS' || permission === 'VIEW_CONSULTATIONS') &&
      (grantedPermissions.includes('VIEW_APPOINTMENTS') || grantedPermissions.includes('VIEW_CONSULTATIONS') || grantedPermissions.includes('MANAGE_CONSULTATIONS'))) ||
    // Reports / documents equivalence
    ((permission === 'VIEW_REPORTS' || permission === 'VIEW_DOCUMENTS') &&
      (grantedPermissions.includes('VIEW_REPORTS') || grantedPermissions.includes('VIEW_DOCUMENTS') || grantedPermissions.includes('MANAGE_DOCUMENTS'))) ||
    // Health timeline / care plan equivalence
    ((permission === 'VIEW_HEALTH_TIMELINE' || permission === 'VIEW_CARE_PLAN') &&
      (grantedPermissions.includes('VIEW_HEALTH_TIMELINE') || grantedPermissions.includes('VIEW_CARE_PLAN') || grantedPermissions.includes('MANAGE_CARE_PLAN'))) ||
    // General VIEW_ to MANAGE_ mapping
    (permission.startsWith('VIEW_') && grantedPermissions.includes(permission.replace('VIEW_', 'MANAGE_')));

  if (!hasPermission) {
    throw new AuthorizationError(`Forbidden: Caregiver grant does not include permission [${permission}]`);
  }

  // Record access timestamp for patient visibility
  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  return { effectivePatientId: targetPatientId, isDelegated: true };
}
