import { Router, Request, Response } from 'express';
import { z } from 'zod';
export const CarePlanGoalCategoryEnum = z.enum([
  'GLUCOSE',
  'HBA1C',
  'BLOOD_PRESSURE',
  'WEIGHT',
  'LIFESTYLE',
  'MEDICATION',
]);

export const CarePlanGoalSchema = z.object({
  id: z.string().uuid().optional(),
  category: CarePlanGoalCategoryEnum.default('GLUCOSE'),
  title: z.string().trim().min(2).max(180),
  targetValue: z.string().trim().min(1).max(100),
  unit: z.string().trim().max(30).optional().nullable(),
  timeframe: z.string().trim().max(50).default('Daily'),
  status: z.enum(['IN_PROGRESS', 'ACHIEVED', 'NEEDS_ATTENTION']).default('IN_PROGRESS'),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const CarePlanActivityCategoryEnum = z.enum([
  'BLOOD_SUGAR_CHECK',
  'MEDICATION',
  'EXERCISE',
  'DIET',
  'FOOT_CARE',
  'CLINICAL_REVIEW',
]);

export const CarePlanActivitySchema = z.object({
  id: z.string().uuid().optional(),
  category: CarePlanActivityCategoryEnum.default('BLOOD_SUGAR_CHECK'),
  title: z.string().trim().min(2).max(180),
  frequency: z.enum(['DAILY', 'TWICE_DAILY', 'WEEKLY', 'AS_NEEDED']).default('DAILY'),
  timing: z.string().trim().max(50).optional().nullable(),
  instructions: z.string().trim().max(1000).optional().nullable(),
  isCaregiverEligible: z.boolean().default(true),
});

export const CreateCarePlanSchema = z.object({
  patientId: z.string().uuid(),
  title: z.string().trim().min(2).max(200),
  diagnosis: z.string().trim().max(200).default('Type 2 Diabetes Mellitus'),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).default([]),
  activities: z.array(CarePlanActivitySchema).default([]),
}).strict();

export const UpdateCarePlanSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  diagnosis: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).optional(),
  activities: z.array(CarePlanActivitySchema).optional(),
}).strict();

export const ReviseCarePlanSchema = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  diagnosis: z.string().trim().max(200).optional(),
  summary: z.string().trim().max(3000).optional().nullable(),
  doctorInstructions: z.string().trim().max(4000).optional().nullable(),
  reviewDate: z.string().datetime().optional().nullable(),
  goals: z.array(CarePlanGoalSchema).optional(),
  activities: z.array(CarePlanActivitySchema).optional(),
  reasonForRevision: z.string().trim().max(500).optional().nullable(),
}).strict();

export const CarePlanApprovalSchema = z.object({
  notes: z.string().trim().max(1000).optional().nullable(),
}).strict();
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { requireClinician } from '../middleware/requireClinician';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
import { prisma } from '../db/prisma';

router.use(requireAuth);

function getActor(req: Request) {
  return (req as AuthenticatedRequest).user;
}

function parsePermissions(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

async function verifyDoctorAssignment(doctorId: string, patientId: string): Promise<boolean> {
  const assignment = await prisma.doctorPatientAssignment.findUnique({
    where: {
      doctorId_patientId: { doctorId, patientId },
    },
  });
  return !!assignment && assignment.status === 'ACTIVE';
}

async function verifyCaregiverPermission(
  patientId: string,
  caregiverEmail: string,
  permission: string
): Promise<boolean> {
  const consent = await prisma.caregiverConsent.findFirst({
    where: {
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });

  if (!consent) return false;
  const permissions = parsePermissions(consent.permissions);
  if (permissions.includes(permission)) return true;
  if (permission === 'VIEW_CARE_PLAN') {
    return permissions.includes('VIEW_TASKS') || permissions.includes('MANAGE_TASKS');
  }
  if (permission === 'VIEW_TASKS' && permissions.includes('MANAGE_TASKS')) {
    return true;
  }
  return false;
}

async function canAccessPatientCarePlan(
  req: Request,
  patientId: string,
  requiredMode: 'READ' | 'WRITE' = 'READ'
): Promise<{ allowed: boolean; reason?: string; isCaregiver?: boolean }> {
  const actor = getActor(req);
  if (!actor) return { allowed: false, reason: 'Authentication required' };

  // 1. Patient accessing their own care plan
  if (actor.id === patientId) {
    if (requiredMode === 'WRITE') {
      return { allowed: false, reason: 'Patients cannot author or approve clinical care plans.' };
    }
    return { allowed: true };
  }

  // 2. Doctor access
  if (actor.isClinician) {
    const isAssigned = await verifyDoctorAssignment(actor.id, patientId);
    if (!isAssigned) {
      return {
        allowed: false,
        reason: 'Doctors may manage care plans only for their active assigned patients.',
      };
    }
    return { allowed: true };
  }

  // 3. Caregiver access
  const hasReadPermission = await verifyCaregiverPermission(
    patientId,
    actor.email,
    'VIEW_CARE_PLAN'
  );

  if (requiredMode === 'WRITE') {
    const hasWritePermission = await verifyCaregiverPermission(
      patientId,
      actor.email,
      'MANAGE_TASKS'
    );
    if (!hasWritePermission) {
      return {
        allowed: false,
        reason: 'Caregivers do not have write or task management permissions for this patient.',
      };
    }
    return { allowed: true, isCaregiver: true };
  }

  if (!hasReadPermission) {
    return {
      allowed: false,
      reason: 'Caregiver consent does not permit viewing this patient’s care plan.',
    };
  }

  return { allowed: true, isCaregiver: true };
}

function mapActivityCategoryToTaskCategory(cat: string): string {
  switch (cat) {
    case 'MEDICATION':
      return 'MEDICATION_REMINDER';
    case 'BLOOD_SUGAR_CHECK':
      return 'FOLLOW_UP';
    case 'EXERCISE':
    case 'DIET':
      return 'LIFESTYLE';
    case 'CLINICAL_REVIEW':
      return 'FOLLOW_UP';
    default:
      return 'FOLLOW_UP';
  }
}

function calculateActivityDueAt(timing?: string | null): Date {
  const d = new Date();
  if (timing === 'MORNING' || timing === 'MORNING_FASTING' || timing === 'BEFORE_BREAKFAST') {
    d.setHours(8, 0, 0, 0);
  } else if (timing === 'AFTERNOON' || timing === 'POST_LUNCH') {
    d.setHours(14, 0, 0, 0);
  } else if (timing === 'EVENING' || timing === 'POST_DINNER') {
    d.setHours(20, 0, 0, 0);
  } else if (timing === 'BEDTIME') {
    d.setHours(22, 0, 0, 0);
  } else {
    d.setHours(10, 0, 0, 0);
  }
  return d;
}

// ------------------------------------------------------
// GET /api/care-plans/patient/:patientId/active
// Retrieve current approved active plan + progress stats
// ------------------------------------------------------
router.get('/patient/:patientId/active', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const access = await canAccessPatientCarePlan(req, patientId, 'READ');
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden' });
      return;
    }

    const carePlan = await prisma.carePlan.findFirst({
      where: {
        patientId,
        status: 'ACTIVE',
      },
      include: {
        goals: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        doctor: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        approver: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: { version: 'desc' },
    });

    if (!carePlan) {
      res.json({ carePlan: null, progress: null });
      return;
    }

    // Compute daily task progress for this active care plan
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const tasks = await prisma.careTask.findMany({
      where: {
        userId: patientId,
        dueAt: { gte: todayStart, lte: todayEnd },
      },
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length;
    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 100;

    res.json({
      carePlan,
      progress: {
        totalTasks,
        completedTasks,
        percentage,
        isAdherent: percentage >= 80,
      },
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to load active care plan' });
  }
});

// ------------------------------------------------------
// GET /api/care-plans/patient/:patientId
// Retrieve all plan versions / drafts for a patient
// ------------------------------------------------------
router.get('/patient/:patientId', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const access = await canAccessPatientCarePlan(req, patientId, 'READ');
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden' });
      return;
    }

    const plans = await prisma.carePlan.findMany({
      where: { patientId },
      include: {
        goals: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        doctor: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        approver: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
      orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
    });

    res.json({ plans });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to retrieve care plan history' });
  }
});

// ------------------------------------------------------
// GET /api/care-plans/:id
// Retrieve specific care plan by ID
// ------------------------------------------------------
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const plan = await prisma.carePlan.findUnique({
      where: { id },
      include: {
        goals: { orderBy: { createdAt: 'asc' } },
        activities: { orderBy: { createdAt: 'asc' } },
        doctor: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
        approver: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    if (!plan) {
      res.status(404).json({ error: 'Care plan not found' });
      return;
    }

    const access = await canAccessPatientCarePlan(req, plan.patientId, 'READ');
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden' });
      return;
    }

    res.json({ plan });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to load care plan' });
  }
});

// ------------------------------------------------------
// POST /api/care-plans
// Doctor creates a new care plan (status: DRAFT)
// ------------------------------------------------------
router.post('/', requireClinician, async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const input = CreateCarePlanSchema.parse(req.body);

    const isAssigned = await verifyDoctorAssignment(actor.id, input.patientId);
    if (!isAssigned) {
      res.status(403).json({
        error: 'Doctors may create care plans only for active assigned patients.',
      });
      return;
    }

    const created = await prisma.$transaction(async (tx) => {
      const plan = await tx.carePlan.create({
        data: {
          patientId: input.patientId,
          doctorId: actor.id,
          title: input.title,
          diagnosis: input.diagnosis || 'Type 2 Diabetes Mellitus',
          summary: input.summary || null,
          doctorInstructions: input.doctorInstructions || null,
          reviewDate: input.reviewDate ? new Date(input.reviewDate) : null,
          status: 'DRAFT',
          version: 1,
          goals: {
            create: input.goals.map((g: any) => ({
              category: g.category || 'GLUCOSE',
              title: g.title,
              targetValue: g.targetValue,
              unit: g.unit || null,
              timeframe: g.timeframe || 'Daily',
              status: g.status || 'IN_PROGRESS',
              notes: g.notes || null,
            })),
          },
          activities: {
            create: input.activities.map((a: any) => ({
              category: a.category || 'BLOOD_SUGAR_CHECK',
              title: a.title,
              frequency: a.frequency || 'DAILY',
              timing: a.timing || 'MORNING',
              instructions: a.instructions || null,
              isCaregiverEligible: a.isCaregiverEligible ?? true,
            })),
          },
        },
        include: {
          goals: true,
          activities: true,
          doctor: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: input.patientId,
          actorId: actor.id,
          action: 'CARE_PLAN_CREATED',
          entityType: 'CarePlan',
          entityId: plan.id,
          metadata: JSON.stringify({ version: plan.version, status: 'DRAFT', title: plan.title }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return plan;
    });

    res.status(201).json({ plan: created });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: error.issues });
      return;
    }
    res.status(500).json({ error: error.message || 'Unable to create care plan' });
  }
});

// ------------------------------------------------------
// PUT /api/care-plans/:id
// Update an existing DRAFT care plan
// Approved plans cannot be directly modified (strict immutability).
// ------------------------------------------------------
router.put('/:id', requireClinician, async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const input = UpdateCarePlanSchema.parse(req.body);

    const existing = await prisma.carePlan.findUnique({
      where: { id },
      include: { goals: true, activities: true },
    });

    if (!existing) {
      res.status(404).json({ error: 'Care plan not found' });
      return;
    }

    if (existing.doctorId !== actor.id) {
      const isAssigned = await verifyDoctorAssignment(actor.id, existing.patientId);
      if (!isAssigned) {
        res.status(403).json({ error: 'You are not authorized to update this patient’s care plan.' });
        return;
      }
    }

    if (existing.status !== 'DRAFT') {
      res.status(409).json({
        error:
          'Approved clinical care plans cannot be directly modified. Create a versioned revision instead.',
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (input.goals !== undefined) {
        await tx.carePlanGoal.deleteMany({ where: { carePlanId: id } });
        if (input.goals.length > 0) {
          await tx.carePlanGoal.createMany({
            data: input.goals.map((g: any) => ({
              carePlanId: id,
              category: g.category || 'GLUCOSE',
              title: g.title,
              targetValue: g.targetValue,
              unit: g.unit || null,
              timeframe: g.timeframe || 'Daily',
              status: g.status || 'IN_PROGRESS',
              notes: g.notes || null,
            })),
          });
        }
      }

      if (input.activities !== undefined) {
        await tx.carePlanActivity.deleteMany({ where: { carePlanId: id } });
        if (input.activities.length > 0) {
          await tx.carePlanActivity.createMany({
            data: input.activities.map((a: any) => ({
              carePlanId: id,
              category: a.category || 'BLOOD_SUGAR_CHECK',
              title: a.title,
              frequency: a.frequency || 'DAILY',
              timing: a.timing || 'MORNING',
              instructions: a.instructions || null,
              isCaregiverEligible: a.isCaregiverEligible ?? true,
            })),
          });
        }
      }

      const plan = await tx.carePlan.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.diagnosis !== undefined ? { diagnosis: input.diagnosis } : {}),
          ...(input.summary !== undefined ? { summary: input.summary } : {}),
          ...(input.doctorInstructions !== undefined
            ? { doctorInstructions: input.doctorInstructions }
            : {}),
          ...(input.reviewDate !== undefined
            ? { reviewDate: input.reviewDate ? new Date(input.reviewDate) : null }
            : {}),
        },
        include: {
          goals: true,
          activities: true,
          doctor: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: plan.patientId,
          actorId: actor.id,
          action: 'CARE_PLAN_DRAFT_UPDATED',
          entityType: 'CarePlan',
          entityId: plan.id,
          metadata: JSON.stringify({ version: plan.version, title: plan.title }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return plan;
    });

    res.json({ plan: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: error.issues });
      return;
    }
    res.status(500).json({ error: error.message || 'Unable to update care plan' });
  }
});

// ------------------------------------------------------
// POST /api/care-plans/:id/approve
// Doctor approves and publishes a care plan.
// Sets status: ACTIVE, supersedes previous active plan,
// generates/syncs corresponding patient care tasks.
// ------------------------------------------------------
router.post('/:id/approve', requireClinician, async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    CarePlanApprovalSchema.parse(req.body || {});

    const plan = await prisma.carePlan.findUnique({
      where: { id },
      include: {
        goals: true,
        activities: true,
      },
    });

    if (!plan) {
      res.status(404).json({ error: 'Care plan not found' });
      return;
    }

    const isAssigned = await verifyDoctorAssignment(actor.id, plan.patientId);
    if (!isAssigned) {
      res.status(403).json({
        error: 'Only assigned clinicians can approve patient care plans.',
      });
      return;
    }

    if (plan.status === 'ACTIVE') {
      res.status(409).json({ error: 'Care plan is already approved and active.' });
      return;
    }

    const approved = await prisma.$transaction(async (tx) => {
      // 1. Supersede any existing active care plan for this patient
      const supersededResult = await tx.carePlan.updateMany({
        where: {
          patientId: plan.patientId,
          status: 'ACTIVE',
        },
        data: {
          status: 'SUPERSEDED',
        },
      });

      // 2. Mark this plan as ACTIVE and record clinical approver
      const result = await tx.carePlan.update({
        where: { id: plan.id },
        data: {
          status: 'ACTIVE',
          approvedById: actor.id,
          approvedAt: new Date(),
        },
        include: {
          goals: true,
          activities: true,
          doctor: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
          approver: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      // 3. Generate CareTasks for patient based on approved activities
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const act of plan.activities) {
        const idempotencyKey = `careplan_${result.id}_act_${act.id}_${todayStr}`;
        const existingTask = await tx.careTask.findUnique({
          where: { idempotencyKey },
        });

        if (!existingTask) {
          await tx.careTask.create({
            data: {
              userId: plan.patientId,
              carePlanId: result.id,
              title: act.title,
              category: mapActivityCategoryToTaskCategory(act.category),
              status: 'PENDING',
              dueAt: calculateActivityDueAt(act.timing),
              idempotencyKey,
            },
          });
        }
      }

      // 4. Audit Log
      await tx.auditLog.create({
        data: {
          userId: plan.patientId,
          actorId: actor.id,
          action: 'CARE_PLAN_APPROVED',
          entityType: 'CarePlan',
          entityId: result.id,
          metadata: JSON.stringify({
            version: result.version,
            title: result.title,
            previousActiveSuperseded: supersededResult.count,
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return result;
    });

    res.json({
      plan: approved,
      message: 'Care plan approved and activated successfully',
    });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: error.issues });
      return;
    }
    res.status(500).json({ error: error.message || 'Unable to approve care plan' });
  }
});

// ------------------------------------------------------
// POST /api/care-plans/:id/revise
// Create a new versioned revision draft (version = current + 1)
// ------------------------------------------------------
router.post('/:id/revise', requireClinician, async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const input = ReviseCarePlanSchema.parse(req.body);

    const basePlan = await prisma.carePlan.findUnique({
      where: { id },
      include: {
        goals: true,
        activities: true,
      },
    });

    if (!basePlan) {
      res.status(404).json({ error: 'Base care plan not found' });
      return;
    }

    const isAssigned = await verifyDoctorAssignment(actor.id, basePlan.patientId);
    if (!isAssigned) {
      res.status(403).json({
        error: 'Only assigned clinicians can revise patient care plans.',
      });
      return;
    }

    // Determine highest existing version for this patient
    const maxVersionPlan = await prisma.carePlan.findFirst({
      where: { patientId: basePlan.patientId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const nextVersion = (maxVersionPlan?.version ?? basePlan.version) + 1;

    const revision = await prisma.$transaction(async (tx) => {
      // Goals to use: newly provided or carry over from base
      const goalsToCreate =
        input.goals !== undefined
          ? input.goals
          : basePlan.goals.map((g) => ({
              category: g.category,
              title: g.title,
              targetValue: g.targetValue,
              unit: g.unit,
              timeframe: g.timeframe,
              status: g.status,
              notes: g.notes,
            }));

      // Activities to use: newly provided or carry over from base
      const activitiesToCreate =
        input.activities !== undefined
          ? input.activities
          : basePlan.activities.map((a) => ({
              category: a.category,
              title: a.title,
              frequency: a.frequency,
              timing: a.timing,
              instructions: a.instructions,
              isCaregiverEligible: a.isCaregiverEligible,
            }));

      const newPlan = await tx.carePlan.create({
        data: {
          patientId: basePlan.patientId,
          doctorId: actor.id,
          title: input.title || basePlan.title,
          diagnosis: input.diagnosis || basePlan.diagnosis,
          summary: input.summary !== undefined ? input.summary : basePlan.summary,
          doctorInstructions:
            input.doctorInstructions !== undefined
              ? input.doctorInstructions
              : basePlan.doctorInstructions,
          reviewDate: input.reviewDate
            ? new Date(input.reviewDate)
            : basePlan.reviewDate,
          status: 'DRAFT',
          version: nextVersion,
          goals: {
            create: goalsToCreate.map((g: any) => ({
              category: g.category || 'GLUCOSE',
              title: g.title,
              targetValue: g.targetValue,
              unit: g.unit || null,
              timeframe: g.timeframe || 'Daily',
              status: g.status || 'IN_PROGRESS',
              notes: g.notes || null,
            })),
          },
          activities: {
            create: activitiesToCreate.map((a: any) => ({
              category: a.category || 'BLOOD_SUGAR_CHECK',
              title: a.title,
              frequency: a.frequency || 'DAILY',
              timing: a.timing || 'MORNING',
              instructions: a.instructions || null,
              isCaregiverEligible: a.isCaregiverEligible ?? true,
            })),
          },
        },
        include: {
          goals: true,
          activities: true,
          doctor: {
            select: {
              id: true,
              email: true,
              profile: { select: { fullName: true } },
            },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: basePlan.patientId,
          actorId: actor.id,
          action: 'CARE_PLAN_REVISION_CREATED',
          entityType: 'CarePlan',
          entityId: newPlan.id,
          metadata: JSON.stringify({
            basePlanId: basePlan.id,
            previousVersion: basePlan.version,
            newVersion: nextVersion,
            reason: input.reasonForRevision || 'Scheduled review revision',
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return newPlan;
    });

    res.status(201).json({ plan: revision });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: error.issues });
      return;
    }
    res.status(500).json({ error: error.message || 'Unable to create plan revision' });
  }
});

// ------------------------------------------------------
// GET /api/care-plans/patient/:patientId/progress
// Comprehensive progress tracking
// ------------------------------------------------------
router.get('/patient/:patientId/progress', async (req: Request, res: Response) => {
  try {
    const { patientId } = req.params;
    const access = await canAccessPatientCarePlan(req, patientId, 'READ');
    if (!access.allowed) {
      res.status(403).json({ error: access.reason || 'Forbidden' });
      return;
    }

    const activePlan = await prisma.carePlan.findFirst({
      where: { patientId, status: 'ACTIVE' },
      include: {
        goals: true,
        activities: true,
      },
      orderBy: { version: 'desc' },
    });

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [todayTasks, recentObservations] = await Promise.all([
      prisma.careTask.findMany({
        where: {
          userId: patientId,
          dueAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
      prisma.healthObservation.findMany({
        where: { userId: patientId },
        orderBy: { observedAt: 'desc' },
        take: 10,
      }),
    ]);

    const total = todayTasks.length;
    const completed = todayTasks.filter((t) => t.status === 'COMPLETED').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 100;

    res.json({
      activePlanTitle: activePlan?.title ?? null,
      version: activePlan?.version ?? null,
      reviewDate: activePlan?.reviewDate ?? null,
      todayTasks: {
        total,
        completed,
        pending: total - completed,
        percentage,
        isAdherent: percentage >= 80,
      },
      goalsCount: activePlan?.goals.length ?? 0,
      activitiesCount: activePlan?.activities.length ?? 0,
      recentObservationsSummary: recentObservations.slice(0, 3).map((obs) => ({
        type: obs.type,
        value: obs.numericValue,
        unit: obs.unit,
        context: obs.context,
        observedAt: obs.observedAt,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to load progress data' });
  }
});

// ------------------------------------------------------
// POST /api/care-plans/tasks/:id/complete
// Allows patient OR authorized caregiver (MANAGE_TASKS)
// to complete a care task with audit attribution.
// ------------------------------------------------------
router.post('/tasks/:id/complete', async (req: Request, res: Response) => {
  try {
    const actor = getActor(req);
    if (!actor) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { id } = req.params;
    const task = await prisma.careTask.findUnique({
      where: { id },
    });

    if (!task) {
      res.status(404).json({ error: 'Task not found' });
      return;
    }

    let isAssistedByCaregiver = false;
    if (actor.id === task.userId) {
      isAssistedByCaregiver = false;
    } else {
      const hasPermission = await verifyCaregiverPermission(task.userId, actor.email, 'MANAGE_TASKS');
      if (!hasPermission) {
        res.status(403).json({ error: 'Forbidden: Requires MANAGE_TASKS caregiver permission' });
        return;
      }
      isAssistedByCaregiver = true;
    }

    const updatedTask = await prisma.$transaction(async (tx) => {
      const result = await tx.careTask.update({
        where: { id: task.id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: actor.id,
          completedByRole: isAssistedByCaregiver ? 'CAREGIVER' : 'PATIENT',
        },
      });

      if (isAssistedByCaregiver) {
        await tx.careNotification.create({
          data: {
            userId: task.userId,
            patientId: task.userId,
            actorId: actor.id,
            type: 'DELEGATED_TASK_COMPLETED',
            title: 'Delegated Task Completed',
            message: `${actor.email} completed "${task.title}" on your behalf.`,
            link: '/tasks',
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: task.userId,
          actorId: actor.id,
          action: isAssistedByCaregiver
            ? 'CARE_TASK_COMPLETED_BY_CAREGIVER'
            : 'CARE_TASK_COMPLETED',
          entityType: 'CareTask',
          entityId: task.id,
          metadata: JSON.stringify({
            title: task.title,
            assistedByCaregiver: isAssistedByCaregiver,
            actorEmail: actor.email,
            completedByRole: isAssistedByCaregiver ? 'CAREGIVER' : 'PATIENT',
          }),
          ipAddress: req.ip,
          userAgent: req.get('user-agent') ?? null,
        },
      });

      return result;
    });

    res.json({
      task: updatedTask,
      message: isAssistedByCaregiver
        ? 'Task completed by authorized caregiver'
        : 'Task marked completed',
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Unable to complete care task' });
  }
});

export default router;
