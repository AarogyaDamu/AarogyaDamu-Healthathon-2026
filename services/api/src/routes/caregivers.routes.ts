import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto, { randomUUID } from 'crypto';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { logAuditEvent } from '../audit/auditLogger';

const router = Router();
import { prisma } from '../db/prisma';

const consentInviteSchema = z.object({
  caregiverEmail: z.string().email(),
  caregiverName: z.string().min(2),
  relationship: z.string(),
  permissions: z.array(z.string()).min(1),
  status: z.enum(['ACTIVE', 'PENDING', 'PENDING_ACCEPTANCE']).optional(),
});

const updatePermissionsSchema = z.object({
  permissions: z.array(z.string()).min(1, 'Select at least one permission'),
});

function parsePermissions(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasPermission(granted: string[], reqPerm: string): boolean {
  if (granted.includes(reqPerm)) return true;
  if (reqPerm === 'COMPLETE_TASKS_ON_BEHALF' && (granted.includes('COMPLETE_TASKS_ON_BEHALF') || granted.includes('MANAGE_TASKS'))) return true;
  if (reqPerm === 'VIEW_TASKS' && (granted.includes('VIEW_TASKS') || granted.includes('MANAGE_TASKS') || granted.includes('COMPLETE_TASKS_ON_BEHALF'))) return true;
  if (reqPerm === 'VIEW_HEALTH_SUMMARY' && (granted.includes('VIEW_HEALTH_SUMMARY') || granted.includes('VIEW_OBSERVATIONS') || granted.includes('MANAGE_OBSERVATIONS'))) return true;
  if (reqPerm === 'VIEW_OBSERVATIONS' && (granted.includes('VIEW_OBSERVATIONS') || granted.includes('VIEW_HEALTH_SUMMARY') || granted.includes('MANAGE_OBSERVATIONS'))) return true;
  if (reqPerm === 'VIEW_MEDICATIONS' && (granted.includes('VIEW_MEDICATIONS') || granted.includes('MANAGE_MEDICATIONS'))) return true;
  if (reqPerm === 'VIEW_MEDICATION_ADHERENCE' && (granted.includes('VIEW_MEDICATION_ADHERENCE') || granted.includes('MANAGE_MEDICATIONS'))) return true;
  if (reqPerm === 'VIEW_APPOINTMENTS' && (granted.includes('VIEW_APPOINTMENTS') || granted.includes('VIEW_CONSULTATIONS') || granted.includes('MANAGE_CONSULTATIONS'))) return true;
  if (reqPerm === 'VIEW_CONSULTATIONS' && (granted.includes('VIEW_CONSULTATIONS') || granted.includes('VIEW_APPOINTMENTS') || granted.includes('MANAGE_CONSULTATIONS'))) return true;
  if (reqPerm === 'VIEW_REPORTS' && (granted.includes('VIEW_REPORTS') || granted.includes('VIEW_DOCUMENTS') || granted.includes('MANAGE_DOCUMENTS'))) return true;
  if (reqPerm === 'VIEW_DOCUMENTS' && (granted.includes('VIEW_DOCUMENTS') || granted.includes('VIEW_REPORTS') || granted.includes('MANAGE_DOCUMENTS'))) return true;
  if (reqPerm === 'VIEW_HEALTH_TIMELINE' && (granted.includes('VIEW_HEALTH_TIMELINE') || granted.includes('VIEW_CARE_PLAN') || granted.includes('MANAGE_CARE_PLAN'))) return true;
  if (reqPerm === 'VIEW_CARE_PLAN' && (granted.includes('VIEW_CARE_PLAN') || granted.includes('VIEW_HEALTH_TIMELINE') || granted.includes('MANAGE_CARE_PLAN'))) return true;
  if (reqPerm.startsWith('VIEW_') && granted.includes(reqPerm.replace('VIEW_', 'MANAGE_'))) return true;
  return false;
}

async function getActiveConsent(patientId: string, caregiverEmail: string) {
  return prisma.caregiverConsent.findFirst({
    where: {
      patientId,
      caregiverEmail,
      status: 'ACTIVE',
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}

// ---------------------------------------------------------------------------
// 1. GET /api/caregivers (or /api/consents)
// List consents given by patient and caregiving relationships for actor
// ---------------------------------------------------------------------------
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
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        patient: {
          select: {
            id: true,
            profile: { select: { fullName: true, diabetesType: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  // Sanitize: do not expose invitationToken or hash in GET response
  const parsed = consents.map((c) => {
    const { invitationToken: _token, ...rest } = c;
    return {
      ...rest,
      permissions: parsePermissions(c.permissions),
      lastAccessedAt: c.lastAccessedAt ? c.lastAccessedAt.toISOString() : null,
      acceptedAt: c.acceptedAt ? c.acceptedAt.toISOString() : null,
    };
  });

  res.json({
    consents: parsed,
    caregivingFor: caregivingFor.map((c) => ({
      consentId: c.id,
      patientId: c.patientId,
      patientName: c.patient.profile?.fullName || 'Patient',
      diabetesType: c.patient.profile?.diabetesType || 'UNKNOWN',
      relationship: c.relationship,
      permissions: parsePermissions(c.permissions),
      lastAccessedAt: c.lastAccessedAt ? c.lastAccessedAt.toISOString() : null,
    })),
  });
});

// ---------------------------------------------------------------------------
// 2. POST /api/caregivers (or /api/consents)
// Patient invites or grants access to a caregiver
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  validateRequest({ body: consentInviteSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const patientId = (req as any).user.id;
    const { caregiverEmail, caregiverName, relationship, permissions, status } = req.body;
    const normalizedCaregiverEmail = caregiverEmail.trim().toLowerCase();
    const activeGrantKey = `${patientId}:${normalizedCaregiverEmail}`;
    const finalStatus = status || 'ACTIVE';
    const rawInvitationToken = randomUUID();
    const hashedInvitationToken = crypto.createHash('sha256').update(rawInvitationToken).digest('hex');
    const defaultExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7-day default expiry

    try {
      // Check if an active grant already exists for this caregiver
      const existingActive = await prisma.caregiverConsent.findFirst({
        where: {
          patientId,
          caregiverEmail: normalizedCaregiverEmail,
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (existingActive) {
        res.status(409).json({
          error: 'An active grant already exists for this caregiver. Revoke it before granting different permissions.',
        });
        return;
      }

      const [, consent] = await prisma.$transaction([
        prisma.caregiverConsent.updateMany({
          where: {
            patientId,
            caregiverEmail: normalizedCaregiverEmail,
            status: 'ACTIVE',
            expiresAt: { lte: new Date() },
          },
          data: { status: 'EXPIRED', activeGrantKey: null },
        }),
        prisma.caregiverConsent.create({
          data: {
            patientId,
            caregiverEmail: normalizedCaregiverEmail,
            activeGrantKey: finalStatus === 'ACTIVE' ? activeGrantKey : undefined,
            caregiverName,
            relationship,
            status: finalStatus,
            invitationToken: finalStatus === 'PENDING' ? hashedInvitationToken : null,
            expiresAt: defaultExpiresAt,
            acceptedAt: finalStatus === 'ACTIVE' ? new Date() : null,
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
        metadata: { caregiverEmail, permissions, status: finalStatus },
      });

      // Notify patient of invitation dispatch
      await prisma.careNotification
        .create({
          data: {
            userId: patientId,
            patientId,
            actorId: patientId,
            type: 'CAREGIVER_INVITE_SENT',
            title: 'Caregiver Invitation Sent',
            message: `Caregiver invitation sent to ${caregiverEmail} with permissions: ${permissions.join(', ')}.`,
            link: '/(tabs)/profile',
          },
        })
        .catch(() => {});

      const caregiverUser = await prisma.user.findUnique({ where: { email: caregiverEmail } });
      if (caregiverUser) {
        await prisma.careNotification
          .create({
            data: {
              userId: caregiverUser.id,
              patientId,
              actorId: patientId,
              type: 'CONSENT_CHANGE',
              title: finalStatus === 'ACTIVE' ? 'Caregiver Access Granted' : 'Caregiver Invitation Received',
              message: `You have been invited with permissions: ${permissions.join(', ')}.`,
              link: '/(caregiver)/index',
            },
          })
          .catch(() => {});
      }

      res.status(201).json({
        consent: {
          ...consent,
          permissions: parsePermissions(consent.permissions),
          invitationToken: finalStatus === 'PENDING' ? rawInvitationToken : null,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        res.status(409).json({
          error: 'An active grant already exists for this caregiver. Revoke it before granting different permissions.',
        });
        return;
      }
      console.error('[consent API] Unable to grant access', error);
      res.status(500).json({ error: 'Unable to grant caregiver access.' });
    }
  }
);

// ---------------------------------------------------------------------------
// 3. PATCH /api/caregivers/:id/permissions
// Patient modifies permissions granted to a caregiver
// ---------------------------------------------------------------------------
router.patch(
  '/:id/permissions',
  requireAuth,
  validateRequest({ body: updatePermissionsSchema }),
  async (req: Request, res: Response): Promise<void> => {
    const patientId = (req as any).user.id;
    const { id } = req.params;
    const { permissions } = req.body;

    const consent = await prisma.caregiverConsent.findFirst({
      where: { id, patientId },
    });

    if (!consent) {
      res.status(404).json({ error: 'Caregiver consent record not found' });
      return;
    }

    if (consent.status !== 'ACTIVE') {
      res.status(400).json({ error: `Cannot modify permissions on a ${consent.status.toLowerCase()} consent.` });
      return;
    }

    const updated = await prisma.caregiverConsent.update({
      where: { id },
      data: {
        permissions: JSON.stringify(permissions),
      },
    });

    await logAuditEvent({
      userId: patientId,
      actorId: patientId,
      action: 'CAREGIVER_PERMISSIONS_UPDATED',
      entityType: 'CaregiverConsent',
      entityId: id,
      metadata: { previous: parsePermissions(consent.permissions), updated: permissions },
    });

    const caregiverUser = await prisma.user.findUnique({ where: { email: consent.caregiverEmail } });
    if (caregiverUser) {
      await prisma.careNotification
        .create({
          data: {
            userId: caregiverUser.id,
            patientId,
            actorId: patientId,
            type: 'CONSENT_CHANGE',
            title: 'Caregiver Permissions Updated',
            message: `Your caregiver permissions have been updated to: ${permissions.join(', ')}.`,
            link: '/(caregiver)/index',
          },
        })
        .catch(() => {});
    }

    res.json({
      success: true,
      consent: {
        ...updated,
        permissions: parsePermissions(updated.permissions),
      },
    });
  }
);

// ---------------------------------------------------------------------------
// 4. GET /api/caregivers/:id/actions
// Patient reviews recent actions performed by the caregiver
// ---------------------------------------------------------------------------
router.get('/:id/actions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const patientId = (req as any).user.id;
  const { id } = req.params;

  const consent = await prisma.caregiverConsent.findFirst({
    where: { id, patientId },
  });

  if (!consent) {
    res.status(404).json({ error: 'Caregiver consent record not found' });
    return;
  }

  const caregiverUser = await prisma.user.findUnique({
    where: { email: consent.caregiverEmail },
  });

  if (!caregiverUser) {
    res.json({
      caregiverName: consent.caregiverName,
      caregiverEmail: consent.caregiverEmail,
      lastAccessedAt: consent.lastAccessedAt,
      actions: [],
    });
    return;
  }

  const [completedTasks, adherenceEvents, auditLogs] = await Promise.all([
    prisma.careTask.findMany({
      where: {
        userId: patientId,
        completedById: caregiverUser.id,
      },
      orderBy: { completedAt: 'desc' },
      take: 25,
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: {
        userId: patientId,
        recordedBy: caregiverUser.id,
      },
      include: {
        medication: { select: { medicineName: true } },
      },
      orderBy: { recordedAt: 'desc' },
      take: 25,
    }),
    prisma.auditLog.findMany({
      where: {
        userId: patientId,
        actorId: caregiverUser.id,
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
  ]);

  const actions: Array<{
    id: string;
    type: 'TASK_COMPLETION' | 'MEDICATION_ADHERENCE' | 'AUDIT_ACTION';
    title: string;
    details: string;
    timestamp: string;
  }> = [];

  for (const t of completedTasks) {
    actions.push({
      id: `task_${t.id}`,
      type: 'TASK_COMPLETION',
      title: `Completed Task: ${t.title}`,
      details: t.clinicalNotes || t.instructions || 'Task marked complete on behalf of patient.',
      timestamp: (t.completedAt || t.updatedAt).toISOString(),
    });
  }

  for (const e of adherenceEvents) {
    actions.push({
      id: `med_${e.id}`,
      type: 'MEDICATION_ADHERENCE',
      title: `Reported Dose ${e.action}: ${e.medication?.medicineName || 'Medication'}`,
      details: e.notes || `Reported ${e.action.toLowerCase()} by caregiver.`,
      timestamp: e.recordedAt.toISOString(),
    });
  }

  for (const a of auditLogs) {
    if (!a.action.startsWith('TASK_') && !a.action.startsWith('MEDICATION_')) {
      actions.push({
        id: `audit_${a.id}`,
        type: 'AUDIT_ACTION',
        title: a.action.replace(/_/g, ' '),
        details: a.metadata ? String(a.metadata) : 'Caregiver platform action',
        timestamp: a.createdAt.toISOString(),
      });
    }
  }

  actions.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({
    caregiverName: consent.caregiverName,
    caregiverEmail: consent.caregiverEmail,
    relationship: consent.relationship,
    lastAccessedAt: consent.lastAccessedAt ? consent.lastAccessedAt.toISOString() : null,
    actions,
  });
});

// ---------------------------------------------------------------------------
// 5. POST /api/caregivers/invitations/:id/accept and /reject
// Caregiver accepts or rejects a pending invitation
// ---------------------------------------------------------------------------
router.post('/invitations/:id/accept', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { id } = req.params;
  const { token } = req.body || {};

  const consent = await prisma.caregiverConsent.findUnique({
    where: { id },
  });

  if (!consent) {
    res.status(404).json({ error: 'Invitation not found.' });
    return;
  }

  // 1. Single-use enforcement: cannot re-accept active grant
  if (consent.status === 'ACTIVE') {
    res.status(400).json({ error: 'This invitation has already been accepted.' });
    return;
  }

  // 2. Revoked grant cannot be accepted
  if (consent.status === 'REVOKED') {
    res.status(400).json({ error: 'Cannot accept a revoked invitation.' });
    return;
  }

  // 3. Expiration enforcement
  if (consent.status === 'EXPIRED' || (consent.expiresAt && new Date(consent.expiresAt) <= new Date())) {
    if (consent.status !== 'EXPIRED') {
      await prisma.caregiverConsent.update({
        where: { id },
        data: { status: 'EXPIRED', activeGrantKey: null },
      });
    }
    res.status(400).json({ error: 'This invitation has expired.' });
    return;
  }

  // 4. Unauthorized email enforcement: only intended recipient can accept
  if (consent.caregiverEmail && consent.caregiverEmail.toLowerCase() !== actor.email.toLowerCase()) {
    res.status(403).json({ error: 'Invitation not addressed to your email.' });
    return;
  }

  // 5. Token validation (SHA-256 hashed comparison)
  if (consent.invitationToken) {
    if (!token) {
      res.status(400).json({ error: 'Invalid invitation token.' });
      return;
    }
    const tokenHash = crypto.createHash('sha256').update(String(token).trim()).digest('hex');
    const isMatch = consent.invitationToken === tokenHash || consent.invitationToken === String(token).trim();
    if (!isMatch) {
      res.status(400).json({ error: 'Invalid invitation token.' });
      return;
    }
  }

  const updated = await prisma.caregiverConsent.update({
    where: { id },
    data: {
      status: 'ACTIVE',
      acceptedAt: new Date(),
      caregiverEmail: actor.email.trim().toLowerCase(),
      activeGrantKey: `${consent.patientId}:${actor.email.trim().toLowerCase()}`,
      invitationToken: null, // Wipe token to ensure single use
    },
  });

  await logAuditEvent({
    userId: consent.patientId,
    actorId: actor.id,
    action: 'CAREGIVER_INVITATION_ACCEPTED',
    entityType: 'CaregiverConsent',
    entityId: id,
    metadata: {
      caregiverEmail: actor.email,
      acceptedAt: new Date().toISOString(),
    },
  });

  res.json({
    success: true,
    message: 'Invitation accepted. You now have caregiver access.',
    consent: {
      ...updated,
      permissions: parsePermissions(updated.permissions),
    },
  });
});

router.post('/invitations/:id/reject', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { id } = req.params;

  const consent = await prisma.caregiverConsent.findFirst({
    where: { id, caregiverEmail: actor.email },
  });

  if (!consent) {
    res.status(404).json({ error: 'Invitation not found or not addressed to your email.' });
    return;
  }

  await prisma.caregiverConsent.update({
    where: { id },
    data: { status: 'REJECTED', activeGrantKey: null },
  });

  await logAuditEvent({
    userId: consent.patientId,
    actorId: actor.id,
    action: 'CAREGIVER_INVITATION_REJECTED',
    entityType: 'CaregiverConsent',
    entityId: id,
  });

  res.json({ success: true, message: 'Invitation declined.' });
});

// ---------------------------------------------------------------------------
// 6. DELETE /api/caregivers/:id
// Patient revokes caregiver consent
// ---------------------------------------------------------------------------
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
    data: {
      status: 'REVOKED',
      activeGrantKey: null,
      invitationToken: null,
    },
  });

  await logAuditEvent({
    userId: patientId,
    actorId: patientId,
    action: 'CAREGIVER_CONSENT_REVOKED',
    entityType: 'CaregiverConsent',
    entityId: id,
    metadata: {
      caregiverEmail: consent.caregiverEmail,
      revokedPermissions: parsePermissions(consent.permissions),
      revokedAt: new Date().toISOString(),
    },
  });

  const caregiverUser = await prisma.user.findUnique({ where: { email: consent.caregiverEmail } });
  if (caregiverUser) {
    await prisma.careNotification
      .create({
        data: {
          userId: caregiverUser.id,
          patientId,
          actorId: patientId,
          type: 'CONSENT_CHANGE',
          title: 'Caregiver Access Revoked',
          message: 'Caregiver access delegation has been revoked by the patient.',
          link: '/(caregiver)/index',
        },
      })
      .catch(() => {});
  }

  res.json({ success: true, message: 'Caregiver access revoked' });
});

// ===========================================================================
// DEDICATED CAREGIVER WORKSPACE ENDPOINTS
// ===========================================================================

// ---------------------------------------------------------------------------
// 7. GET /api/caregivers/patients
// Caregiver retrieves all linked patients who have granted active consent
// ---------------------------------------------------------------------------
router.get('/patients', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;

  try {
    const consents = await prisma.caregiverConsent.findMany({
      where: {
        caregiverEmail: actor.email,
        status: 'ACTIVE',
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: {
              select: {
                fullName: true,
                diabetesType: true,
                dateOfBirth: true,
                emergencyContactName: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      patients: consents.map((c) => ({
        consentId: c.id,
        patientId: c.patientId,
        name: c.patient.profile?.fullName || c.caregiverName || 'Patient',
        diabetesType: c.patient.profile?.diabetesType || 'TYPE_2_DIABETES',
        relationship: c.relationship,
        permissions: parsePermissions(c.permissions),
        lastAccessedAt: c.lastAccessedAt ? c.lastAccessedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    console.error('[Caregiver patients list] Error:', error);
    res.status(500).json({ error: 'Unable to retrieve authorized patients.' });
  }
});

// ---------------------------------------------------------------------------
// 8. GET /api/caregivers/patients/:patientId/dashboard
// Dedicated dashboard payload scoped strictly to granted permissions
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/dashboard', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  // Update last access timestamp
  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const permissions = parsePermissions(consent.permissions);

  // Fetch patient profile
  const patient = await prisma.user.findUnique({
    where: { id: patientId },
    select: {
      id: true,
      profile: {
        select: {
          fullName: true,
          diabetesType: true,
        },
      },
    },
  });

  const responsePayload: any = {
    patient: {
      id: patientId,
      name: patient?.profile?.fullName || consent.caregiverName || 'Patient',
      diabetesType: patient?.profile?.diabetesType || 'TYPE_2_DIABETES',
      relationship: consent.relationship,
      permissions,
      lastAccessedAt: consent.lastAccessedAt ? consent.lastAccessedAt.toISOString() : null,
    },
    tasks: null,
    medications: null,
    adherence: null,
    healthSummary: null,
    appointments: null,
    recentActions: [],
  };

  const queries: Promise<any>[] = [];

  // 1. Tasks
  if (hasPermission(permissions, 'VIEW_TASKS')) {
    queries.push(
      prisma.careTask
        .findMany({
          where: { userId: patientId },
          orderBy: { dueAt: 'asc' },
          take: 20,
        })
        .then((tasks) => {
          const now = new Date();
          const pending = tasks.filter((t) => t.status === 'PENDING' && new Date(t.dueAt) >= now);
          const overdue = tasks.filter((t) => t.status === 'PENDING' && new Date(t.dueAt) < now);
          const completed = tasks.filter((t) => t.status === 'COMPLETED');
          const canComplete = hasPermission(permissions, 'COMPLETE_TASKS_ON_BEHALF');

          responsePayload.tasks = {
            summary: {
              total: tasks.length,
              pendingCount: pending.length,
              overdueCount: overdue.length,
              completedCount: completed.length,
              canCompleteOnBehalf: canComplete,
            },
            items: tasks.slice(0, 10).map((t) => ({
              id: t.id,
              title: t.title,
              category: t.category,
              priority: t.priority,
              status: t.status === 'PENDING' && new Date(t.dueAt) < now ? 'OVERDUE' : t.status,
              dueAt: t.dueAt.toISOString(),
              instructions: t.instructions,
              canComplete: canComplete && t.status === 'PENDING',
              completedAt: t.completedAt ? t.completedAt.toISOString() : null,
              completedByRole: t.completedByRole,
            })),
          };
        })
    );
  }

  // 2. Medications
  if (hasPermission(permissions, 'VIEW_MEDICATIONS')) {
    queries.push(
      prisma.medicationSchedule
        .findMany({
          where: { userId: patientId, status: 'ACTIVE' },
          orderBy: { createdAt: 'desc' },
        })
        .then((meds) => {
          responsePayload.medications = {
            activeCount: meds.length,
            items: meds.map((m) => ({
              id: m.id,
              medicineName: m.medicineName || m.medicationName || 'Medication',
              dosage: m.dosage,
              strength: m.strength,
              frequency: m.frequency,
              timing: m.timing,
              instructions: m.instructions || m.dosageInstruction,
              status: m.status,
            })),
          };
        })
    );
  }

  // 3. Adherence Stats
  if (hasPermission(permissions, 'VIEW_MEDICATION_ADHERENCE')) {
    queries.push(
      prisma.medicationAdherenceEvent
        .findMany({
          where: {
            userId: patientId,
            recordedAt: { gte: new Date(Date.now() - 14 * 86400000) },
          },
        })
        .then((events) => {
          const taken = events.filter((e) => e.action === 'TAKEN').length;
          const skipped = events.filter((e) => e.action === 'SKIPPED').length;
          const total = events.length;
          const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

          responsePayload.adherence = {
            periodDays: 14,
            totalEvents: total,
            takenCount: taken,
            skippedCount: skipped,
            adherenceRate,
          };
        })
    );
  }

  // 4. Health Summary (Glucose)
  if (hasPermission(permissions, 'VIEW_HEALTH_SUMMARY')) {
    queries.push(
      prisma.healthObservation
        .findMany({
          where: { userId: patientId },
          orderBy: { observedAt: 'desc' },
          take: 10,
        })
        .then((obs) => {
          const latest = obs[0];
          const glucoseObs = obs.filter((o) => o.type === 'BLOOD_GLUCOSE' || o.type === 'SUGAR' || o.unit === 'mg/dL');
          const avg = glucoseObs.length > 0
            ? Math.round(glucoseObs.reduce((sum, o) => sum + o.numericValue, 0) / glucoseObs.length)
            : null;

          responsePayload.healthSummary = {
            latestReading: latest
              ? {
                  numericValue: latest.numericValue,
                  unit: latest.unit,
                  context: latest.context,
                  observedAt: latest.observedAt.toISOString(),
                }
              : null,
            averageGlucose: avg,
            totalReadings: obs.length,
          };
        })
    );
  }

  // 5. Appointments
  if (hasPermission(permissions, 'VIEW_APPOINTMENTS')) {
    queries.push(
      prisma.appointment
        .findMany({
          where: {
            patientId,
            scheduledAt: { gte: new Date(Date.now() - 86400000) },
          },
          include: {
            doctor: {
              select: {
                id: true,
                profile: { select: { fullName: true } },
              },
            },
          },
          orderBy: { scheduledAt: 'asc' },
          take: 5,
        })
        .then((appts) => {
          responsePayload.appointments = appts.map((a) => ({
            id: a.id,
            doctorName: a.doctor?.profile?.fullName || 'Doctor',
            scheduledAt: a.scheduledAt.toISOString(),
            status: a.status,
            reason: a.reason,
            visitType: a.visitType,
          }));
        })
    );
  }

  // 6. Recent Caregiver Actions
  queries.push(
    prisma.careTask
      .findMany({
        where: {
          userId: patientId,
          completedById: actor.id,
        },
        orderBy: { completedAt: 'desc' },
        take: 5,
      })
      .then((tasks) => {
        responsePayload.recentActions = tasks.map((t) => ({
          id: t.id,
          title: t.title,
          action: 'COMPLETED_TASK',
          completedAt: t.completedAt ? t.completedAt.toISOString() : t.updatedAt.toISOString(),
        }));
      })
  );

  await Promise.all(queries);
  res.json(responsePayload);
});

// ---------------------------------------------------------------------------
// 9. GET /api/caregivers/patients/:patientId/tasks
// Caregiver views tasks for patient
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/tasks', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_TASKS')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_TASKS]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const canComplete = hasPermission(permissions, 'COMPLETE_TASKS_ON_BEHALF');

  const tasks = await prisma.careTask.findMany({
    where: { userId: patientId },
    include: {
      assignedBy: {
        select: {
          id: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
  });

  const now = new Date();
  res.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: t.status === 'PENDING' && new Date(t.dueAt) < now ? 'OVERDUE' : t.status,
      dueAt: t.dueAt.toISOString(),
      instructions: t.instructions,
      clinicalNotes: t.clinicalNotes,
      assignedByDoctor: t.assignedBy?.profile?.fullName || null,
      canComplete: canComplete && t.status === 'PENDING',
      completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      completedByRole: t.completedByRole,
    })),
  });
});

// ---------------------------------------------------------------------------
// 10. POST /api/caregivers/patients/:patientId/tasks/:taskId/complete
// Caregiver completes a task on behalf of patient
// ---------------------------------------------------------------------------
router.post('/patients/:patientId/tasks/:taskId/complete', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId, taskId } = req.params;
  const { notes } = req.body || {};

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'COMPLETE_TASKS_ON_BEHALF')) {
    res.status(403).json({ error: 'Forbidden: Requires COMPLETE_TASKS_ON_BEHALF caregiver permission' });
    return;
  }

  const task = await prisma.careTask.findFirst({
    where: { id: taskId, userId: patientId },
  });

  if (!task) {
    res.status(404).json({ error: 'Care task not found for this patient' });
    return;
  }

  if (task.status === 'COMPLETED') {
    res.json({ success: true, replayed: true, task });
    return;
  }

  const updatedTask = await prisma.careTask.update({
    where: { id: taskId },
    data: {
      status: 'COMPLETED',
      completedAt: new Date(),
      completedById: actor.id,
      completedByRole: 'CAREGIVER',
      clinicalNotes: notes ? (task.clinicalNotes ? `${task.clinicalNotes} | Caregiver note: ${notes}` : `Caregiver note: ${notes}`) : task.clinicalNotes,
    },
  });

  await logAuditEvent({
    userId: patientId,
    actorId: actor.id,
    action: 'TASK_COMPLETED_BY_CAREGIVER',
    entityType: 'CareTask',
    entityId: taskId,
    metadata: {
      taskId,
      caregiverEmail: actor.email,
      permissionUsed: 'COMPLETE_TASKS_ON_BEHALF',
      notes,
    },
  });

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  res.json({ success: true, task: updatedTask });
});

// ---------------------------------------------------------------------------
// 11. GET /api/caregivers/patients/:patientId/medications
// Caregiver views doctor-prescribed medications
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/medications', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_MEDICATIONS')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_MEDICATIONS]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const medications = await prisma.medicationSchedule.findMany({
    where: { userId: patientId },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    medications: medications.map((m) => ({
      id: m.id,
      medicineName: m.medicineName || m.medicationName || 'Medication',
      genericName: m.genericName,
      dosage: m.dosage,
      strength: m.strength,
      frequency: m.frequency,
      timing: m.timing,
      instructions: m.instructions || m.dosageInstruction,
      foodInstructions: m.foodInstructions,
      status: m.status,
      prescribedAt: m.createdAt.toISOString(),
    })),
  });
});

// ---------------------------------------------------------------------------
// 12. GET /api/caregivers/patients/:patientId/health
// Caregiver views health readings & overview
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/health', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_HEALTH_SUMMARY')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_HEALTH_SUMMARY]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const observations = await prisma.healthObservation.findMany({
    where: { userId: patientId },
    orderBy: { observedAt: 'desc' },
    take: 30,
  });

  const glucoseObs = observations.filter((o) => o.type === 'BLOOD_GLUCOSE' || o.type === 'SUGAR' || o.unit === 'mg/dL');
  const avg = glucoseObs.length > 0
    ? Math.round(glucoseObs.reduce((sum, o) => sum + o.numericValue, 0) / glucoseObs.length)
    : 0;

  const inRange = glucoseObs.filter((o) => o.numericValue >= 70 && o.numericValue <= 180).length;
  const tirPercent = glucoseObs.length > 0 ? Math.round((inRange / glucoseObs.length) * 100) : 100;

  res.json({
    observations: observations.map((o) => ({
      id: o.id,
      type: o.type,
      numericValue: o.numericValue,
      unit: o.unit,
      context: o.context,
      observedAt: o.observedAt.toISOString(),
      clinicalFlag: o.clinicalFlag,
    })),
    stats: {
      totalReadings: observations.length,
      averageGlucose: avg,
      timeInRangePercentage: tirPercent,
    },
  });
});

// ---------------------------------------------------------------------------
// 13. GET /api/caregivers/patients/:patientId/medications/adherence
// Caregiver views medication adherence events & statistics (VIEW_MEDICATION_ADHERENCE)
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/medications/adherence', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_MEDICATION_ADHERENCE')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_MEDICATION_ADHERENCE]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const events = await prisma.medicationAdherenceEvent.findMany({
    where: { userId: patientId },
    include: {
      medication: {
        select: {
          id: true,
          medicineName: true,
          dosage: true,
          frequency: true,
        },
      },
    },
    orderBy: { recordedAt: 'desc' },
    take: 50,
  });

  const taken = events.filter((e) => e.action === 'TAKEN').length;
  const skipped = events.filter((e) => e.action === 'SKIPPED').length;
  const total = events.length;
  const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

  res.json({
    adherence: {
      stats: {
        totalEvents: total,
        takenCount: taken,
        skippedCount: skipped,
        adherenceRate,
      },
      events: events.map((e) => ({
        id: e.id,
        medicationId: e.medicationId,
        medicationName: e.medication?.medicineName || 'Medication',
        dosage: e.medication?.dosage || '',
        action: e.action,
        scheduledTime: e.scheduledTime ? e.scheduledTime.toISOString() : null,
        recordedAt: e.recordedAt.toISOString(),
        recordedBy: e.recordedBy,
        notes: e.notes,
      })),
    },
  });
});

// ---------------------------------------------------------------------------
// 14. GET /api/caregivers/patients/:patientId/appointments
// Caregiver views scheduled doctor appointments (VIEW_APPOINTMENTS)
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/appointments', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_APPOINTMENTS')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_APPOINTMENTS]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const appointments = await prisma.appointment.findMany({
    where: { patientId },
    include: {
      doctor: {
        select: {
          id: true,
          profile: { select: { fullName: true } },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
  });

  res.json({
    appointments: appointments.map((a) => ({
      id: a.id,
      doctorName: a.doctor?.profile?.fullName || 'Doctor',
      scheduledAt: a.scheduledAt.toISOString(),
      durationMinutes: a.durationMinutes,
      status: a.status,
      reason: a.reason,
      visitType: a.visitType,
      clinicName: a.clinicName || 'Apollo Sugar Clinic, Pune',
      notes: a.notes,
    })),
  });
});

// ---------------------------------------------------------------------------
// 15. GET /api/caregivers/patients/:patientId/reports
// Caregiver views clinical reports and lab documents (VIEW_REPORTS)
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/reports', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_REPORTS')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_REPORTS]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const reports = await prisma.healthDocument.findMany({
    where: { userId: patientId },
    orderBy: { reportDate: 'desc' },
  });

  res.json({
    reports: reports.map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      issuingFacility: r.issuingFacility,
      reportDate: r.reportDate.toISOString(),
      notes: r.notes,
      processingStatus: r.processingStatus,
      mimeType: r.mimeType,
      fileSizeBytes: r.fileSizeBytes,
    })),
  });
});

// ---------------------------------------------------------------------------
// 16. GET /api/caregivers/patients/:patientId/timeline
// Caregiver views consolidated health timeline (VIEW_HEALTH_TIMELINE)
// ---------------------------------------------------------------------------
router.get('/patients/:patientId/timeline', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const actor = (req as any).user;
  const { patientId } = req.params;

  const consent = await getActiveConsent(patientId, actor.email);
  if (!consent) {
    res.status(403).json({ error: 'Forbidden: No active caregiver consent for this patient.' });
    return;
  }

  const permissions = parsePermissions(consent.permissions);
  if (!hasPermission(permissions, 'VIEW_HEALTH_TIMELINE')) {
    res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_HEALTH_TIMELINE]' });
    return;
  }

  void prisma.caregiverConsent.update({
    where: { id: consent.id },
    data: { lastAccessedAt: new Date() },
  }).catch(() => {});

  const [obs, tasks, adherence] = await Promise.all([
    prisma.healthObservation.findMany({
      where: { userId: patientId },
      orderBy: { observedAt: 'desc' },
      take: 20,
    }),
    prisma.careTask.findMany({
      where: { userId: patientId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      take: 20,
    }),
    prisma.medicationAdherenceEvent.findMany({
      where: { userId: patientId },
      include: { medication: { select: { medicineName: true } } },
      orderBy: { recordedAt: 'desc' },
      take: 20,
    }),
  ]);

  const timelineEvents: Array<{
    id: string;
    type: 'OBSERVATION' | 'TASK' | 'MEDICATION';
    title: string;
    details: string;
    timestamp: string;
  }> = [];

  for (const o of obs) {
    timelineEvents.push({
      id: o.id,
      type: 'OBSERVATION',
      title: `${o.type}: ${o.numericValue} ${o.unit}`,
      details: o.context ? `Context: ${o.context}` : 'Health observation recorded',
      timestamp: o.observedAt.toISOString(),
    });
  }

  for (const t of tasks) {
    timelineEvents.push({
      id: t.id,
      type: 'TASK',
      title: `Completed: ${t.title}`,
      details: t.instructions || 'Task completed',
      timestamp: t.completedAt ? t.completedAt.toISOString() : t.updatedAt.toISOString(),
    });
  }

  for (const a of adherence) {
    timelineEvents.push({
      id: a.id,
      type: 'MEDICATION',
      title: `${a.action}: ${a.medication?.medicineName || 'Medication'}`,
      details: a.notes ? `Note: ${a.notes}` : `Medication dose ${a.action.toLowerCase()}`,
      timestamp: a.recordedAt.toISOString(),
    });
  }

  timelineEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  res.json({
    timeline: timelineEvents.slice(0, 30),
  });
});

export default router;
