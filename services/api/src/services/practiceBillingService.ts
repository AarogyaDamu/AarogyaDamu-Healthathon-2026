import { prisma } from '../db/prisma';
import {
  PatientEncounterBillingInput,
  EncounterBillingStatusUpdateInput,
  PracticeCollectionsSummary,
} from '@aarogyadamu/contracts';

export class PracticeBillingService {
  /**
   * Updates billing payment status (e.g. PENDING -> PAID, PENDING -> CANCELLED, PAID -> REFUNDED).
   * Enforces staff role authorization, terminal-state immutability, and receipt generation.
   */
  static async transitionBillingStatus(
    actorUserId: string,
    practiceId: string,
    billingId: string,
    input: EncounterBillingStatusUpdateInput,
  ) {
    const membership = await prisma.practiceMembership.findUnique({
      where: { practiceId_userId: { practiceId, userId: actorUserId } },
    });

    if (!membership || !membership.isActive) {
      throw new Error('Unauthorized: User is not an active staff member of this practice');
    }

    const billing = await prisma.patientEncounterBilling.findFirst({
      where: { id: billingId, practiceId },
    });

    if (!billing) {
      throw new Error(`Billing record '${billingId}' not found in this practice`);
    }

    const currentStatus = billing.paymentStatus;
    const targetStatus = input.paymentStatus;

    if (currentStatus === targetStatus) {
      return billing;
    }

    if (['CANCELLED', 'REFUNDED'].includes(currentStatus)) {
      throw new Error(`Cannot modify billing in terminal state '${currentStatus}'`);
    }

    if (currentStatus === 'PENDING') {
      if (!['PAID', 'CANCELLED'].includes(targetStatus)) {
        throw new Error('Invalid transition: PENDING billings can only transition to PAID or CANCELLED');
      }
    } else if (currentStatus === 'PAID') {
      if (targetStatus !== 'REFUNDED') {
        throw new Error('Invalid transition: PAID billings can only transition to REFUNDED');
      }
    }

    const updateData: any = {
      paymentStatus: targetStatus,
    };

    if (input.paymentMethod) {
      updateData.paymentMethod = input.paymentMethod;
    }
    if (input.transactionReference !== undefined) {
      updateData.transactionReference = input.transactionReference;
    }
    if (input.notes) {
      updateData.notes = billing.notes ? `${billing.notes} | ${input.notes}` : input.notes;
    }

    // Ensure proper receipt number when transitioning to PAID
    if (targetStatus === 'PAID' && (!billing.receiptNumber || billing.receiptNumber.startsWith('PEND-'))) {
      const now = new Date();
      updateData.receiptNumber = `REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const updated = await prisma.patientEncounterBilling.update({
      where: { id: billing.id },
      data: updateData,
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    return updated;
  }

  /**
   * Records payment and generates an official consultation receipt.
   * Can be performed by Doctor, Owner, or Receptionist staff.
   */
  static async recordEncounterBilling(
    actorUserId: string,
    practiceId: string,
    input: PatientEncounterBillingInput,
  ) {
    // 1. Verify actor is active staff/doctor in this practice
    const membership = await prisma.practiceMembership.findUnique({
      where: { practiceId_userId: { practiceId, userId: actorUserId } },
    });

    if (!membership || !membership.isActive) {
      throw new Error('Unauthorized: User is not an active staff member of this practice');
    }

    const now = new Date();
    const receiptNumber = `REC-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    const billing = await prisma.patientEncounterBilling.create({
      data: {
        practiceId,
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        doctorId: actorUserId,
        consultationFeeInr: input.consultationFeeInr,
        discountInr: input.discountInr || 0,
        totalAmountInr: input.totalAmountInr,
        paymentStatus: input.paymentStatus || 'PAID',
        paymentMethod: input.paymentMethod || 'UPI',
        receiptNumber,
        transactionReference: input.transactionReference,
        notes: input.notes,
      },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    return billing;
  }

  /**
   * Calculates daily collections and payment method analytics for a practice.
   */
  static async getDailyCollections(practiceId: string, dateStr?: string): Promise<PracticeCollectionsSummary> {
    const targetDate = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    const billings = await prisma.patientEncounterBilling.findMany({
      where: {
        practiceId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    let totalRevenueInr = 0;
    let totalCollectedInr = 0;
    let totalPendingInr = 0;
    let paidCount = 0;
    let pendingCount = 0;

    const collectionsByMethod = {
      CASH: 0,
      UPI: 0,
      CARD: 0,
      NET_BANKING: 0,
    };

    for (const b of billings) {
      totalRevenueInr += b.totalAmountInr;
      if (b.paymentStatus === 'PAID') {
        paidCount++;
        totalCollectedInr += b.totalAmountInr;
        const method = b.paymentMethod as keyof typeof collectionsByMethod;
        if (collectionsByMethod[method] !== undefined) {
          collectionsByMethod[method] += b.totalAmountInr;
        }
      } else if (b.paymentStatus === 'PENDING') {
        pendingCount++;
        totalPendingInr += b.totalAmountInr;
      }
    }

    return {
      date: startOfDay.toISOString().split('T')[0],
      totalConsultationsCount: billings.length,
      paidConsultationsCount: paidCount,
      pendingConsultationsCount: pendingCount,
      totalRevenueInr,
      totalCollectedInr,
      totalPendingInr,
      collectionsByMethod,
    };
  }

  /**
   * Lists patient encounter billings with search filters.
   */
  static async listBillings(
    practiceId: string,
    options?: { patientId?: string; paymentStatus?: string; limit?: number },
  ) {
    const where: any = { practiceId };
    if (options?.patientId) where.patientId = options.patientId;
    if (options?.paymentStatus) where.paymentStatus = options.paymentStatus;

    const billings = await prisma.patientEncounterBilling.findMany({
      where,
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(1, options?.limit || 50), 100),
    });

    return billings.map((b) => ({
      id: b.id,
      receiptNumber: b.receiptNumber,
      patientId: b.patientId,
      patientName: b.patient.profile?.fullName || b.patient.email.split('@')[0],
      consultationFeeInr: b.consultationFeeInr,
      discountInr: b.discountInr,
      totalAmountInr: b.totalAmountInr,
      paymentStatus: b.paymentStatus,
      paymentMethod: b.paymentMethod,
      transactionReference: b.transactionReference,
      createdAt: b.createdAt.toISOString(),
    }));
  }
}

