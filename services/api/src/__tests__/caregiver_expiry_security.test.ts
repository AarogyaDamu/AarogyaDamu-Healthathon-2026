import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import { prisma } from '../db/prisma';

jest.mock('../db/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    doctorPatientAssignment: {
      findUnique: jest.fn(),
    },
    caregiverConsent: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  },
}));

describe('Caregiver Consent Expiration & Security Validation', () => {
  const caregiverId = 'caregiver-1';
  const patientId = 'patient-1';
  const caregiverEmail = 'caregiver@aarogyadamu.com';

  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.caregiverConsent.update as jest.Mock).mockResolvedValue({});
    (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 1 });
  });

  const mockRequest = (headers: Record<string, string> = {}) =>
    ({
      user: { id: caregiverId },
      headers,
    } as any);

  it('allows access when caregiver has active, non-expiring consent', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: caregiverId,
      email: caregiverEmail,
      isClinician: false,
    });

    (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
      id: 'consent-1',
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      expiresAt: null,
      permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'VIEW_HEALTH_SUMMARY']),
    });

    const req = mockRequest({ 'x-target-patient-id': patientId });
    const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

    expect(result.effectivePatientId).toBe(patientId);
    expect(result.isDelegated).toBe(true);
  });

  it('allows access when caregiver has active consent expiring in the future', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: caregiverId,
      email: caregiverEmail,
      isClinician: false,
    });

    (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
      id: 'consent-1',
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400_000), // tomorrow
      permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'VIEW_HEALTH_SUMMARY']),
    });

    const req = mockRequest({ 'x-target-patient-id': patientId });
    const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

    expect(result.effectivePatientId).toBe(patientId);
    expect(result.isDelegated).toBe(true);
  });

  it('denies access (403) when caregiver consent has expired', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: caregiverId,
      email: caregiverEmail,
      isClinician: false,
    });

    // Consent query returns null because DB query filters out expired records
    (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue(null);

    const req = mockRequest({ 'x-target-patient-id': patientId });

    await expect(resolvePatientContext(req, 'VIEW_OBSERVATIONS')).rejects.toThrow(
      AuthorizationError,
    );
    await expect(resolvePatientContext(req, 'VIEW_OBSERVATIONS')).rejects.toThrow(
      `Forbidden: Access denied: No active caregiver consent from patient ${patientId}`,
    );
  });

  it('denies access (403) when caregiver lacks the required granular permission', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: caregiverId,
      email: caregiverEmail,
      isClinician: false,
    });

    (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
      id: 'consent-1',
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      expiresAt: new Date(Date.now() + 86400_000),
      permissions: JSON.stringify(['VIEW_NOTIFICATIONS']), // Lacks VIEW_OBSERVATIONS
    });

    const req = mockRequest({ 'x-target-patient-id': patientId });

    await expect(resolvePatientContext(req, 'VIEW_OBSERVATIONS')).rejects.toThrow(
      AuthorizationError,
    );
    await expect(resolvePatientContext(req, 'VIEW_OBSERVATIONS')).rejects.toThrow(
      `Forbidden: Caregiver grant does not include permission [VIEW_OBSERVATIONS]`,
    );
  });

  describe('P2025 Prevention & Concurrency Resilience', () => {
    it('updates lastAccessedAt via safe updateMany targeting ACTIVE consent', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: caregiverId,
        email: caregiverEmail,
        isClinician: false,
      });

      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: 'consent-active-1',
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        expiresAt: null,
        permissions: JSON.stringify(['VIEW_OBSERVATIONS']),
      });

      const req = mockRequest({ 'x-target-patient-id': patientId });
      const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

      expect(result.effectivePatientId).toBe(patientId);
      expect(result.isDelegated).toBe(true);

      // Verify updateMany was invoked safely with status: 'ACTIVE'
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: 'consent-active-1', status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });

    it('handles consent disappearing (record deleted) between lookup and update without throwing P2025', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: caregiverId,
        email: caregiverEmail,
        isClinician: false,
      });

      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: 'consent-deleted-race',
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        expiresAt: null,
        permissions: JSON.stringify(['VIEW_OBSERVATIONS']),
      });

      // Simulate consent row deleted immediately after lookup: updateMany returns { count: 0 } without throwing P2025
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const req = mockRequest({ 'x-target-patient-id': patientId });
      const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

      expect(result.effectivePatientId).toBe(patientId);
      expect(result.isDelegated).toBe(true);
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith({
        where: { id: 'consent-deleted-race', status: 'ACTIVE' },
        data: { lastAccessedAt: expect.any(Date) },
      });
    });

    it('handles concurrent consent revocation gracefully without updating revoked record', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: caregiverId,
        email: caregiverEmail,
        isClinician: false,
      });

      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: 'consent-concurrent-revoke',
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        expiresAt: null,
        permissions: JSON.stringify(['VIEW_OBSERVATIONS']),
      });

      // Status changed to REVOKED in database by patient; updateMany finds 0 ACTIVE rows
      (prisma.caregiverConsent.updateMany as jest.Mock).mockResolvedValue({ count: 0 });

      const req = mockRequest({ 'x-target-patient-id': patientId });
      const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');

      expect(result.effectivePatientId).toBe(patientId);
      expect(result.isDelegated).toBe(true);
      // Ensures status filter was enforced
      expect(prisma.caregiverConsent.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'consent-concurrent-revoke', status: 'ACTIVE' },
        })
      );
    });

    it('does not fail user request when lastAccessedAt update encounters transient database error', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: caregiverId,
        email: caregiverEmail,
        isClinician: false,
      });

      (prisma.caregiverConsent.findFirst as jest.Mock).mockResolvedValue({
        id: 'consent-transient-error',
        patientId,
        caregiverEmail,
        status: 'ACTIVE',
        expiresAt: null,
        permissions: JSON.stringify(['VIEW_OBSERVATIONS']),
      });

      // Transient connection failure or rejection
      (prisma.caregiverConsent.updateMany as jest.Mock).mockRejectedValue(
        new Error('Transient connection reset')
      );

      const req = mockRequest({ 'x-target-patient-id': patientId });
      // Should not throw; best-effort timestamp update is non-blocking
      const result = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
      expect(result.effectivePatientId).toBe(patientId);
      expect(result.isDelegated).toBe(true);
    });
  });
});
