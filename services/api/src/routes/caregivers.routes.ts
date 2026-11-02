import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const prisma = new PrismaClient();

const consentInviteSchema = z.object({
  caregiverEmail: z.string().email(),
  caregiverName: z.string().min(2),
  relationship: z.string(),
  permissions: z.array(z.string()).min(1),
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const patientId = actor.id;

  const [consents, caregivingFor] = await Promise.all([
    prisma.caregiverConsent.findMany({
      where: { patientId },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.caregiverConsent.findMany({
      where: {
        caregiverEmail: actor.email,
        status: 'ACTIVE',
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const parsed = consents.map((c) => ({
    ...c,
    permissions: JSON.parse(c.permissions || '[]'),
  }));

  res.json({
    consents: parsed,
    caregivingFor: caregivingFor.map((c) => ({
      consentId: c.id,
      patientId: c.patientId,
      patientName: c.patient.profile?.fullName || 'Patient',
      relationship: c.relationship,
      permissions: JSON.parse(c.permissions || '[]'),
    })),
  });
});

router.post(
  '/',
  requireAuth,
  validateRequest({ body: consentInviteSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const patientId = (req as any).user.id;
    const { caregiverEmail, caregiverName, relationship, permissions } = req.body;

    try {
    const [, consent] = await prisma.$transaction([
      prisma.caregiverConsent.updateMany({ where: { patientId, caregiverEmail, status: 'ACTIVE', expiresAt: { lte: new Date() } }, data: { status: 'EXPIRED' } }),
      prisma.caregiverConsent.create({
      data: {
        patientId,
        caregiverEmail,
        caregiverName,
        relationship,
        status: 'ACTIVE',
        permissions: JSON.stringify(permissions),
      },
      }),
    ]);

    await logAuditEvent({
      userId: patientId,
      actorId: patientId,
      action: 'CAREGIVER_CONSENT_GRANTED',
      entityType: 'CaregiverConsent',
      entityId: consent.id,
      metadata: { caregiverEmail, permissions },
    });

    const caregiverUser = await prisma.user.findUnique({ where: { email: caregiverEmail } });
    if (caregiverUser) {
      await prisma.careNotification.create({
        data: {
          userId: caregiverUser.id,
          patientId,
          actorId: patientId,
          type: 'CONSENT_CHANGE',
          title: 'Caregiver Access Granted',
          message: `You have been granted caregiver access permissions: ${permissions.join(', ')}.`,
          link: '/(caregiver)/dependents',
        },
      }).catch(() => {});
    }

    res.status(201).json({
      consent: {
        ...consent,
        permissions: JSON.parse(consent.permissions),
      },
    });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        res.status(409).json({ error: 'An active grant already exists for this caregiver. Revoke it before granting different permissions.' });
        return;
      }
      console.error('[consent API] Unable to grant access');
      res.status(500).json({ error: 'Unable to grant caregiver access.' });
    }
  }
);

router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const patientId = (req as any).user.id;
  const { id } = req.params;

  const consent = await prisma.caregiverConsent.findFirst({
    where: { id, patientId },
  });

  if (!consent) {
    res.status(404).json({ error: 'Consent delegation record not found' });
    return;
  }

  await prisma.caregiverConsent.update({
    where: { id },
    data: { status: 'REVOKED' },
  });

  await logAuditEvent({
    userId: patientId,
    actorId: patientId,
    action: 'CAREGIVER_CONSENT_REVOKED',
    entityType: 'CaregiverConsent',
    entityId: id,
  });

  const caregiverUser = await prisma.user.findUnique({ where: { email: consent.caregiverEmail } });
  if (caregiverUser) {
    await prisma.careNotification.create({
      data: {
        userId: caregiverUser.id,
        patientId,
        actorId: patientId,
        type: 'CONSENT_CHANGE',
        title: 'Caregiver Access Revoked',
        message: 'Caregiver access delegation has been revoked by the patient.',
        link: '/(caregiver)/dependents',
      },
    }).catch(() => {});
  }

  res.json({ success: true, message: 'Caregiver access revoked' });
});

export default router;
