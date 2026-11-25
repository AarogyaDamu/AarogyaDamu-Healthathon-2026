import { PracticeBillingService } from '../services/practiceBillingService';
import { prisma } from '../db/prisma';

// Mock prisma for isolated service unit tests
jest.mock('../db/prisma', () => ({
  prisma: {
    practiceMembership: {
      findUnique: jest.fn(),
    },
    patientEncounterBilling: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

describe('PracticeBillingService Lifecycle & State Machine', () => {
  const actorUserId = 'doctor-1';
  const practiceId = 'practice-1';
  const billingId = 'billing-1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects billing transitions by non-members or inactive staff', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(
      PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow('Unauthorized: User is not an active staff member of this practice');
  });

  it('rejects transitions for non-existent billing records', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'DOCTOR',
    });
    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue(null);

    await expect(
      PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow(`Billing record '${billingId}' not found in this practice`);
  });

  it('allows PENDING -> PAID transition and assigns official receipt', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'DOCTOR',
    });

    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue({
      id: billingId,
      practiceId,
      patientId: 'patient-1',
      totalAmountInr: 600,
      paymentStatus: 'PENDING',
      paymentMethod: 'UPI',
      receiptNumber: 'PEND-1234',
      notes: 'Initial consultation',
    });

    (prisma.patientEncounterBilling.update as jest.Mock).mockImplementation(({ data }) => ({
      id: billingId,
      ...data,
      patient: { id: 'patient-1', email: 'p@test.com', profile: { fullName: 'Test Patient' } },
    }));

    const result = await PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
      paymentStatus: 'PAID',
      paymentMethod: 'CASH',
      transactionReference: 'CASH-001',
    });

    expect(result.paymentStatus).toBe('PAID');
    expect(result.paymentMethod).toBe('CASH');
    expect(result.receiptNumber).toMatch(/^REC-\d{6}-\d{4}$/);
  });

  it('allows PENDING -> CANCELLED transition (voiding invoice)', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'RECEPTIONIST',
    });

    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue({
      id: billingId,
      practiceId,
      patientId: 'patient-1',
      totalAmountInr: 600,
      paymentStatus: 'PENDING',
      paymentMethod: 'UPI',
      receiptNumber: 'REC-202611-9999',
    });

    (prisma.patientEncounterBilling.update as jest.Mock).mockImplementation(({ data }) => ({
      id: billingId,
      ...data,
      patient: { id: 'patient-1', email: 'p@test.com', profile: { fullName: 'Test Patient' } },
    }));

    const result = await PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
      paymentStatus: 'CANCELLED',
      notes: 'Appointment was cancelled before consult',
    });

    expect(result.paymentStatus).toBe('CANCELLED');
  });

  it('allows PAID -> REFUNDED transition with audit notes', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'OWNER',
    });

    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue({
      id: billingId,
      practiceId,
      patientId: 'patient-1',
      totalAmountInr: 600,
      paymentStatus: 'PAID',
      paymentMethod: 'UPI',
      receiptNumber: 'REC-202611-1234',
      notes: 'Original consult fee',
    });

    (prisma.patientEncounterBilling.update as jest.Mock).mockImplementation(({ data }) => ({
      id: billingId,
      ...data,
      patient: { id: 'patient-1', email: 'p@test.com', profile: { fullName: 'Test Patient' } },
    }));

    const result = await PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
      paymentStatus: 'REFUNDED',
      notes: 'Patient could not be seen due to doctor emergency',
    });

    expect(result.paymentStatus).toBe('REFUNDED');
  });

  it('strictly forbids transitions out of terminal state CANCELLED', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'DOCTOR',
    });

    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue({
      id: billingId,
      practiceId,
      paymentStatus: 'CANCELLED',
    });

    await expect(
      PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow("Cannot modify billing in terminal state 'CANCELLED'");
  });

  it('strictly forbids transitions out of terminal state REFUNDED', async () => {
    (prisma.practiceMembership.findUnique as jest.Mock).mockResolvedValue({
      practiceId,
      userId: actorUserId,
      isActive: true,
      role: 'DOCTOR',
    });

    (prisma.patientEncounterBilling.findFirst as jest.Mock).mockResolvedValue({
      id: billingId,
      practiceId,
      paymentStatus: 'REFUNDED',
    });

    await expect(
      PracticeBillingService.transitionBillingStatus(actorUserId, practiceId, billingId, {
        paymentStatus: 'PAID',
      }),
    ).rejects.toThrow("Cannot modify billing in terminal state 'REFUNDED'");
  });
});

