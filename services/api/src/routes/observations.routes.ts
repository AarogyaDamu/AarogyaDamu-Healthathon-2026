import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { resolvePatientContext } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const prisma = new PrismaClient();

const observationSchema = z.object({
  type: z.enum(['BLOOD_GLUCOSE', 'WEIGHT', 'BLOOD_PRESSURE']).default('BLOOD_GLUCOSE'),
  numericValue: z.number().min(20).max(600),
  unit: z.enum(['mg/dL', 'mmol/L', 'kg', 'mmHg']).default('mg/dL'),
  context: z.enum(['FASTING', 'PRE_MEAL', 'POST_MEAL_2HR', 'BEDTIME', 'RANDOM']).default('FASTING'),
  notes: z.string().max(500).optional(),
  observedAt: z.string().datetime().optional(),
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
    const { limit = '50', context } = req.query as { limit?: string; context?: string };

    const observations = await prisma.healthObservation.findMany({
      where: {
        userId: effectivePatientId,
        ...(context ? { context: context as any } : {}),
      },
      orderBy: { observedAt: 'desc' },
      take: Math.min(parseInt(limit, 10) || 50, 100),
    });

    res.json({ observations });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

router.post(
  '/',
  requireAuth,
  validateRequest({ body: observationSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_OBSERVATIONS');
      const actorId = (req as any).user.id;

      const obs = await prisma.healthObservation.create({
        data: {
          userId: effectivePatientId,
          type: req.body.type,
          numericValue: req.body.numericValue,
          unit: req.body.unit,
          context: req.body.context,
          notes: req.body.notes,
          observedAt: req.body.observedAt ? new Date(req.body.observedAt) : new Date(),
          provenance: 'PATIENT_ENTERED',
        },
      });

      await logAuditEvent({
        userId: effectivePatientId,
        actorId,
        action: 'OBSERVATION_CREATED',
        entityType: 'HealthObservation',
        entityId: obs.id,
        metadata: { numericValue: obs.numericValue, unit: obs.unit, context: obs.context },
        ipAddress: req.ip,
      });

      res.status(201).json({ observation: obs });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

export default router;