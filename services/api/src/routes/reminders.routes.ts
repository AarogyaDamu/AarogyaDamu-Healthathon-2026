import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext, AuthorizationError } from '../permissions/evaluator';
import { ReminderCreateSchema, ReminderUpdateSchema } from '@aarogyadamu/contracts';
import { logAuditEvent } from '../audit/auditLogger';

import { prisma } from '../db/prisma';
export const remindersRouter = Router();

remindersRouter.use(requireAuth);
remindersRouter.use(requireFeature('P0_4_NOTIFICATIONS_SOS'));

// 1. GET /api/reminders - List reminders for patient
remindersRouter.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_REMINDERS');
    const { status, category } = req.query;

    const where: any = {
      userId: effectivePatientId,
    };
    if (status && typeof status === 'string') {
      where.status = status;
    }
    if (category && typeof category === 'string') {
      where.category = category;
    }

    const reminders = await prisma.reminder.findMany({
      where,
      orderBy: { remindAt: 'asc' },
    });

    res.json({
      reminders: reminders.map((r) => ({
        id: r.id,
        userId: r.userId,
        createdById: r.createdById,
        title: r.title,
        category: r.category,
        status: r.status,
        remindAt: r.remindAt.toISOString(),
        timezone: r.timezone,
        recurrence: r.recurrence,
        entityType: r.entityType,
        entityId: r.entityId,
        notes: r.notes,
        deliveredAt: r.deliveredAt?.toISOString() || null,
        acknowledgedAt: r.acknowledgedAt?.toISOString() || null,
        cancelledAt: r.cancelledAt?.toISOString() || null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
      governanceNotice: 'Reminders are personal scheduling aids and do not alter prescriptions or clinical care instructions.',
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to retrieve reminders.' });
  }
});

// 2. POST /api/reminders - Create a user reminder
remindersRouter.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_REMINDERS');
    const authenticatedUserId = (req as any).user.id;

    const parsed = ReminderCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid reminder payload',
        details: parsed.error.issues,
      });
      return;
    }

    const {
      title,
      category,
      remindAt,
      timezone,
      recurrence,
      entityType,
      entityId,
      notes,
      acknowledgeUnreviewedSource,
      idempotencyKey,
    } = parsed.data;

    // Idempotency replay check
    if (idempotencyKey) {
      const existing = await prisma.reminder.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        res.status(200).json({
          reminder: {
            ...existing,
            remindAt: existing.remindAt.toISOString(),
            deliveredAt: existing.deliveredAt?.toISOString() || null,
            acknowledgedAt: existing.acknowledgedAt?.toISOString() || null,
            cancelledAt: existing.cancelledAt?.toISOString() || null,
            createdAt: existing.createdAt.toISOString(),
            updatedAt: existing.updatedAt.toISOString(),
          },
          replayed: true,
        });
        return;
      }
    }

    const scheduledDate = new Date(remindAt);
    if (isNaN(scheduledDate.getTime())) {
      res.status(400).json({ error: 'Invalid remindAt datetime format.' });
      return;
    }

    // Safety rule: Medication schedule validation
    if (entityType === 'MEDICATION' && entityId) {
      const medication = await prisma.medicationSchedule.findFirst({
        where: {
          id: entityId,
          userId: effectivePatientId,
        },
      });

      if (!medication) {
        res.status(404).json({ error: 'Referenced medication not found for this patient.' });
        return;
      }

      // If medication is unreviewed, explicit acknowledgement is required
      if (medication.reviewStatus === 'UNREVIEWED' && !acknowledgeUnreviewedSource) {
        res.status(400).json({
          error: 'Cannot create automated reminder from an unreviewed patient-entered medication without explicit acknowledgement of unreviewed clinical source.',
          code: 'UNREVIEWED_SOURCE_ACKNOWLEDGEMENT_REQUIRED',
        });
        return;
      }
    }

    // Safety rule: Care task validation
    if (entityType === 'CARE_TASK' && entityId) {
      const task = await prisma.careTask.findFirst({
        where: {
          id: entityId,
          userId: effectivePatientId,
        },
      });

      if (!task) {
        res.status(404).json({ error: 'Referenced care task not found for this patient.' });
        return;
      }
    }

    // Safety rule: Appointment validation
    if (entityType === 'APPOINTMENT' && entityId) {
      const appt = await prisma.appointment.findFirst({
        where: {
          id: entityId,
          patientId: effectivePatientId,
        },
      });

      if (!appt) {
        res.status(404).json({ error: 'Referenced appointment not found for this patient.' });
        return;
      }
    }

    const reminder = await prisma.reminder.create({
      data: {
        userId: effectivePatientId,
        createdById: authenticatedUserId,
        title,
        category,
        status: 'SCHEDULED',
        remindAt: scheduledDate,
        timezone: timezone || null,
        recurrence,
        entityType: entityType || null,
        entityId: entityId || null,
        notes: notes || null,
        idempotencyKey: idempotencyKey || null,
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'REMINDER_CREATED',
      entityType: 'Reminder',
      entityId: reminder.id,
      metadata: JSON.stringify({
        title,
        category,
        remindAt: scheduledDate.toISOString(),
        entityType,
        entityId,
      }),
    });

    res.status(201).json({
      reminder: {
        ...reminder,
        remindAt: reminder.remindAt.toISOString(),
        deliveredAt: null,
        acknowledgedAt: null,
        cancelledAt: null,
        createdAt: reminder.createdAt.toISOString(),
        updatedAt: reminder.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to create reminder.' });
  }
});

// 3. PATCH /api/reminders/:id - Update reminder schedule or details
remindersRouter.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_REMINDERS');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const existing = await prisma.reminder.findFirst({
      where: {
        id,
        userId: effectivePatientId,
      },
    });

    if (!existing) {
      res.status(404).json({ error: 'Reminder not found.' });
      return;
    }

    const parsed = ReminderUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid reminder update payload',
        details: parsed.error.issues,
      });
      return;
    }

    const updateData: any = {};
    if (parsed.data.title !== undefined) updateData.title = parsed.data.title;
    if (parsed.data.timezone !== undefined) updateData.timezone = parsed.data.timezone;
    if (parsed.data.recurrence !== undefined) updateData.recurrence = parsed.data.recurrence;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;

    if (parsed.data.remindAt !== undefined) {
      const scheduledDate = new Date(parsed.data.remindAt);
      if (isNaN(scheduledDate.getTime())) {
        res.status(400).json({ error: 'Invalid remindAt datetime.' });
        return;
      }
      updateData.remindAt = scheduledDate;
    }

    if (parsed.data.status !== undefined) {
      updateData.status = parsed.data.status;
      if (parsed.data.status === 'CANCELLED') {
        updateData.cancelledAt = new Date();
      } else if (parsed.data.status === 'ACKNOWLEDGED') {
        updateData.acknowledgedAt = new Date();
      }
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: updateData,
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'REMINDER_UPDATED',
      entityType: 'Reminder',
      entityId: id,
      metadata: JSON.stringify(updateData),
    });

    res.json({
      reminder: {
        ...updated,
        remindAt: updated.remindAt.toISOString(),
        deliveredAt: updated.deliveredAt?.toISOString() || null,
        acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to update reminder.' });
  }
});

// 4. POST /api/reminders/:id/acknowledge - Acknowledge a delivered reminder
remindersRouter.post('/:id/acknowledge', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_REMINDERS');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const reminder = await prisma.reminder.findFirst({
      where: {
        id,
        userId: effectivePatientId,
      },
    });

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found.' });
      return;
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        status: 'ACKNOWLEDGED',
        acknowledgedAt: new Date(),
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'REMINDER_ACKNOWLEDGED',
      entityType: 'Reminder',
      entityId: id,
    });

    res.json({
      success: true,
      reminder: {
        ...updated,
        remindAt: updated.remindAt.toISOString(),
        deliveredAt: updated.deliveredAt?.toISOString() || null,
        acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to acknowledge reminder.' });
  }
});

// 5. DELETE /api/reminders/:id - Cancel/remove a reminder
remindersRouter.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'MANAGE_REMINDERS');
    const authenticatedUserId = (req as any).user.id;
    const { id } = req.params;

    const reminder = await prisma.reminder.findFirst({
      where: {
        id,
        userId: effectivePatientId,
      },
    });

    if (!reminder) {
      res.status(404).json({ error: 'Reminder not found.' });
      return;
    }

    const updated = await prisma.reminder.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
      },
    });

    await logAuditEvent({
      userId: effectivePatientId,
      actorId: authenticatedUserId,
      action: 'REMINDER_CANCELLED',
      entityType: 'Reminder',
      entityId: id,
    });

    res.json({
      success: true,
      message: 'Reminder cancelled.',
      reminder: {
        ...updated,
        remindAt: updated.remindAt.toISOString(),
        deliveredAt: updated.deliveredAt?.toISOString() || null,
        acknowledgedAt: updated.acknowledgedAt?.toISOString() || null,
        cancelledAt: updated.cancelledAt?.toISOString() || null,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err: any) {
    const code = err instanceof AuthorizationError || err?.status === 403 ? 403 : 500;
    res.status(code).json({ error: err.message || 'Unable to cancel reminder.' });
  }
});

