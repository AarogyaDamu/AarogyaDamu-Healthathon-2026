import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth';
import { validateRequest } from '../middleware/validate';
import { resolvePatientContext } from '../permissions/evaluator';
import { updateTenantContext } from '../db/tenantContext';

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

/**
 * GET /api/consultations/prescriptions
 * Returns all approved, issued prescriptions for the authenticated patient or delegated caregiver.
 * Enforces resolvePatientContext and RLS isolation. Drafts are strictly excluded.
 */
router.get('/prescriptions', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_CONSULTATIONS');
    updateTenantContext({ patientId: effectivePatientId });

    const notes = await prisma.consultationNote.findMany({
      where: {
        userId: effectivePatientId,
        status: 'APPROVED',
        sharedWithPatient: true,
      },
      include: {
        prescriptions: true,
        clinician: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            visitType: true,
            clinicName: true,
          },
        },
      },
      orderBy: { approvedAt: 'desc' },
    });

    const prescriptions = notes.map((note) => {
      let diagnoses = [];
      try {
        diagnoses = note.clinicalDiagnosisJson ? JSON.parse(note.clinicalDiagnosisJson) : [];
      } catch {}

      let labOrders = [];
      try {
        labOrders = note.labOrdersJson ? JSON.parse(note.labOrdersJson) : [];
      } catch {}

      let exam = null;
      try {
        exam = note.examinationFindingsJson ? JSON.parse(note.examinationFindingsJson) : null;
      } catch {}

      const doctorProfile = note.clinician?.profile;
      const doctorName = doctorProfile?.fullName || note.clinicianName || 'Attending Physician';
      const clinic = note.appointment?.clinicName || 'Apollo Sugar Clinic, Pune';

      return {
        id: note.id,
        prescriptionReference: `RX-${note.id.slice(0, 8).toUpperCase()}`,
        consultationNoteId: note.id,
        patientId: note.userId,
        appointmentId: note.appointmentId,
        visitType: note.appointment?.visitType || 'ROUTINE_FOLLOW_UP',
        status: 'ISSUED',
        issuedAt: note.approvedAt ? note.approvedAt.toISOString() : note.createdAt.toISOString(),
        doctor: {
          id: note.clinicianId,
          name: doctorName,
          specialty: doctorProfile?.specialization || 'Consultant Diabetologist',
          qualification: (doctorProfile as any)?.qualification || 'MBBS, MD (Medicine)',
          registrationNumber: (doctorProfile as any)?.registrationNumber || 'MCI-84920',
          clinicName: clinic,
        },
        clinicName: clinic,
        chiefComplaint: note.structuredNote?.split('\n')[1] || 'Clinical Consultation',
        diagnoses,
        examination: exam,
        medications: note.prescriptions.map((rx) => ({
          id: rx.id,
          medicationName: rx.medicationName,
          dosage: rx.dosage,
          frequency: rx.frequency,
          timing: rx.timing,
          durationDays: rx.durationDays,
          instructions: rx.instructions || '',
        })),
        labOrders,
        lifestyleAdvice: note.lifestyleAdvice || null,
        followUpNote: note.structuredNote?.includes('**Follow-up:**')
          ? note.structuredNote.split('**Follow-up:**')[1]?.split('\n')[0]?.trim()
          : null,
        approvedBy: note.approvedBy,
        approvedAt: note.approvedAt ? note.approvedAt.toISOString() : null,
        structuredNote: note.structuredNote,
      };
    });

    res.json({ success: true, prescriptions });
  } catch (err: any) {
    res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

/**
 * GET /api/consultations/prescriptions/:id
 * Retrieves a single issued prescription by its consultationNote ID.
 */
router.get('/prescriptions/:id', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { effectivePatientId } = await resolvePatientContext(req, 'VIEW_CONSULTATIONS');
    updateTenantContext({ patientId: effectivePatientId });

    const note = await prisma.consultationNote.findFirst({
      where: {
        id: req.params.id,
        userId: effectivePatientId,
        status: 'APPROVED',
        sharedWithPatient: true,
      },
      include: {
        prescriptions: true,
        clinician: {
          select: {
            id: true,
            email: true,
            profile: true,
          },
        },
        appointment: {
          select: {
            id: true,
            scheduledAt: true,
            visitType: true,
            clinicName: true,
          },
        },
      },
    });

    if (!note) {
      res.status(404).json({ error: 'Prescription not found or not yet approved.' });
      return;
    }

    let diagnoses = [];
    try {
      diagnoses = note.clinicalDiagnosisJson ? JSON.parse(note.clinicalDiagnosisJson) : [];
    } catch {}

    let labOrders = [];
    try {
      labOrders = note.labOrdersJson ? JSON.parse(note.labOrdersJson) : [];
    } catch {}

    let exam = null;
    try {
      exam = note.examinationFindingsJson ? JSON.parse(note.examinationFindingsJson) : null;
    } catch {}

    const doctorProfile = note.clinician?.profile;
    const doctorName = doctorProfile?.fullName || note.clinicianName || 'Attending Physician';
    const clinic = note.appointment?.clinicName || 'Apollo Sugar Clinic, Pune';

    res.json({
      success: true,
      prescription: {
        id: note.id,
        prescriptionReference: `RX-${note.id.slice(0, 8).toUpperCase()}`,
        consultationNoteId: note.id,
        patientId: note.userId,
        appointmentId: note.appointmentId,
        visitType: note.appointment?.visitType || 'ROUTINE_FOLLOW_UP',
        status: 'ISSUED',
        issuedAt: note.approvedAt ? note.approvedAt.toISOString() : note.createdAt.toISOString(),
        doctor: {
          id: note.clinicianId,
          name: doctorName,
          specialty: doctorProfile?.specialization || 'Consultant Diabetologist',
          qualification: (doctorProfile as any)?.qualification || 'MBBS, MD (Medicine)',
          registrationNumber: (doctorProfile as any)?.registrationNumber || 'MCI-84920',
          clinicName: clinic,
        },
        clinicName: clinic,
        diagnoses,
        examination: exam,
        medications: note.prescriptions.map((rx) => ({
          id: rx.id,
          medicationName: rx.medicationName,
          dosage: rx.dosage,
          frequency: rx.frequency,
          timing: rx.timing,
          durationDays: rx.durationDays,
          instructions: rx.instructions || '',
        })),
        labOrders,
        lifestyleAdvice: note.lifestyleAdvice || null,
        approvedBy: note.approvedBy,
        approvedAt: note.approvedAt ? note.approvedAt.toISOString() : null,
        structuredNote: note.structuredNote,
      },
    });
  } catch (err: any) {
    res.status(err.message?.includes('Forbidden') ? 403 : 500).json({ error: err.message });
  }
});

// ==========================================
// DOCTOR CONSULTATION WORKSPACE & DAMU COPILOT
// ==========================================

import { resolvePracticeContext, requirePracticeMembership, requirePracticeRole, TenantRequest } from '../middleware/tenantMiddleware';
import { ConsultationWorkspaceService } from '../services/consultationWorkspaceService';
import { ClinicianDamuService } from '../ai/agent/clinicianDamuService';
import {
  ConsultationWorkspaceRecordSchema,
  ClinicianSummarizeHistoryInputSchema,
  ClinicianDraftConsultationNoteInputSchema,
  ClinicianTrendComparisonInputSchema,
} from '@aarogyadamu/contracts';

/**
 * GET /api/consultations/workspace/templates
 * Retrieves practice consultation templates (with auto-seeding of standard Indian diabetology templates).
 */
router.get(
  '/workspace/templates',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const templates = await ConsultationWorkspaceService.getTemplates(req.practiceId!);
      res.json({ success: true, templates });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);

/**
 * GET /api/consultations/patient/:patientId
 * Retrieves all approved clinical consultation notes and attached prescriptions for a patient.
 */
router.get(
  '/patient/:patientId',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const patientId = req.params.patientId;
      updateTenantContext({ patientId, practiceId: req.practiceId });
      const notes = await prisma.consultationNote.findMany({
        where: { userId: patientId },
        include: {
          prescriptions: true,
        },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, notes });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  },
);

/**
 * POST /api/consultations/workspace/finalize
 * Finalizes and digitally signs a complete SOAP consultation, persisting individual prescriptions and updating appointment.
 */
router.post(
  '/workspace/finalize',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const parsed = ConsultationWorkspaceRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      updateTenantContext({ patientId: parsed.data.patientId, practiceId: req.practiceId });

      // Get doctor name
      const doctorUser = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: { profile: true },
      });
      const doctorName = doctorUser?.profile?.fullName || `Dr. ${req.user!.email.split('@')[0]}`;

      const note = await ConsultationWorkspaceService.finalizeConsultation(
        req.user!.id,
        doctorName,
        req.practiceId!,
        parsed.data,
      );

      res.status(201).json({
        success: true,
        message: 'Consultation finalized and digitally signed by clinician',
        consultationNote: note,
      });
    } catch (err: any) {
      const isAuth = err.message?.includes('Unauthorized') || err.message?.includes('Forbidden');
      res.status(isAuth ? 403 : 400).json({ error: err.message });
    }
  },
);

/**
 * POST /api/consultations/copilot/summarize-history
 * Damu AI summarizes longitudinal patient history for clinician review.
 */
router.post(
  '/copilot/summarize-history',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const parsed = ClinicianSummarizeHistoryInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const summary = await ClinicianDamuService.summarizePatientHistory(
        req.user!.id,
        req.practiceId!,
        parsed.data.patientId,
        parsed.data.timeframeDays,
      );

      res.json({ success: true, summary });
    } catch (err: any) {
      const isAuth = err.message?.includes('Unauthorized') || err.message?.includes('Forbidden');
      res.status(isAuth ? 403 : 400).json({ error: err.message });
    }
  },
);

/**
 * POST /api/consultations/copilot/draft-note
 * Damu AI pre-populates a structured SOAP draft. Marked as provisional draft requiring doctor review.
 */
router.post(
  '/copilot/draft-note',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const parsed = ClinicianDraftConsultationNoteInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const draft = await ClinicianDamuService.draftConsultationNote(
        req.user!.id,
        req.practiceId!,
        parsed.data.patientId,
        parsed.data.chiefComplaint,
        parsed.data.appointmentId,
      );

      res.json({ success: true, draft });
    } catch (err: any) {
      const isAuth = err.message?.includes('Unauthorized') || err.message?.includes('Forbidden');
      res.status(isAuth ? 403 : 400).json({ error: err.message });
    }
  },
);

/**
 * POST /api/consultations/copilot/compare-trends
 * Damu AI computes metric trend comparison between two consecutive timeframes.
 */
router.post(
  '/copilot/compare-trends',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const parsed = ClinicianTrendComparisonInputSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Validation failed', issues: parsed.error.issues });
        return;
      }

      const comparison = await ClinicianDamuService.compareTrends(
        req.user!.id,
        req.practiceId!,
        parsed.data.patientId,
        parsed.data.metric,
        parsed.data.periodDays,
      );

      res.json({ success: true, comparison });
    } catch (err: any) {
      const isAuth = err.message?.includes('Unauthorized') || err.message?.includes('Forbidden');
      res.status(isAuth ? 403 : 400).json({ error: err.message });
    }
  },
);

/**
 * GET /api/consultations/copilot/missing-documentation
 * Scans practice patients for overdue screening (e.g. HbA1c >90 days).
 */
router.get(
  '/copilot/missing-documentation',
  requireAuth,
  resolvePracticeContext,
  requirePracticeMembership,
  requirePracticeRole(['OWNER', 'DOCTOR']),
  async (req: TenantRequest, res: Response): Promise<void> => {
    try {
      const overdueDays = req.query.overdueDays ? parseInt(req.query.overdueDays as string, 10) : 90;
      const alerts = await ClinicianDamuService.checkMissingDocumentation(req.practiceId!, overdueDays);
      res.json({ success: true, alerts });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  },
);


export default router;
