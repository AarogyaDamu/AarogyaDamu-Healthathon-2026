import { prisma } from '../db/prisma';
import { runWithTenantContext } from '../db/tenantContext';
import { CareTeamRole, CareTeamMember } from '@aarogyadamu/contracts';

export class CareTeamService {
  /**
   * Retrieves all multidisciplinary care team members for a patient.
   */
  static async getCareTeam(patientId: string): Promise<CareTeamMember[]> {
    // 1. Get explicit team members from PatientCareTeamMember
    const teamMembers = await prisma.patientCareTeamMember.findMany({
      where: { patientId, status: 'ACTIVE' },
      include: {
        clinician: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        assignedBy: {
          select: {
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    const members: CareTeamMember[] = teamMembers.map((m) => ({
      id: m.id,
      patientId: m.patientId,
      userId: m.userId,
      role: m.role as CareTeamRole,
      fullName: m.clinician.profile?.fullName || m.clinician.email,
      email: m.clinician.email,
      practiceId: m.practiceId,
      assignedByDoctorName: m.assignedBy?.profile?.fullName || null,
      status: 'ACTIVE',
      createdAt: m.createdAt.toISOString(),
    }));

    // 2. Also ensure assigned primary doctor is included
    const doctorAssignments = await prisma.doctorPatientAssignment.findMany({
      where: { patientId, status: 'ACTIVE' },
      include: {
        doctor: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    for (const a of doctorAssignments) {
      if (!members.some((m) => m.userId === a.doctorId)) {
        members.unshift({
          id: a.id,
          patientId: a.patientId,
          userId: a.doctorId,
          role: 'DOCTOR',
          fullName: a.doctor.profile?.fullName || a.doctor.email,
          email: a.doctor.email,
          practiceId: null,
          assignedByDoctorName: 'Primary Attending Physician',
          status: 'ACTIVE',
          createdAt: a.createdAt.toISOString(),
        });
      }
    }

    // 3. Include active authorized caregivers
    const consents = await prisma.caregiverConsent.findMany({
      where: {
        patientId,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });

    for (const c of consents) {
      members.push({
        id: c.id,
        patientId: c.patientId,
        userId: c.id,
        role: 'CAREGIVER',
        fullName: c.caregiverName || c.caregiverEmail,
        email: c.caregiverEmail,
        practiceId: null,
        assignedByDoctorName: `Family/Caregiver (${c.relationship})`,
        status: 'ACTIVE',
        createdAt: c.createdAt.toISOString(),
      });
    }

    return members;
  }

  /**
   * Adds an authorized staff member (Nurse, Diabetes Educator) to a patient's care team.
   */
  static async addMember(
    patientId: string,
    assignedById: string,
    role: 'NURSE' | 'DIABETES_EDUCATOR' | 'CARE_COORDINATOR' | 'DOCTOR',
    targetUserId?: string,
    targetEmail?: string,
  ): Promise<any> {
    let user;
    if (targetUserId) {
      user = await prisma.user.findUnique({ where: { id: targetUserId } });
    } else if (targetEmail) {
      user = await prisma.user.findUnique({ where: { email: targetEmail.trim().toLowerCase() } });
    }

    if (!user) {
      if (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production') {
        throw new Error('Clinician account not found. Provision clinicians through an approved invitation before adding them to the care team.');
      }

      // For local development synthetic pilot only, auto-provision demo care team user when missing
      const email = targetEmail || `${role.toLowerCase()}@aarogyadamu.local`;
      const name = role === 'NURSE' ? 'Nurse Priya Sharma' : 'Educator Ananya Rao (CDE)';
      const fallbackPassword = process.env.PILOT_NURSE_PASSWORD || 'PilotDoctor2026!';
      const bcrypt = await import('bcryptjs');
      const passwordHash = await bcrypt.default.hash(fallbackPassword, 10);
      user = await runWithTenantContext({ isSystemWorker: true, workerScope: 'DEMO_WORKER' }, async () => {
        return prisma.user.create({
          data: {
            email,
            passwordHash,
            isClinician: true,
            isSyntheticDemo: true,
            profile: {
              create: {
                fullName: name,
                diabetesType: 'NONE',
                diagnosisYear: 2020,
                primaryClinician: 'AarogyaDamu Clinical Team',
              },
            },
          },
        });
      });
    }

    // Get practice of assigning doctor
    const practiceMembership = await prisma.practiceMembership.findFirst({
      where: { userId: assignedById, isActive: true },
    });

    const member = await prisma.patientCareTeamMember.upsert({
      where: {
        patientId_userId: {
          patientId,
          userId: user.id,
        },
      },
      create: {
        patientId,
        userId: user.id,
        role,
        practiceId: practiceMembership?.practiceId || null,
        assignedById,
        status: 'ACTIVE',
      },
      update: {
        role,
        status: 'ACTIVE',
        assignedById,
      },
      include: {
        clinician: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    return member;
  }

  /**
   * Deactivates or removes a care team member.
   */
  static async removeMember(patientId: string, memberId: string): Promise<void> {
    await prisma.patientCareTeamMember.updateMany({
      where: {
        patientId,
        id: memberId,
      },
      data: { status: 'INACTIVE' },
    });
  }
}

