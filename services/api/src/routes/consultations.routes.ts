import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { resolvePatientContext } from '../permissions/evaluator';

const router = Router();
import { prisma } from '../db/prisma';

const prepSchema = z.object({
  concernsAndQuestions: z.string().min(3),
  personalNotes: z.string().optional(),
});

router.post(
  '/prepare',
  requireAuth,
  validateRequest({ body: prepSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_CONSULTATIONS');
      const { concernsAndQuestions, personalNotes } = req.body;

      const [profile, recentObservations, activeMedications] = await Promise.all([
        prisma.patientProfile.findUnique({ where: { userId: effectivePatientId } }),
        prisma.healthObservation.findMany({
          where: { userId: effectivePatientId },
          orderBy: { observedAt: 'desc' },
          take: 10,
        }),
        prisma.medicationSchedule.findMany({
          where: { userId: effectivePatientId, isActive: true },
        }),
      ]);

      const prep = await prisma.consultationPrep.create({
        data: {
          userId: effectivePatientId,
          concernsAndQuestions,
          personalNotes,
          clinicianName: profile?.primaryClinician || 'Treating Physician',
          snapshotData: JSON.stringify({
            observations: recentObservations,
            medications: activeMedications,
          }),
        },
      });

      res.status(201).json({ consultationPrep: prep });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.get('/history', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_CONSULTATIONS');
    const preps = await prisma.consultationPrep.findMany({
      where: { userId: effectivePatientId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ consultations: preps });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

export default router;
