import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { requireClinician } from '../middleware/requireClinician';
import { requireFeature } from '../middleware/requireFeature';
import { resolvePatientContext } from '../permissions/evaluator';
import { logClinicalAccessEvent, logClinicalMutationEvent } from '../audit/clinicalAuditLogger';
import {
  MedicationCreateSchema,
  MedicationUpdateSchema,
  MedicationReviewSchema,
  MedicationAdherenceEventSchema,
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
  if (msg.includes('Authentication required') || msg.includes('jwt') || msg.includes('token')) return 401;
  return 500;
}

// All medication vault endpoints require active authentication and feature flag
router.use(requireAuth);
router.use(requireFeature('P0_2_MEDICATION_VAULT'));

// =========================================================================
// A. ADHERENCE AGGREGATE STATS (Must precede /:id)
// =========================================================================
router.get('/adherence/stats', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_MEDICATIONS');
    const days = Math.max(1, Math.min(parseInt(req.query.days as string, 10) || 14, 90));
    const cutoffDate = new Date(Date.now() - days * 86400000);

    const [events, activeMedicationsCount] = await Promise.all([
      prisma.medicationAdherenceEvent.findMany({
        where: {
          userId: effectivePatientId,
          recordedAt: { gte: cutoffDate },
        },
      }),
      prisma.medicationSchedule.count({
        where: {
          userId: effectivePatientId,
          status: 'ACTIVE',
        },
      }),
    ]);

    const totalEvents = events.length;
    const takenCount = events.filter((e) => e.action === 'TAKEN').length;
    const skippedCount = events.filter((e) => e.action === 'SKIPPED').length;
    const missedCount = events.filter((e) => e.action === 'MISSED').length;
    const adherenceRate = totalEvents > 0 ? Math.round((takenCount / totalEvents) * 100) : 100;

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalAccessEvent({
      userId: effectivePatientId,
      actorId,
      action: 'VIEW_MEDICATIONS',
      entityType: 'MedicationAdherenceStats',
      metadata: { days, totalEvents, adherenceRate },
      ipAddress: req.ip,
    });

    res.json({
      stats: {
        days,
        periodDays: days,
        totalEvents,
        takenCount,
        skippedCount,
        missedCount,
        adherenceRate,
        activeMedicationsCount,
      },
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// B. LIST PATIENT MEDICATIONS
// =========================================================================
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_MEDICATIONS');
    const statusFilter = req.query.status as string | undefined;
    const reviewStatusFilter = req.query.reviewStatus as string | undefined;

    const whereClause: any = { userId: effectivePatientId };
    if (statusFilter && statusFilter !== 'ALL') {
      whereClause.status = statusFilter.toUpperCase();
    }
    if (reviewStatusFilter && reviewStatusFilter !== 'ALL') {
      whereClause.reviewStatus = reviewStatusFilter.toUpperCase();
    }

    const medications = await prisma.medicationSchedule.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        adherenceEvents: {
          take: 10,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    const actorId = (req as any).user?.id || effectivePatientId;
    void logClinicalAccessEvent({
      userId: effectivePatientId,
      actorId,
      action: 'VIEW_MEDICATIONS',
      entityType: 'MedicationSchedule',
      metadata: { count: medications.length, statusFilter, reviewStatusFilter },
      ipAddress: req.ip,
    });

    res.json({ medications });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// C. GET SINGLE MEDICATION
// =========================================================================
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const medication = await prisma.medicationSchedule.findUnique({
      where: { id },
      include: {
        adherenceEvents: {
          take: 20,
          orderBy: { recordedAt: 'desc' },
        },
      },
    });

    if (!medication) {
      res.status(404).json({ error: 'Medication record not found.' });
      return;
    }

    const authenticatedUserId = (req as any).user.id;
    const isClinician = Boolean((req as any).user?.isClinician);

    if (authenticatedUserId === medication.userId) {
      // Patient viewing own medication
    } else if (isClinician) {
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: authenticatedUserId,
            patientId: medication.userId,
          },
        },
      });
      if (!assignment || assignment.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Forbidden: Clinician is not actively assigned to this patient.' });
        return;
      }
    } else {
      // Caregiver check
      const caregiverUser = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { email: true },
      });
      const consent = await prisma.caregiverConsent.findFirst({
        where: {
          patientId: medication.userId,
          caregiverEmail: caregiverUser?.email || '',
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!consent) {
        // Obscure existence across unauthorized patients (anti-IDOR)
        res.status(404).json({ error: 'Medication record not found.' });
        return;
      }
      const grantedPermissions: string[] = JSON.parse(consent.permissions || '[]');
      if (!grantedPermissions.includes('VIEW_MEDICATIONS') && !grantedPermissions.includes('MANAGE_MEDICATIONS')) {
        res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [VIEW_MEDICATIONS]' });
        return;
      }
    }

    res.json({ medication });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// D. PRESCRIBE MEDICATION (STRICTLY CLINICIAN ONLY)
// =========================================================================
const handlePrescribeMedication = async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.isClinician) {
      res.status(403).json({
        error: 'Forbidden: Prescriptions can only be created by an authorized clinician.',
      });
      return;
    }

    const targetPatientId = (req.headers['x-target-patient-id'] as string) || req.body?.patientId;
    if (!targetPatientId || targetPatientId === user.id) {
      res.status(400).json({
        error: 'A valid target patient ID is required to issue a clinical prescription.',
      });
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
        error: 'Forbidden: Clinician is not actively assigned to this patient.',
      });
      return;
    }

    // Validate body
    const parsed = MedicationCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid medication parameters',
        details: parsed.error.issues,
      });
      return;
    }

    const {
      medicineName,
      medicationName,
      genericName,
      brandName,
      dosage,
      strength,
      dosageForm,
      route,
      frequency,
      timing,
      foodInstructions,
      instructions,
      isPrn,
      prnInstructions,
      prescriber,
      notes,
      startDate,
      endDate,
    } = parsed.data;

    const doctorUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { profile: true },
    });
    const doctorDisplayName = doctorUser?.profile?.fullName ? `Dr. ${doctorUser.profile.fullName}` : 'Attending Clinician';

    const displayName = medicineName || medicationName || '';
    const medication = await prisma.medicationSchedule.create({
      data: {
        userId: targetPatientId,
        medicineName: displayName,
        medicationName: displayName,
        genericName: genericName || undefined,
        brandName: brandName || undefined,
        dosage,
        dosageInstruction: instructions || `${dosage} ${frequency} (${timing})`,
        strength: strength || undefined,
        dosageForm: dosageForm || 'TABLET',
        route: route || 'ORAL',
        frequency: frequency || 'ONCE_DAILY',
        timing: timing || 'MORNING',
        foodInstructions: foodInstructions || undefined,
        instructions: instructions || undefined,
        isPrn: Boolean(isPrn),
        prnInstructions: prnInstructions || undefined,
        prescriber: prescriber || doctorDisplayName,
        source: 'CLINICIAN_PRESCRIBED',
        status: 'ACTIVE',
        reviewStatus: 'CLINICIAN_REVIEWED',
        reviewedByClinicianId: user.id,
        reviewedAt: new Date(),
        clinicalReviewNotes: 'Prescribed during clinical consultation',
        notes: notes || undefined,
        startDate: startDate ? new Date(startDate) : new Date(),
        endDate: endDate ? new Date(endDate) : undefined,
        isActive: true,
      },
    });

    // Dispatch CareNotification to the target patient
    try {
      await prisma.careNotification.create({
        data: {
          userId: targetPatientId,
          patientId: targetPatientId,
          actorId: user.id,
          type: 'PRESCRIPTION_ISSUED',
          category: 'MEDICATION',
          title: 'New Prescription Issued',
          message: `${doctorDisplayName} has prescribed ${displayName} (${dosage}).`,
          link: '/(tabs)/medications',
        },
      });
    } catch (notifErr) {
      console.warn('[Medications] Failed to create notification:', notifErr);
    }

    void logClinicalMutationEvent({
      userId: targetPatientId,
      actorId: user.id,
      action: 'MEDICATION_PRESCRIBED',
      entityType: 'MedicationSchedule',
      entityId: medication.id,
      metadata: {
        medicineName: displayName,
        dosage,
        source: 'CLINICIAN_PRESCRIBED',
        reviewStatus: 'CLINICIAN_REVIEWED',
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ medication });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
};

router.post('/', handlePrescribeMedication);
router.post('/prescribe', handlePrescribeMedication);

// =========================================================================
// E. UPDATE / DISCONTINUE MEDICATION (STRICTLY CLINICIAN ONLY)
// =========================================================================
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    if (!user?.isClinician) {
      res.status(403).json({
        error: 'Forbidden: Prescriptions can only be modified or discontinued by an authorized clinician.',
      });
      return;
    }

    const { id } = req.params;
    const existing = await prisma.medicationSchedule.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Medication record not found.' });
      return;
    }

    // Verify active doctor-patient assignment
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
      });
      return;
    }

    const parsed = MedicationUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid medication update parameters',
        details: parsed.error.issues,
      });
      return;
    }

    const {
      dosage,
      strength,
      dosageForm,
      route,
      frequency,
      timing,
      foodInstructions,
      instructions,
      isPrn,
      prnInstructions,
      notes,
      status,
      reasonForChange,
      endDate,
    } = parsed.data;

    // Safety guard: status changes to PAUSED or DISCONTINUED require reasonForChange
    if ((status === 'PAUSED' || status === 'DISCONTINUED') && (!reasonForChange || reasonForChange.trim().length < 2)) {
      res.status(400).json({
        error: 'A reasonForChange is required when pausing or discontinuing medication.',
      });
      return;
    }

    const targetStatus = status || existing.status;
    const isActive = targetStatus === 'ACTIVE';

    const updated = await prisma.medicationSchedule.update({
      where: { id },
      data: {
        dosage: dosage !== undefined ? dosage : existing.dosage,
        strength: strength !== undefined ? strength : existing.strength,
        dosageForm: dosageForm !== undefined ? dosageForm : existing.dosageForm,
        route: route !== undefined ? route : existing.route,
        frequency: frequency !== undefined ? frequency : existing.frequency,
        timing: timing !== undefined ? timing : existing.timing,
        foodInstructions: foodInstructions !== undefined ? foodInstructions : existing.foodInstructions,
        instructions: instructions !== undefined ? instructions : existing.instructions,
        isPrn: isPrn !== undefined ? isPrn : existing.isPrn,
        prnInstructions: prnInstructions !== undefined ? prnInstructions : existing.prnInstructions,
        notes: notes !== undefined ? notes : existing.notes,
        status: targetStatus,
        reasonForChange: reasonForChange !== undefined ? reasonForChange : existing.reasonForChange,
        endDate: endDate ? new Date(endDate) : existing.endDate,
        isActive,
      },
    });

    // Notify patient
    try {
      await prisma.careNotification.create({
        data: {
          userId: existing.userId,
          patientId: existing.userId,
          actorId: user.id,
          type: targetStatus === 'DISCONTINUED' ? 'PRESCRIPTION_DISCONTINUED' : 'PRESCRIPTION_MODIFIED',
          category: 'MEDICATION',
          title: targetStatus === 'DISCONTINUED' ? 'Prescription Discontinued' : 'Prescription Updated',
          message: `Your prescription for ${existing.medicineName} has been ${targetStatus.toLowerCase()} by your clinician.`,
          link: '/(tabs)/medications',
        },
      });
    } catch (notifErr) {
      console.warn('[Medications] Failed to create notification on update:', notifErr);
    }

    void logClinicalMutationEvent({
      userId: existing.userId,
      actorId: user.id,
      action: 'MEDICATION_UPDATED',
      entityType: 'MedicationSchedule',
      entityId: id,
      metadata: {
        priorStatus: existing.status,
        newStatus: targetStatus,
        reasonForChange,
      },
      ipAddress: req.ip,
    });

    res.json({ medication: updated });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// F. CLINICIAN MEDICATION RECONCILIATION & REVIEW
// =========================================================================
router.post('/:id/review', requireClinician, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = (req as any).user;
    const { id } = req.params;

    const existing = await prisma.medicationSchedule.findUnique({
      where: { id },
    });

    if (!existing) {
      res.status(404).json({ error: 'Medication record not found.' });
      return;
    }

    // Verify active doctor-patient assignment
    const assignment = await prisma.doctorPatientAssignment.findUnique({
      where: {
        doctorId_patientId: {
          doctorId: user.id,
          patientId: existing.userId,
        },
      },
    });

    if (!assignment || assignment.status !== 'ACTIVE') {
      res.status(403).json({ error: 'Forbidden: Clinician is not actively assigned to this patient.' });
      return;
    }

    const parsed = MedicationReviewSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid clinical review parameters',
        details: parsed.error.issues,
      });
      return;
    }

    const { clinicalReviewNotes, instructions, dosage, status } = parsed.data;

    const updated = await prisma.medicationSchedule.update({
      where: { id },
      data: {
        reviewStatus: 'CLINICIAN_REVIEWED',
        reviewedByClinicianId: user.id,
        reviewedAt: new Date(),
        clinicalReviewNotes,
        instructions: instructions !== undefined ? instructions : existing.instructions,
        dosage: dosage !== undefined ? dosage : existing.dosage,
        status: status !== undefined ? status : existing.status,
        isActive: status ? status === 'ACTIVE' : existing.isActive,
      },
    });

    void logClinicalMutationEvent({
      userId: existing.userId,
      actorId: user.id,
      action: 'MEDICATION_REVIEWED',
      entityType: 'MedicationSchedule',
      entityId: id,
      metadata: {
        reviewedBy: user.id,
        clinicalReviewNotes,
      },
      ipAddress: req.ip,
    });

    res.json({
      medication: updated,
      reviewed: true,
    });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// G. LOG ADHERENCE EVENT (TAKEN, SKIPPED, MISSED)
// =========================================================================
router.post('/:id/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const medication = await prisma.medicationSchedule.findUnique({
      where: { id },
    });

    if (!medication) {
      res.status(404).json({ error: 'Medication record not found.' });
      return;
    }

    const authenticatedUserId = (req as any).user.id;
    const isClinician = Boolean((req as any).user?.isClinician);

    let sourceProvenance = 'MANUAL_PATIENT';

    if (authenticatedUserId === medication.userId) {
      // Patient logging their own adherence
      sourceProvenance = 'MANUAL_PATIENT';
    } else if (isClinician) {
      // Clinician logging adherence
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: authenticatedUserId,
            patientId: medication.userId,
          },
        },
      });
      if (!assignment || assignment.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Forbidden: Clinician is not actively assigned to this patient.' });
        return;
      }
      sourceProvenance = 'DOCTOR_CLINICAL';
    } else {
      // Caregiver logging on behalf of patient
      const caregiverUser = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { email: true },
      });
      const consent = await prisma.caregiverConsent.findFirst({
        where: {
          patientId: medication.userId,
          caregiverEmail: caregiverUser?.email || '',
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });

      if (!consent) {
        res.status(403).json({ error: 'Forbidden: Access denied: No active caregiver consent from patient ' + medication.userId });
        return;
      }

      const grantedPermissions: string[] = JSON.parse(consent.permissions || '[]');
      if (!grantedPermissions.includes('MANAGE_MEDICATIONS') && !grantedPermissions.includes('LOG_ADHERENCE')) {
        res.status(403).json({ error: 'Forbidden: Caregiver grant does not include permission [MANAGE_MEDICATIONS]' });
        return;
      }

      sourceProvenance = 'CAREGIVER_INPUT';
    }

    const parsed = MedicationAdherenceEventSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid adherence event parameters',
        details: parsed.error.issues,
      });
      return;
    }

    const { action, scheduledTime, recordedAt, notes, idempotencyKey } = parsed.data;

    // Idempotency replay check
    if (idempotencyKey) {
      const existingEvent = await prisma.medicationAdherenceEvent.findUnique({
        where: { idempotencyKey: String(idempotencyKey) },
      });
      if (existingEvent) {
        res.status(200).json({
          event: existingEvent,
          isIdempotentReplay: true,
          replayed: true,
        });
        return;
      }
    }

    const event = await prisma.medicationAdherenceEvent.create({
      data: {
        medicationId: id,
        userId: medication.userId,
        action,
        scheduledTime: new Date(scheduledTime),
        recordedAt: recordedAt ? new Date(recordedAt) : new Date(),
        recordedBy: authenticatedUserId,
        sourceProvenance,
        notes: notes || undefined,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : undefined,
      },
    });

    void logClinicalMutationEvent({
      userId: medication.userId,
      actorId: authenticatedUserId,
      action: 'MEDICATION_EVENT_LOGGED',
      entityType: 'MedicationAdherenceEvent',
      entityId: event.id,
      metadata: {
        medicationId: id,
        action,
        sourceProvenance,
      },
      ipAddress: req.ip,
    });

    res.status(201).json({ event });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

// =========================================================================
// H. GET ADHERENCE EVENTS FOR MEDICATION
// =========================================================================
router.get('/:id/events', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const medication = await prisma.medicationSchedule.findUnique({
      where: { id },
    });

    if (!medication) {
      res.status(404).json({ error: 'Medication record not found.' });
      return;
    }

    const authenticatedUserId = (req as any).user.id;
    const isClinician = Boolean((req as any).user?.isClinician);

    if (authenticatedUserId === medication.userId) {
      // Patient viewing own
    } else if (isClinician) {
      const assignment = await prisma.doctorPatientAssignment.findUnique({
        where: {
          doctorId_patientId: {
            doctorId: authenticatedUserId,
            patientId: medication.userId,
          },
        },
      });
      if (!assignment || assignment.status !== 'ACTIVE') {
        res.status(403).json({ error: 'Forbidden: Clinician is not actively assigned to this patient.' });
        return;
      }
    } else {
      // Caregiver check
      const caregiverUser = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { email: true },
      });
      const consent = await prisma.caregiverConsent.findFirst({
        where: {
          patientId: medication.userId,
          caregiverEmail: caregiverUser?.email || '',
          status: 'ACTIVE',
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!consent) {
        res.status(404).json({ error: 'Medication record not found.' });
        return;
      }
    }

    const limit = Math.min(parseInt(req.query.limit as string, 10) || 50, 100);
    const events = await prisma.medicationAdherenceEvent.findMany({
      where: { medicationId: id, userId: medication.userId },
      orderBy: { recordedAt: 'desc' },
      take: limit,
    });

    res.json({ events });
  } catch (err: any) {
    res.status(getAuthErrorStatus(err)).json({ error: err.message });
  }
});

export default router;
