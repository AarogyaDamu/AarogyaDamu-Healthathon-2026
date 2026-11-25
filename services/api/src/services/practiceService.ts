import { prisma } from '../db/prisma';
import { DoctorOnboardingInput, PracticeRole } from '@aarogyadamu/contracts';

export class PracticeService {
  /**
   * Retrieves active practice profile and membership for an authenticated user.
   */
  static async getDoctorPractice(userId: string) {
    const membership = await prisma.practiceMembership.findFirst({
      where: { userId, isActive: true },
      include: {
        practice: {
          include: {
            _count: {
              select: { memberships: { where: { isActive: true } } },
            },
          },
        },
      },
    });

    if (!membership) {
      return null;
    }

    return {
      membershipId: membership.id,
      role: membership.role as PracticeRole,
      practice: membership.practice,
      activeStaffCount: membership.practice._count.memberships,
    };
  }

  /**
   * Onboards a clinician and creates the practice and owner membership.
   */
  static async onboardPractice(userId: string, input: DoctorOnboardingInput) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isClinician: true, email: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Verify user doesn't already own an active practice
    const existingMembership = await prisma.practiceMembership.findFirst({
      where: { userId, role: 'OWNER', isActive: true },
    });

    if (existingMembership) {
      throw new Error('User is already registered as an owner of an active practice');
    }

    // Ensure user is marked as clinician
    if (!user.isClinician) {
      await prisma.user.update({
        where: { id: userId },
        data: { isClinician: true },
      });
    }

    const slugBase = input.practiceName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'clinic';
    const slug = `${slugBase}-${Math.random().toString(36).substring(2, 7)}`;

    const result = await prisma.$transaction(async (tx) => {
      const practice = await tx.practice.create({
        data: {
          name: input.practiceName,
          slug,
          registrationNumber: input.registrationNumber,
          council: input.council,
          specialty: input.specialty,
          qualifications: input.qualifications,
          address: input.address,
          city: input.city,
          state: input.state,
          postalCode: input.postalCode,
          phone: input.phone,
          consultationFeeInr: input.consultationFeeInr,
          workingDays: input.workingDays.join(','),
          workingHoursJson: input.workingHours ? JSON.stringify(input.workingHours) : null,
        },
      });

      const membership = await tx.practiceMembership.create({
        data: {
          practiceId: practice.id,
          userId,
          role: 'OWNER',
          isActive: true,
        },
      });

      return { practice, membership };
    });

    return result;
  }

  /**
   * Updates practice profile details. Caller must have OWNER or DOCTOR role.
   */
  static async updatePractice(
    userId: string,
    practiceId: string,
    updates: Partial<DoctorOnboardingInput>,
  ) {
    const membership = await prisma.practiceMembership.findUnique({
      where: {
        practiceId_userId: { practiceId, userId },
      },
    });

    if (!membership || !membership.isActive || (membership.role !== 'OWNER' && membership.role !== 'DOCTOR')) {
      throw new Error('Unauthorized: Only clinic owners and doctors can modify practice settings');
    }

    const data: any = {};
    if (updates.practiceName) data.name = updates.practiceName;
    if (updates.registrationNumber) data.registrationNumber = updates.registrationNumber;
    if (updates.council) data.council = updates.council;
    if (updates.specialty) data.specialty = updates.specialty;
    if (updates.qualifications) data.qualifications = updates.qualifications;
    if (updates.address) data.address = updates.address;
    if (updates.city) data.city = updates.city;
    if (updates.state) data.state = updates.state;
    if (updates.postalCode) data.postalCode = updates.postalCode;
    if (updates.phone) data.phone = updates.phone;
    if (typeof updates.consultationFeeInr === 'number') data.consultationFeeInr = updates.consultationFeeInr;
    if (updates.workingDays) data.workingDays = updates.workingDays.join(',');
    if (updates.workingHours) data.workingHoursJson = JSON.stringify(updates.workingHours);

    const updated = await prisma.practice.update({
      where: { id: practiceId },
      data,
    });

    return updated;
  }

  /**
   * Adds a staff member (e.g. Receptionist) to the practice.
   */
  static async addStaffMember(
    ownerUserId: string,
    practiceId: string,
    staffEmail: string,
    role: PracticeRole = 'RECEPTIONIST',
  ) {
    // 1. Verify caller is OWNER
    const ownerMembership = await prisma.practiceMembership.findUnique({
      where: {
        practiceId_userId: { practiceId, userId: ownerUserId },
      },
    });

    if (!ownerMembership || !ownerMembership.isActive || ownerMembership.role !== 'OWNER') {
      throw new Error('Unauthorized: Only the practice owner can add staff members');
    }

    // 2. Find user by email
    const staffUser = await prisma.user.findUnique({
      where: { email: staffEmail.toLowerCase().trim() },
    });

    if (!staffUser) {
      throw new Error(`User with email "${staffEmail}" does not have an AarogyaDamu account. Please invite them to register first.`);
    }

    // 4. Create or reactivate membership
    const existing = await prisma.practiceMembership.findUnique({
      where: {
        practiceId_userId: { practiceId, userId: staffUser.id },
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new Error('User is already an active member of this practice');
      }
      return await prisma.practiceMembership.update({
        where: { id: existing.id },
        data: { isActive: true, role },
      });
    }

    return await prisma.practiceMembership.create({
      data: {
        practiceId,
        userId: staffUser.id,
        role,
        isActive: true,
      },
    });
  }

  /**
   * Lists all active staff members for a practice.
   */
  static async listStaff(userId: string, practiceId: string) {
    // Caller must be an active member
    const membership = await prisma.practiceMembership.findUnique({
      where: {
        practiceId_userId: { practiceId, userId },
      },
    });

    if (!membership || !membership.isActive) {
      throw new Error('Unauthorized: User is not an active member of this practice');
    }

    const members = await prisma.practiceMembership.findMany({
      where: { practiceId, isActive: true },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            profile: {
              select: { fullName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return members.map((m) => ({
      membershipId: m.id,
      userId: m.userId,
      email: m.user.email,
      fullName: m.user.profile?.fullName || m.user.email.split('@')[0],
      role: m.role as PracticeRole,
      joinedAt: m.createdAt,
    }));
  }
}

