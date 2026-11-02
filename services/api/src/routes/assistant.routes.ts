import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { resolvePatientContext } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
const prisma = new PrismaClient();

const querySchema = z.object({
  prompt: z.string().min(1).max(500),
});

router.post(
  '/query',
  requireAuth,
  validateRequest({ body: querySchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_OBSERVATIONS');
      const { prompt } = req.body;
      const lower = prompt.toLowerCase();

      // Tool 1: Recent Observations
      if (lower.includes('sugar') || lower.includes('glucose') || lower.includes('reading')) {
        const readings = await prisma.healthObservation.findMany({
          where: { userId: effectivePatientId },
          orderBy: { observedAt: 'desc' },
          take: 3,
        });

        if (readings.length === 0) {
          res.json({
            reply: 'No glucose checks are on record yet. Log your first morning reading in Sugar Checks.',
          });
          return;
        }

        const formatted = readings
          .map((r) => `${r.numericValue} ${r.unit} (${r.context.toLowerCase().replace(/_/g, ' ')})`)
          .join(', ');

        res.json({
          reply: `Here are your most recent recorded glucose observations: ${formatted}.`,
          records: {
            type: 'OBSERVATIONS',
            items: readings.map((r) => ({
              id: r.id,
              numericValue: r.numericValue,
              unit: r.unit,
              context: r.context,
              observedAt: r.observedAt.toISOString(),
            })),
          },
        });
        return;
      }

      // Tool 2: Create Action Proposal for Task Creation
      if (lower.includes('reminder') || lower.includes('remind') || lower.includes('task')) {
        const proposal = await prisma.assistantProposal.create({
          data: {
            userId: effectivePatientId,
            type: 'SCHEDULE_TASK',
            summaryText: 'Create a reminder: Check morning fasting blood sugar tomorrow at 8:00 AM',
            payload: JSON.stringify({
              title: 'Check morning fasting blood sugar',
              category: 'FOLLOW_UP',
              dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            }),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour expiry
          },
        });

        res.json({
          reply: 'I have prepared a follow-up care task. Because medical updates require confirmation, please review and approve below.',
          proposal: {
            id: proposal.id,
            type: proposal.type,
            summaryText: proposal.summaryText,
            payload: JSON.parse(proposal.payload),
          },
        });
        return;
      }

      // Default safe response
      res.json({
        reply:
          "Namaste! I am Damu, your personal care companion. I can retrieve verified sugar checks, show upcoming appointments, or queue tasks upon your confirmation. I do not diagnose or alter prescribed dosages.",
      });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

router.post(
  '/proposals/:id/confirm',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_TASKS');
      const { id } = req.params;

      const proposal = await prisma.assistantProposal.findFirst({
        where: { id, userId: effectivePatientId, status: 'PENDING' },
      });

      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found, expired, or already executed' });
        return;
      }

      const payload = JSON.parse(proposal.payload);

      await prisma.$transaction(async (tx) => {
        await tx.careTask.create({
          data: {
            userId: effectivePatientId,
            title: payload.title,
            category: payload.category || 'FOLLOW_UP',
            dueAt: new Date(payload.dueAt),
          },
        });

        await tx.assistantProposal.update({
          where: { id },
          data: { status: 'COMPLETED' },
        });
      });

      await logAuditEvent({
        userId: effectivePatientId,
        actorId: (req as any).user.id,
        action: 'ASSISTANT_PROPOSAL_CONFIRMED',
        entityType: 'AssistantProposal',
        entityId: id,
      });

      res.json({ success: true, message: 'Action successfully committed to your care plan' });
    } catch (err: any) {
      res.status(err.message.includes('Forbidden') ? 403 : 500).json({ error: err.message });
    }
  }
);

export default router;