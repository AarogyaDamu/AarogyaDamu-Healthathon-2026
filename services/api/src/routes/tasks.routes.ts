import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { resolvePatientContext } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const prisma = new PrismaClient();

const taskCreateSchema = z.object({
  title: z.string().min(2).max(180),
  category: z.enum(['MEDICATION', 'LAB', 'FOLLOW_UP']).default('FOLLOW_UP'),
  dueAt: z.string().datetime(),
  idempotencyKey: z.string().optional(),
});

const taskUpdateSchema = z.object({
  status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional(),
  title: z.string().min(2).max(180).optional(),
});

router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_TASKS');
    const tasks = await prisma.careTask.findMany({
      where: { userId: effectivePatientId },
      orderBy: { dueAt: 'asc' },
    });
    res.json({ tasks });
  } catch (err: any) {
    res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

router.post(
  '/',
  requireAuth,
  validateRequest({ body: taskCreateSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
      const { title, category, dueAt, idempotencyKey } = req.body;

      // Idempotency protection against duplicate submissions
      if (idempotencyKey) {
        const existing = await prisma.careTask.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          res.status(200).json({ task: existing, duplicateIntercepted: true });
          return;
        }
      }

      const task = await prisma.careTask.create({
        data: {
          userId: effectivePatientId,
          title,
          category,
          dueAt: new Date(dueAt),
          idempotencyKey,
        },
      });

      res.status(201).json({ task });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.patch(
  '/:id',
  requireAuth,
  validateRequest({
    params: z.object({ id: z.string().uuid() }),
    body: taskUpdateSchema,
  }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
      const { id } = req.params;

      const existing = await prisma.careTask.findFirst({
        where: { id, userId: effectivePatientId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Care task not found or access denied' });
        return;
      }

      const updated = await prisma.careTask.update({
        where: { id },
        data: {
          ...(req.body.title ? { title: req.body.title } : {}),
          ...(req.body.status
            ? {
                status: req.body.status,
                completedAt: req.body.status === 'COMPLETED' ? new Date() : null,
              }
            : {}),
        },
      });

      res.json({ task: updated });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.post(
  '/:id/snooze',
  requireAuth,
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
      const { id } = req.params;

      const existing = await prisma.careTask.findFirst({
        where: { id, userId: effectivePatientId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Care task not found' });
        return;
      }

      const nextDue = new Date(existing.dueAt.getTime() + 24 * 60 * 60 * 1000);
      const updated = await prisma.careTask.update({
        where: { id },
        data: { dueAt: nextDue },
      });

      await logAuditEvent({
        userId: effectivePatientId,
        actorId: (req as any).user.id,
        action: 'TASK_SNOOZED',
        entityType: 'CareTask',
        entityId: id,
        metadata: { newDueAt: nextDue.toISOString() },
      });

      res.json({ task: updated });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  validateRequest({ params: z.object({ id: z.string().uuid() }) }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
      const { id } = req.params;

      const existing = await prisma.careTask.findFirst({
        where: { id, userId: effectivePatientId },
      });

      if (!existing) {
        res.status(404).json({ error: 'Task not found' });
        return;
      }

      await prisma.careTask.delete({ where: { id } });
      res.json({ success: true });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

export default router;