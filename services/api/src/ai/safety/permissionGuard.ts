import { CaregiverPermissionEnum } from '@aarogyadamu/contracts';
import { z } from 'zod';
import { prisma } from '../../db/prisma';
type CaregiverPermission = z.infer<typeof CaregiverPermissionEnum>;

export interface PermissionCheckParams {
  actorId: string;
  patientId: string;
  requiredPermission?: CaregiverPermission | string;
}

export interface PermissionCheckResult {
  allowed: boolean;
  actorRole: 'PATIENT' | 'CAREGIVER' | 'CLINICIAN' | 'ADMIN' | 'UNAUTHORIZED';
  reason?: string;
}

export async function verifyAgentPermission(params: PermissionCheckParams): Promise<PermissionCheckResult> {
  const { actorId, patientId, requiredPermission } = params;

  // 1. Direct Patient Access
  if (actorId === patientId) {
    return {
      allowed: true,
      actorRole: 'PATIENT',
    };
  }

  // 2. Fetch Actor Profile
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { id: true, email: true, isClinician: true },
  });

  if (!actor) {
    return {
      allowed: false,
      actorRole: 'UNAUTHORIZED',
      reason: 'Actor user record not found.',
    };
  }

  // 3. Clinician Access
  if (actor.isClinician) {
    return {
      allowed: true,
      actorRole: 'CLINICIAN',
    };
  }

  // 4. Caregiver Consent Verification
  const activeConsent = await prisma.caregiverConsent.findFirst({
    where: {
      patientId,
      caregiverEmail: actor.email,
      status: 'ACTIVE',
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
  });

  if (!activeConsent) {
    return {
      allowed: false,
      actorRole: 'CAREGIVER',
      reason: `No active caregiver consent granted by patient ${patientId} to ${actor.email}.`,
    };
  }

  // If a specific granular permission is required, verify it is included in consent
  if (requiredPermission) {
    let grantedPermissions: string[] = [];
    try {
      grantedPermissions = JSON.parse(activeConsent.permissions);
    } catch {
      grantedPermissions = [activeConsent.permissions];
    }

    if (!grantedPermissions.includes(requiredPermission)) {
      return {
        allowed: false,
        actorRole: 'CAREGIVER',
        reason: `Caregiver lacks specific permission scope '${requiredPermission}'. Granted scopes: [${grantedPermissions.join(', ')}]`,
      };
    }
  }

  return {
    allowed: true,
    actorRole: 'CAREGIVER',
  };
}

