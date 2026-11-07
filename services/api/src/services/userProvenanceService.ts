import { PrismaClient } from '@prisma/client';
import { safeClinicalLog } from '../audit/clinicalAuditLogger';

export class ClinicalProvenanceError extends Error {
  public readonly code = 'CLINICAL_PROVENANCE_PROTECTED';
  constructor(message: string) {
    super(message);
    this.name = 'ClinicalProvenanceError';
  }
}

/**
 * Asserts whether a User entity can be physically deleted, or if clinical provenance
 * requires the user to be soft-deleted / deactivated instead.
 */
export async function assertCanSafelyDeleteUser(prisma: PrismaClient, userId: string): Promise<void> {
  const [plansOwnedCount, plansAsPatientCount, auditRecordsCount, carePlansAsDoctorCount, notesAuthoredCount] = await Promise.all([
    prisma.agentPlan.count({ where: { userId } }),
    prisma.agentPlan.count({ where: { targetPatientId: userId } }),
    prisma.agentAuditRecord.count({ where: { userId } }),
    prisma.carePlan.count({ where: { doctorId: userId } }),
    prisma.consultationNote.count({ where: { clinicianId: userId } }),
  ]);

  const totalClinicalRecords =
    plansOwnedCount + plansAsPatientCount + auditRecordsCount + carePlansAsDoctorCount + notesAuthoredCount;

  if (totalClinicalRecords > 0) {
    throw new ClinicalProvenanceError(
      `Cannot hard-delete user '${userId}' because they are referenced by ${totalClinicalRecords} immutable clinical record(s) ` +
      `(${plansOwnedCount} plans owned, ${plansAsPatientCount} patient plans, ${auditRecordsCount} agent audit records, ` +
      `${carePlansAsDoctorCount} care plans as doctor, ${notesAuthoredCount} consultation notes). ` +
      `Under healthcare provenance guidelines (DISHA/HIPAA), clinical records must be retained. Deactivate the user instead using deactivateUser().`
    );
  }
}

/**
 * Soft-deactivates a user while fully preserving all historical clinical plans, actions, and audit records.
 */
export async function deactivateUser(
  prisma: PrismaClient,
  userId: string,
  reason: string = 'User account deactivated'
): Promise<{ success: boolean; userId: string; deactivatedAt: Date }> {
  const deactivatedAt = new Date();

  // 1. Mark user inactive
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: false,
      deactivatedAt,
    },
  });

  // 2. Revoke all active sessions
  await prisma.authSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: deactivatedAt },
  });

  await prisma.refreshToken.updateMany({
    where: { session: { userId }, revokedAt: null },
    data: { revokedAt: deactivatedAt },
  });

  safeClinicalLog('info', 'User account deactivated; clinical audit provenance preserved', {
    userId,
    reason,
    deactivatedAt: deactivatedAt.toISOString(),
  });

  return { success: true, userId, deactivatedAt };
}

/**
 * Reactivates a previously soft-deactivated user.
 */
export async function reactivateUser(
  prisma: PrismaClient,
  userId: string
): Promise<{ success: boolean; userId: string }> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: true,
      deactivatedAt: null,
    },
  });

  safeClinicalLog('info', 'User account reactivated', { userId });
  return { success: true, userId };
}

/**
 * Checks if a user is currently active.
 */
export async function isUserActive(prisma: PrismaClient, userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true },
  });
  return user?.isActive !== false;
}

