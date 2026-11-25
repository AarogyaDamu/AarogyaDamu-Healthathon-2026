import { prisma } from '../../server';
import {
  AgentToolName,
  AgentActorRole,
  evaluateAgentOwnershipAndPermission,
  AgentOwnershipPermissionResult,
} from '@aarogyadamu/contracts';

export interface AuthorizeAgentActionParams {
  actorId: string;
  targetPatientId: string;
  actorRole: AgentActorRole;
  toolName: AgentToolName;
  referenceTime?: Date;
}

/**
 * Validates agent action authorization against patient ownership,
 * active clinician assignments (SEC-P0.7-03), and granular caregiver consents (SEC-P0.7-04).
 */
export async function authorizeAgentAction(
  params: AuthorizeAgentActionParams,
): Promise<AgentOwnershipPermissionResult> {
  const { actorId, targetPatientId, actorRole, toolName, referenceTime = new Date() } = params;

  // 0. Provenance check: verify actor and target patient are active accounts
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { isActive: true },
  });
  if (actor && actor.isActive === false) {
    return {
      authorized: false,
      reason: 'Actor account has been deactivated.',
    };
  }

  if (targetPatientId !== actorId) {
    const targetPatient = await prisma.user.findUnique({
      where: { id: targetPatientId },
      select: { isActive: true },
    });
    if (targetPatient && targetPatient.isActive === false) {
      return {
        authorized: false,
        reason: 'Target patient account has been deactivated.',
      };
    }
  }

  // 1. Direct Patient Self-Access (Ownership verified)
  if (actorId === targetPatientId) {
    return evaluateAgentOwnershipAndPermission({
      actorId,
      targetPatientId,
      actorRole,
      toolName,
      referenceTime,
    });
  }

  // 2. Patient attempting cross-patient access (Strictly prohibited)
  if (actorRole === 'PATIENT') {
    return evaluateAgentOwnershipAndPermission({
      actorId,
      targetPatientId,
      actorRole,
      toolName,
      referenceTime,
    });
  }

  // 3. Clinician & Doctor Access: verify active DoctorPatientAssignment or CareTeam
  if (actorRole === 'CLINICIAN' || (actorRole as string) === 'DOCTOR') {
    const assignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        doctorId: actorId,
        patientId: targetPatientId,
        status: 'ACTIVE',
      },
    });
    const careTeamDoc = await prisma.patientCareTeamMember.findFirst({
      where: {
        userId: actorId,
        patientId: targetPatientId,
        role: 'DOCTOR',
        status: 'ACTIVE',
      },
    });

    return evaluateAgentOwnershipAndPermission({
      actorId,
      targetPatientId,
      actorRole: 'CLINICIAN',
      toolName,
      hasActiveDoctorAssignment: Boolean(assignment || careTeamDoc),
      referenceTime,
    });
  }

  // 3.1 Nurse Access: verify active PatientCareTeamMember
  if ((actorRole as string) === 'NURSE') {
    const careTeamNurse = await prisma.patientCareTeamMember.findFirst({
      where: {
        userId: actorId,
        patientId: targetPatientId,
        role: 'NURSE',
        status: 'ACTIVE',
      },
    });

    return evaluateAgentOwnershipAndPermission({
      actorId,
      targetPatientId,
      actorRole: 'NURSE' as any,
      toolName,
      hasActiveDoctorAssignment: Boolean(careTeamNurse),
      referenceTime,
    });
  }

  // 4. Caregiver Access: verify active consent and specific permissions
  if (actorRole === 'CAREGIVER') {
    const caregiverUser = await prisma.user.findUnique({
      where: { id: actorId },
      select: { email: true },
    });

    if (!caregiverUser) {
      return {
        authorized: false,
        errorCode: 'UNAUTHORIZED_ACTOR_ROLE',
        reason: `Caregiver user with ID '${actorId}' was not found.`,
      };
    }

    const consent = await prisma.caregiverConsent.findFirst({
      where: {
        patientId: targetPatientId,
        caregiverEmail: caregiverUser.email,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: referenceTime } }],
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!consent) {
      return evaluateAgentOwnershipAndPermission({
        actorId,
        targetPatientId,
        actorRole,
        toolName,
        consentActive: false,
        caregiverPermissions: [],
        referenceTime,
      });
    }

    let parsedPermissions: any[] = [];
    try {
      parsedPermissions = JSON.parse(consent.permissions || '[]');
    } catch {
      parsedPermissions = [];
    }

    return evaluateAgentOwnershipAndPermission({
      actorId,
      targetPatientId,
      actorRole,
      toolName,
      consentActive: consent.status === 'ACTIVE',
      consentExpiresAt: consent.expiresAt,
      caregiverPermissions: parsedPermissions,
      referenceTime,
    });
  }

  // 5. Admin or other roles (Admin cannot perform clinical/agent actions)
  return evaluateAgentOwnershipAndPermission({
    actorId,
    targetPatientId,
    actorRole,
    toolName,
    referenceTime,
  });
}

