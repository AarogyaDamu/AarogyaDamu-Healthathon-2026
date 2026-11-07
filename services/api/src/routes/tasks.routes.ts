import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { requireClinician } from '../middleware/requireClinician';
import { resolvePatientContext } from '../permissions/evaluator';
import { logAuditEvent } from '../audit/auditLogger';
import {
  DoctorTaskCreateSchema,
  TaskCompleteSchema,
  TaskCancelSchema,
} from '@aarogyadamu/contracts';

const router = Router();
import { prisma } from '../db/prisma';

function getAuthErrorStatus(err: any): number {
  if (err?.status && typeof err.status === 'number') return err.status;
  if (err?.statusCode && typeof err.statusCode === 'number') return err.statusCode;
  const msg = String(err?.message || '');
  if (
    msg.includes('Forbidden') ||
    msg.includes('Access denied') ||
    msg.includes('lacks specific permission') ||
    msg.includes('not actively assigned') ||
    msg.includes('authorized clinician')
  ) {
    return 403;
  }
  return 500;
}

// ---------------------------------------------------------------------------
// 1. GET /api/tasks - Retrieve assigned tasks for patient
// ---------------------------------------------------------------------------
router.get('/', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_TASKS');
    const { status, category } = req.query;

    const where: any = { userId: effectivePatientId };
    if (status && typeof status === 'string') {
      if (status === 'OVERDUE') {
        where.status = 'PENDING';
        where.dueAt = { lt: new Date() };
      } else {
        where.status = status;
      }
    }
    if (category && typeof category === 'string') {
      where.category = category;
    }

    const rawTasks = await prisma.careTask.findMany({
      where,
      include: {
        assignedBy: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        completedBy: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { dueAt: 'asc' },
    });

    const now = new Date();
    const tasks = rawTasks.map((t) => {
      const isPastDue = t.status === 'PENDING' && t.dueAt < now;
      return {
        ...t,
        computedStatus: isPastDue ? 'OVERDUE' : t.status,
        assigningDoctorName: t.assignedBy?.profile?.fullName || 'Assigned Clinician',
        completedByName: t.completedBy?.profile?.fullName || (t.completedByRole === 'PATIENT' ? 'Patient' : 'Caregiver'),
      };
    });

    res.json({ tasks });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. GET /api/tasks/stats - Task metrics & completion breakdown
// ---------------------------------------------------------------------------
router.get('/stats', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_TASKS');
    const tasks = await prisma.careTask.findMany({
      where: { userId: effectivePatientId },
    });

    const now = new Date();
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const cancelledTasks = tasks.filter((t) => t.status === 'CANCELLED').length;
    const overdueTasks = tasks.filter((t) => t.status === 'PENDING' && t.dueAt < now).length;
    const pendingTasks = tasks.filter((t) => t.status === 'PENDING' && t.dueAt >= now).length;

    const patientCompletedCount = tasks.filter(
      (t) => t.status === 'COMPLETED' && t.completedByRole === 'PATIENT'
    ).length;
    const caregiverCompletedCount = tasks.filter(
      (t) => t.status === 'COMPLETED' && t.completedByRole === 'CAREGIVER'
    ).length;

    const completionPercentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    res.json({
      stats: {
        totalTasks,
        completedTasks,
        pendingTasks,
        overdueTasks,
        cancelledTasks,
        completionPercentage,
        patientCompletedCount,
        caregiverCompletedCount,
      },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. GET /api/tasks/:id - Retrieve single task by ID
// ---------------------------------------------------------------------------
router.get('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_TASKS');
    const { id } = req.params;

    const task = await prisma.careTask.findFirst({
      where: { id, userId: effectivePatientId },
      include: {
        assignedBy: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        completedBy: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!task) {
      res.status(404).json({ error: 'Care task not found or access denied.' });
      return;
    }

    res.json({ task });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. POST /api/tasks & POST /api/tasks/assign - Doctor creates/assigns task
// ---------------------------------------------------------------------------
const handleAssignTask = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.isClinician) {
      res.status(403).json({
        error: 'Forbidden: Only authorized clinicians can create or assign clinical tasks.',
        code: 'CLINICIAN_ONLY_TASK_ASSIGNMENT',
      });
      return;
    }

    const targetPatientId = (req.headers['x-target-patient-id'] as string) || req.body.patientId;
    if (!targetPatientId) {
      res.status(400).json({ error: 'Target patient ID is required via X-Target-Patient-Id header or patientId body.' });
      return;
    }

    // Verify active DoctorPatientAssignment
    const assignment = await prisma.doctorPatientAssignment.findUnique({
      where: {
        doctorId_patientId: {
          doctorId: user.id,
          patientId: targetPatientId,
        },
      },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      res.status(403).json({
        error: 'Forbidden: You can only assign clinical tasks to actively assigned patients.',
        code: 'UNASSIGNED_CLINICIAN',
      });
      return;
    }

    const parsed = DoctorTaskCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid task payload',
        details: parsed.error.issues,
      });
      return;
    }

    const {
      title,
      category,
      instructions,
      priority,
      frequency,
      recurrence,
      dueAt,
      clinicalNotes,
      idempotencyKey,
    } = parsed.data;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.careTask.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        res.status(200).json({ task: existing, replayed: true });
        return;
      }
    }

    const task = await prisma.$transaction(async (tx) => {
      const created = await tx.careTask.create({
        data: {
          userId: targetPatientId,
          assignedById: user.id,
          title,
          category,
          instructions: instructions || null,
          priority,
          frequency,
          recurrence: recurrence || null,
          dueAt: new Date(dueAt),
          clinicalNotes: clinicalNotes || null,
          status: 'PENDING',
          idempotencyKey: idempotencyKey || null,
        },
        include: {
          assignedBy: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      // Dispatch patient notification
      await tx.careNotification.create({
        data: {
          userId: targetPatientId,
          patientId: targetPatientId,
          actorId: user.id,
          type: 'TASK_ASSIGNED',
          category: 'TASK',
          title: 'New Clinical Task Assigned',
          message: `Dr. ${user.profile?.fullName || 'Your doctor'} has assigned a new task: "${title}".`,
          link: '/tasks',
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: targetPatientId,
          actorId: user.id,
          action: 'DOCTOR_ASSIGNED_TASK',
          entityType: 'CareTask',
          entityId: created.id,
          metadata: JSON.stringify({
            title,
            category,
            dueAt,
            priority,
            instructions,
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return created;
    });

    res.status(201).json({ task });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message || 'Unable to assign task.' });
  }
};

router.post('/', requireAuth, handleAssignTask);
router.post('/assign', requireAuth, handleAssignTask);

// ---------------------------------------------------------------------------
// 5. POST /api/tasks/:id/complete - Patient or authorized caregiver completes task
// ---------------------------------------------------------------------------
router.post('/:id/complete', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const task = await prisma.careTask.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!task) {
      res.status(404).json({ error: 'Care task not found.' });
      return;
    }

    // Role & Permission determination
    let actorRole: 'PATIENT' | 'CAREGIVER' | 'DOCTOR' = 'PATIENT';
    if (user.id === task.userId) {
      actorRole = 'PATIENT';
    } else if (user.isClinician) {
      // Doctor completing task on patient's behalf
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: user.id,
            patientId: task.userId,
          },
        },
      });
      if (!assignment || assignment.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Forbidden: Clinician is not actively assigned to this patient.' });
        return;
      }
      actorRole = 'DOCTOR';
    } else {
      // Caregiver completing on patient's behalf -> must have explicit active consent
      const consent = await prisma.caregiverConsent.findFirst({
        where: {
          patientId: task.userId,
          caregiverEmail: user.email,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (!consent) {
        res.status(403).json({
          error: 'Forbidden: Access denied: No active caregiver consent from patient.',
          code: 'CONSENT_DENIED',
        });
        return;
      }

      const grantedPermissions: string[] = JSON.parse(consent.permissions || '[]');
      const canComplete =
        grantedPermissions.includes('COMPLETE_TASKS_ON_BEHALF') ||
        grantedPermissions.includes('MANAGE_TASKS');

      if (!canComplete) {
        res.status(403).json({
          error: 'Forbidden: Caregiver lacks explicit permission to complete tasks on behalf of the patient.',
          code: 'TASK_COMPLETION_PERMISSION_REQUIRED',
        });
        return;
      }
      actorRole = 'CAREGIVER';
    }

    const parsed = TaskCompleteSchema.safeParse(req.body);
    const idempotencyKey = parsed.success ? parsed.data.idempotencyKey : undefined;

    // Idempotency / Duplicate completion check
    if (task.status === 'COMPLETED') {
      res.status(200).json({
        task,
        replayed: true,
        message: 'Task is already completed.',
      });
      return;
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      const updated = await tx.careTask.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: user.id,
          completedByRole: actorRole,
        },
        include: {
          completedBy: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          userId: task.userId,
          actorId: user.id,
          action: 'TASK_COMPLETED',
          entityType: 'CareTask',
          entityId: task.id,
          metadata: JSON.stringify({
            completedByRole: actorRole,
            completedAt: updated.completedAt?.toISOString(),
            idempotencyKey,
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      if (actorRole === 'CAREGIVER') {
        await tx.careNotification.create({
          data: {
            userId: task.userId,
            patientId: task.userId,
            actorId: user.id,
            type: 'DELEGATED_TASK_COMPLETED',
            category: 'TASK',
            title: 'Task Completed by Caregiver',
            message: `${user.profile?.fullName || 'Your caregiver'} completed task: "${task.title}".`,
            link: '/tasks',
          },
        }).catch(() => {});
      }

      return updated;
    });

    res.status(200).json({ task: updatedTask, success: true });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message || 'Unable to complete task.' });
  }
});

// ---------------------------------------------------------------------------
// 6. PATCH /api/tasks/:id - Doctor modifies task instructions or schedule
// ---------------------------------------------------------------------------
router.patch('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.isClinician) {
      res.status(403).json({
        error: 'Forbidden: Only authorized clinicians can modify clinical tasks or instructions.',
        code: 'CLINICIAN_ONLY_TASK_MODIFICATION',
      });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.careTask.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Care task not found.' });
      return;
    }

    // Verify clinician assignment
    const assignment = await prisma.doctorPatientAssignment.findUnique({
      where: {
        doctorId_patientId: {
          doctorId: user.id,
          patientId: existing.userId,
        },
      },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      res.status(403).json({
        error: 'Forbidden: Clinician is not actively assigned to this patient.',
        code: 'UNASSIGNED_CLINICIAN',
      });
      return;
    }

    const { title, instructions, dueAt, priority, clinicalNotes, status } = req.body;
    const updateData: any = {};
    if (title) updateData.title = title.trim();
    if (instructions !== undefined) updateData.instructions = instructions ? instructions.trim() : null;
    if (dueAt) updateData.dueAt = new Date(dueAt);
    if (priority) updateData.priority = priority;
    if (clinicalNotes !== undefined) updateData.clinicalNotes = clinicalNotes ? clinicalNotes.trim() : null;
    if (status) updateData.status = status;

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.careTask.update({
        where: { id },
        data: updateData,
      });

      await tx.careNotification.create({
        data: {
          userId: existing.userId,
          patientId: existing.userId,
          actorId: user.id,
          type: 'TASK_UPDATED',
          category: 'TASK',
          title: 'Care Task Updated',
          message: `Your doctor has updated the task: "${res.title}".`,
          link: '/tasks',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: existing.userId,
          actorId: user.id,
          action: 'TASK_MODIFIED',
          entityType: 'CareTask',
          entityId: id,
          metadata: JSON.stringify(updateData),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return res;
    });

    res.json({ task: updated });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message || 'Unable to update task.' });
  }
});

// ---------------------------------------------------------------------------
// 7. POST /api/tasks/:id/cancel - Doctor cancels task with mandatory rationale
// ---------------------------------------------------------------------------
router.post('/:id/cancel', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user || !user.isClinician) {
      res.status(403).json({
        error: 'Forbidden: Only authorized clinicians can cancel clinical tasks.',
        code: 'CLINICIAN_ONLY_TASK_CANCELLATION',
      });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.careTask.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: 'Care task not found.' });
      return;
    }

    const assignment = await prisma.doctorPatientAssignment.findUnique({
      where: {
        doctorId_patientId: {
          doctorId: user.id,
          patientId: existing.userId,
        },
      },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      res.status(403).json({
        error: 'Forbidden: Clinician is not actively assigned to this patient.',
        code: 'UNASSIGNED_CLINICIAN',
      });
      return;
    }

    const parsed = TaskCancelSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Cancellation reason is required (minimum 3 characters).',
        details: parsed.error.issues,
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const res = await tx.careTask.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancellationReason: parsed.data.cancellationReason,
        },
      });

      await tx.careNotification.create({
        data: {
          userId: existing.userId,
          patientId: existing.userId,
          actorId: user.id,
          type: 'TASK_CANCELLED',
          category: 'TASK',
          title: 'Care Task Cancelled',
          message: `The clinical task "${existing.title}" was cancelled by your doctor: ${parsed.data.cancellationReason}`,
          link: '/tasks',
        },
      });

      await tx.auditLog.create({
        data: {
          userId: existing.userId,
          actorId: user.id,
          action: 'TASK_CANCELLED',
          entityType: 'CareTask',
          entityId: id,
          metadata: JSON.stringify({ cancellationReason: parsed.data.cancellationReason }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return res;
    });

    res.json({ task: updated, success: true });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message || 'Unable to cancel task.' });
  }
});

// ---------------------------------------------------------------------------
// 8. DELETE /api/tasks/:id - Hard deletion strictly forbidden
// ---------------------------------------------------------------------------
router.delete('/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.status(403).json({
    error: 'Forbidden: Clinical tasks cannot be deleted. Use cancellation to maintain historical audit trail.',
    code: 'TASK_DELETION_FORBIDDEN',
  });
});

export default router;
