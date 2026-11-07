import { Router, Request, Response } from 'express';
import { requireAuth, AuthenticatedRequest } from '../middleware/auth';
import { logAuditEvent } from '../audit/auditLogger';
import { HealthInsightService } from '../services/healthInsightService';

const router = Router();
import { prisma } from '../db/prisma';

router.use(requireAuth);

function getActor(req: Request) {
  const user = (req as AuthenticatedRequest).user;
  if (!user) {
    const err = new Error('Authentication required');
    (err as any).status = 401;
    throw err;
  }
  return user;
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

async function verifyCaregiverAccess(caregiverEmail: string, patientId: string): Promise<boolean> {
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
  return (
    permissions.includes('VIEW_OBSERVATIONS') ||
    permissions.includes('VIEW_TASKS') ||
    permissions.includes('VIEW_CARE_PLAN') ||
    permissions.includes('VIEW_CONSULTATIONS') ||
    permissions.includes('VIEW_HEALTH_SUMMARY') ||
    permissions.includes('VIEW_HEALTH_TIMELINE')
  );
}

async function resolveJourneyTargetPatient(req: Request): Promise<{ patientId: string; isDelegated: boolean }> {
  const actor = getActor(req);
  const targetId = (req.query.patientId as string) || (req.headers['x-target-patient-id'] as string) || actor.id;

  if (targetId === actor.id) {
    return { patientId: actor.id, isDelegated: false };
  }

  // Doctor access
  if (actor.isClinician) {
    const isAssigned = await verifyDoctorAssignment(actor.id, targetId);
    if (!isAssigned) {
      const err = new Error(`Forbidden: Clinician is not actively assigned to patient ${targetId}`);
      (err as any).status = 403;
      throw err;
    }
    return { patientId: targetId, isDelegated: true };
  }

  // Caregiver access
  const isAuthorizedCaregiver = await verifyCaregiverAccess(actor.email, targetId);
  if (!isAuthorizedCaregiver) {
    const err = new Error(`Forbidden: Access denied to patient journey for ${targetId}`);
    (err as any).status = 403;
    throw err;
  }

  return { patientId: targetId, isDelegated: true };
}

// ============================================================================
// 1. GET /api/journey/timeline — Record-Backed Chronological Stages
// ============================================================================
router.get('/timeline', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);

    const [
      user,
      profile,
      firstObservation,
      recentObservations,
      approvedConsultations,
      activeCarePlan,
      allCarePlans,
      tasks,
      appointments,
      documents,
    ] = await Promise.all([
      prisma.user.findUnique({ where: { id: patientId } }),
      prisma.patientProfile.findUnique({ where: { userId: patientId } }),
      prisma.healthObservation.findFirst({ where: { userId: patientId }, orderBy: { observedAt: 'asc' } }),
      prisma.healthObservation.findMany({ where: { userId: patientId }, orderBy: { observedAt: 'desc' }, take: 30 }),
      prisma.consultationNote.findMany({ where: { userId: patientId, status: 'APPROVED' }, orderBy: { approvedAt: 'desc' } }),
      prisma.carePlan.findFirst({ where: { patientId, status: 'ACTIVE' }, include: { goals: true, activities: true }, orderBy: { version: 'desc' } }),
      prisma.carePlan.findMany({ where: { patientId }, orderBy: { version: 'desc' } }),
      prisma.careTask.findMany({ where: { userId: patientId }, orderBy: { dueAt: 'asc' } }),
      prisma.appointment.findMany({ where: { patientId }, include: { doctor: { select: { id: true, email: true, profile: true } } }, orderBy: { scheduledAt: 'asc' } }),
      prisma.healthDocument.findMany({ where: { userId: patientId }, orderBy: { reportDate: 'desc' } }),
    ]);

    if (!user) {
      res.status(404).json({ error: 'Patient record not found' });
      return;
    }

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 86400000;

    // Stage 1: Patient Onboarding
    const s1Completed = !!profile;
    const stage1 = {
      id: 'PATIENT_ONBOARDING',
      order: 1,
      title: 'Patient Onboarding & Profile Setup',
      description: 'Baseline profile, diabetes type, and personalized glycemic targets established.',
      status: s1Completed ? 'COMPLETED' : 'CURRENT',
      completedAt: profile ? profile.createdAt.toISOString() : null,
      recordType: 'PatientProfile',
      recordId: profile?.id ?? null,
      details: {
        diabetesType: profile?.diabetesType || 'TYPE_2',
        diagnosisYear: profile?.diagnosisYear || 2021,
        targetFasting: `${profile?.targetFastingMin ?? 80}-${profile?.targetFastingMax ?? 130} mg/dL`,
        targetPostMeal: `< ${profile?.targetPostMealMax ?? 180} mg/dL`,
      },
    };

    // Stage 2: Initial Health Assessment
    const s2Completed = !!firstObservation || documents.length > 0;
    const stage2 = {
      id: 'INITIAL_ASSESSMENT',
      order: 2,
      title: 'Initial Health Assessment',
      description: 'Initial blood glucose measurements, vitals, or baseline lab documents submitted.',
      status: s2Completed ? 'COMPLETED' : s1Completed ? 'CURRENT' : 'PENDING',
      completedAt: firstObservation ? firstObservation.observedAt.toISOString() : documents[0]?.reportDate?.toISOString() || null,
      recordType: firstObservation ? 'HealthObservation' : documents.length > 0 ? 'HealthDocument' : null,
      recordId: firstObservation?.id || documents[0]?.id || null,
      details: firstObservation
        ? {
            metric: firstObservation.type,
            value: `${firstObservation.numericValue} ${firstObservation.unit}`,
            context: firstObservation.context,
          }
        : documents.length > 0
        ? {
            title: documents[0].title,
            category: documents[0].category,
          }
        : null,
    };

    // Stage 3: Doctor Consultation
    const completedAppointments = appointments.filter((a) => a.status === 'COMPLETED');
    const s3Completed = approvedConsultations.length > 0 || completedAppointments.length > 0;
    const upcomingAppointments = appointments.filter(
      (a) => new Date(a.scheduledAt).getTime() >= now && (a.status === 'CONFIRMED' || a.status === 'REQUESTED')
    );
    const stage3 = {
      id: 'DOCTOR_CONSULTATION',
      order: 3,
      title: 'Doctor Consultation & Clinical Note',
      description: 'Consultation with physician and authenticated clinical transcription note.',
      status: s3Completed
        ? 'COMPLETED'
        : upcomingAppointments.length > 0
        ? 'CURRENT'
        : s2Completed
        ? 'PENDING'
        : 'PENDING',
      completedAt: approvedConsultations[0]?.approvedAt?.toISOString() || completedAppointments[0]?.updatedAt?.toISOString() || null,
      recordType: approvedConsultations.length > 0 ? 'ConsultationNote' : completedAppointments.length > 0 ? 'Appointment' : null,
      recordId: approvedConsultations[0]?.id || completedAppointments[0]?.id || null,
      details: approvedConsultations[0]
        ? {
            clinicianName: approvedConsultations[0].clinicianName,
            status: approvedConsultations[0].status,
            structuredNoteAvailable: true,
          }
        : completedAppointments[0]
        ? {
            reason: completedAppointments[0].reason,
            visitType: completedAppointments[0].visitType,
          }
        : null,
    };

    // Stage 4: Care Plan Approval
    const hasApprovedPlan = !!activeCarePlan || allCarePlans.some((p) => p.status === 'SUPERSEDED' || p.status === 'ACTIVE');
    const hasDraftPlan = allCarePlans.some((p) => p.status === 'DRAFT');
    const stage4 = {
      id: 'CARE_PLAN_APPROVAL',
      order: 4,
      title: 'Shared Care Plan Published',
      description: 'Physician-reviewed clinical targets, routine activities, and doctor instructions.',
      status: hasApprovedPlan ? 'COMPLETED' : hasDraftPlan ? 'CURRENT' : s3Completed ? 'PENDING' : 'PENDING',
      completedAt: activeCarePlan?.approvedAt?.toISOString() || allCarePlans.find((p) => p.approvedAt)?.approvedAt?.toISOString() || null,
      recordType: 'CarePlan',
      recordId: activeCarePlan?.id || allCarePlans[0]?.id || null,
      details: activeCarePlan
        ? {
            title: activeCarePlan.title,
            version: activeCarePlan.version,
            status: activeCarePlan.status,
            goalsCount: activeCarePlan.goals.length,
            activitiesCount: activeCarePlan.activities.length,
          }
        : null,
    };

    // Stage 5: Daily Health Monitoring
    const recentObsIn7Days = recentObservations.filter((o) => new Date(o.observedAt).getTime() >= sevenDaysAgo);
    let s5Status: 'COMPLETED' | 'CURRENT' | 'OVERDUE' | 'PENDING' = 'PENDING';
    if (recentObsIn7Days.length > 0) {
      s5Status = 'COMPLETED';
    } else if (recentObservations.length > 0) {
      s5Status = 'OVERDUE';
    } else if (hasApprovedPlan) {
      s5Status = 'CURRENT';
    }
    const stage5 = {
      id: 'DAILY_MONITORING',
      order: 5,
      title: 'Daily Health Monitoring',
      description: 'Routine blood glucose and physiological tracking to evaluate glycemic response.',
      status: s5Status,
      completedAt: recentObservations[0]?.observedAt?.toISOString() || null,
      recordType: 'HealthObservation',
      recordId: recentObservations[0]?.id || null,
      details: {
        totalReadings: recentObservations.length,
        recentReadings7Days: recentObsIn7Days.length,
        latestReading: recentObservations[0]
          ? `${recentObservations[0].numericValue} ${recentObservations[0].unit} (${recentObservations[0].context})`
          : null,
      },
    };

    // Stage 6: Care Plan Activities
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTasks = tasks.filter((t) => new Date(t.dueAt).getTime() >= today.getTime());
    const overdueTasks = tasks.filter((t) => t.status === 'PENDING' && new Date(t.dueAt).getTime() < today.getTime());
    let s6Status: 'COMPLETED' | 'CURRENT' | 'OVERDUE' | 'PENDING' = 'PENDING';
    if (!hasApprovedPlan) {
      s6Status = 'PENDING';
    } else if (overdueTasks.length > 0) {
      s6Status = 'OVERDUE';
    } else if (todayTasks.length > 0 && todayTasks.every((t) => t.status === 'COMPLETED')) {
      s6Status = 'COMPLETED';
    } else if (todayTasks.length > 0) {
      s6Status = 'CURRENT';
    } else {
      s6Status = 'CURRENT';
    }
    const stage6 = {
      id: 'CARE_PLAN_ACTIVITIES',
      order: 6,
      title: 'Care Plan Routine Activities',
      description: 'Scheduled tasks, medicine reminders, and daily lifestyle commitments.',
      status: s6Status,
      completedAt: todayTasks.every((t) => t.status === 'COMPLETED') && todayTasks.length > 0 ? todayTasks[0].completedAt?.toISOString() || null : null,
      recordType: 'CareTask',
      recordId: todayTasks[0]?.id || null,
      details: {
        todayTotal: todayTasks.length,
        todayCompleted: todayTasks.filter((t) => t.status === 'COMPLETED').length,
        overdueCount: overdueTasks.length,
      },
    };

    // Stage 7: Progress Evaluation
    const s7Completed = recentObservations.length >= 3;
    const stage7 = {
      id: 'PROGRESS_EVALUATION',
      order: 7,
      title: 'Progress & Glycemic Evaluation',
      description: 'Longitudinal adherence review, Time-in-Range (TIR), and estimated A1c calculation.',
      status: s7Completed ? 'COMPLETED' : recentObservations.length > 0 ? 'CURRENT' : 'PENDING',
      completedAt: s7Completed ? recentObservations[0].observedAt.toISOString() : null,
      recordType: 'LongitudinalAnalytics',
      recordId: null,
      details: {
        readingsEvaluated: recentObservations.length,
        sufficientData: s7Completed,
      },
    };

    // Stage 8: Doctor Follow-up
    const nextReviewDate = activeCarePlan?.reviewDate;
    const isReviewOverdue = nextReviewDate && new Date(nextReviewDate).getTime() < now && completedAppointments.every((a) => new Date(a.scheduledAt).getTime() < new Date(nextReviewDate).getTime());
    let s8Status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'OVERDUE' | 'PENDING' = 'PENDING';
    if (isReviewOverdue) {
      s8Status = 'OVERDUE';
    } else if (upcomingAppointments.length > 0) {
      s8Status = 'UPCOMING';
    } else if (nextReviewDate) {
      s8Status = 'UPCOMING';
    } else if (hasApprovedPlan) {
      s8Status = 'CURRENT';
    }
    const stage8 = {
      id: 'DOCTOR_FOLLOW_UP',
      order: 8,
      title: 'Doctor Follow-up & Clinical Review',
      description: 'Scheduled consultation with treating clinician to review glycemic control.',
      status: s8Status,
      completedAt: null,
      recordType: upcomingAppointments[0] ? 'Appointment' : 'CarePlan',
      recordId: upcomingAppointments[0]?.id || activeCarePlan?.id || null,
      details: {
        nextReviewDate: nextReviewDate ? nextReviewDate.toISOString() : null,
        isReviewOverdue: !!isReviewOverdue,
        upcomingAppointment: upcomingAppointments[0]
          ? {
              id: upcomingAppointments[0].id,
              scheduledAt: upcomingAppointments[0].scheduledAt.toISOString(),
              isServerConfirmed: upcomingAppointments[0].status === 'CONFIRMED',
              status: upcomingAppointments[0].status,
              reason: upcomingAppointments[0].reason,
            }
          : null,
      },
    };

    // Stage 9: Care Plan Revision
    const hasRevisions = allCarePlans.length > 1;
    const hasDraftRevision = allCarePlans.some((p) => p.status === 'DRAFT' && p.version > 1);
    let s9Status: 'COMPLETED' | 'CURRENT' | 'UPCOMING' | 'PENDING' = 'PENDING';
    if (hasRevisions && allCarePlans.some((p) => p.status === 'ACTIVE' && p.version > 1)) {
      s9Status = 'COMPLETED';
    } else if (hasDraftRevision) {
      s9Status = 'CURRENT';
    } else if (hasApprovedPlan) {
      s9Status = 'UPCOMING';
    }
    const stage9 = {
      id: 'CARE_PLAN_REVISION',
      order: 9,
      title: 'Care Plan Revision & Optimization',
      description: 'Iterative adjustments to treatment targets and routines based on longitudinal data.',
      status: s9Status,
      completedAt: hasRevisions && allCarePlans[0].version > 1 && allCarePlans[0].status === 'ACTIVE' ? allCarePlans[0].approvedAt?.toISOString() || null : null,
      recordType: 'CarePlan',
      recordId: allCarePlans.find((p) => p.version > 1)?.id || null,
      details: {
        totalCarePlanVersions: allCarePlans.length,
        currentVersion: activeCarePlan?.version || 1,
        hasDraftRevision,
      },
    };

    const stages = [stage1, stage2, stage3, stage4, stage5, stage6, stage7, stage8, stage9];

    // Determine current active milestone
    const currentStage = stages.find((s) => s.status === 'CURRENT' || s.status === 'OVERDUE') || stages.find((s) => s.status === 'UPCOMING') || stages[stages.length - 1];

    res.json({
      patientId,
      currentStage: currentStage.id,
      stages,
      overallProgress: {
        completedCount: stages.filter((s) => s.status === 'COMPLETED').length,
        totalStages: stages.length,
        completionPercentage: Math.round((stages.filter((s) => s.status === 'COMPLETED').length / stages.length) * 100),
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 2. GET /api/journey/daily — Today's Patient Agenda
// ============================================================================
router.get('/daily', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const [activePlan, tasks, medications, appointments] = await Promise.all([
      prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: { goals: true, activities: true, approver: { select: { id: true, email: true, profile: true } } },
        orderBy: { version: 'desc' },
      }),
      prisma.careTask.findMany({
        where: {
          userId: patientId,
          OR: [
            { dueAt: { gte: startOfToday, lte: endOfToday } },
            { status: 'PENDING', dueAt: { lte: endOfToday } },
            { status: 'COMPLETED', completedAt: { gte: startOfToday, lte: endOfToday } },
          ],
        },
        orderBy: { dueAt: 'asc' },
      }),
      prisma.medicationSchedule.findMany({
        where: { userId: patientId, isActive: true },
        orderBy: { timing: 'asc' },
      }),
      prisma.appointment.findMany({
        where: {
          patientId,
          scheduledAt: { gte: startOfToday, lte: endOfToday },
        },
        include: { doctor: { select: { id: true, email: true, profile: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
    ]);

    const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');

    const totalTasksToday = tasks.length;
    const completedCount = completedTasks.length;
    const adherencePercentage = totalTasksToday > 0 ? Math.round((completedCount / totalTasksToday) * 100) : 100;

    res.json({
      patientId,
      date: now.toISOString().split('T')[0],
      carePlan: activePlan
        ? {
            id: activePlan.id,
            title: activePlan.title,
            version: activePlan.version,
            doctorInstructions: activePlan.doctorInstructions,
            approvedBy: activePlan.approver ? activePlan.approver.profile?.fullName || activePlan.approver.email : 'Attending Clinician',
          }
        : null,
      activities: activePlan?.activities ?? [],
      pendingTasks: pendingTasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        dueAt: t.dueAt.toISOString(),
        isOverdue: new Date(t.dueAt).getTime() < startOfToday.getTime(),
      })),
      completedTasks: completedTasks.map((t) => ({
        id: t.id,
        title: t.title,
        category: t.category,
        completedAt: t.completedAt ? t.completedAt.toISOString() : null,
      })),
      medications: medications.map((m) => ({
        id: m.id,
        name: m.medicationName || m.medicineName,
        dosage: m.dosage,
        timing: m.timing,
        notes: m.notes,
      })),
      upcomingAppointments: appointments.map((a) => ({
        id: a.id,
        doctorName: a.doctor.profile?.fullName || a.doctor.email,
        scheduledAt: a.scheduledAt.toISOString(),
        reason: a.reason,
        status: a.status,
        isServerConfirmed: a.status === 'CONFIRMED',
      })),
      summary: {
        totalTasksToday,
        completedCount,
        pendingCount: pendingTasks.length,
        adherencePercentage,
      },
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 3. GET /api/journey/progress — Actual Observations vs Clinician Targets & AI
// ============================================================================
router.get('/progress', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);

    const [profile, activePlan, observations] = await Promise.all([
      prisma.patientProfile.findUnique({ where: { userId: patientId } }),
      prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: { goals: true },
        orderBy: { version: 'desc' },
      }),
      prisma.healthObservation.findMany({
        where: { userId: patientId },
        orderBy: { observedAt: 'desc' },
        take: 100,
      }),
    ]);

    // Separate observations by type
    const glucoseObs = observations.filter((o) => o.type === 'BLOOD_GLUCOSE' || o.type === 'GLUCOSE');
    const hba1cObs = observations.filter((o) => o.type === 'HBA1C');
    const bpObs = observations.filter((o) => o.type.startsWith('BLOOD_PRESSURE'));
    const weightObs = observations.filter((o) => o.type === 'WEIGHT');

    // Glucose Time-in-Range (TIR) computation based on profile targets
    const fastingMin = profile?.targetFastingMin ?? 80;
    const postMealMax = profile?.targetPostMealMax ?? 180;

    let inRangeCount = 0;
    let highCount = 0;
    let lowCount = 0;

    glucoseObs.forEach((g) => {
      if (g.numericValue < fastingMin) {
        lowCount += 1;
      } else if (g.numericValue > postMealMax) {
        highCount += 1;
      } else {
        inRangeCount += 1;
      }
    });

    const totalGlucose = glucoseObs.length;
    const timeInRangePct = totalGlucose > 0 ? Math.round((inRangeCount / totalGlucose) * 100) : 0;
    const avgGlucose = totalGlucose > 0 ? Math.round(glucoseObs.reduce((sum, g) => sum + g.numericValue, 0) / totalGlucose) : null;

    // Nathan et al. formula for estimated A1c from average glucose: (avgGlucose + 46.7) / 28.7
    const estimatedA1cValue = avgGlucose ? parseFloat(((avgGlucose + 46.7) / 28.7).toFixed(1)) : null;

    res.json({
      patientId,
      actualObservations: {
        bloodGlucose: glucoseObs.map((g) => ({
          id: g.id,
          numericValue: g.numericValue,
          unit: g.unit,
          context: g.context,
          observedAt: g.observedAt.toISOString(),
          provenance: g.provenance,
          isActualObservation: true,
        })),
        hba1c: hba1cObs.map((h) => ({
          id: h.id,
          numericValue: h.numericValue,
          unit: h.unit,
          observedAt: h.observedAt.toISOString(),
          provenance: h.provenance,
          isActualObservation: true,
        })),
        bloodPressure: bpObs.map((b) => ({
          id: b.id,
          type: b.type,
          numericValue: b.numericValue,
          unit: b.unit,
          observedAt: b.observedAt.toISOString(),
          provenance: b.provenance,
          isActualObservation: true,
        })),
        weight: weightObs.map((w) => ({
          id: w.id,
          numericValue: w.numericValue,
          unit: w.unit,
          observedAt: w.observedAt.toISOString(),
          provenance: w.provenance,
          isActualObservation: true,
        })),
      },
      clinicianTargets: {
        fastingMin,
        fastingMax: profile?.targetFastingMax ?? 130,
        postMealMax,
        goals: activePlan?.goals ?? [],
      },
      estimatedInsights: {
        estimatedA1c: estimatedA1cValue
          ? {
              value: estimatedA1cValue,
              unit: '%',
              isActualObservation: false,
              isEstimated: true,
              provenance: 'ESTIMATED_FROM_GLUCOSE',
              method: 'Nathan et al. (ADAG formula): (mean_glucose + 46.7) / 28.7',
              disclaimer: 'Estimated A1c is an approximation derived from self-monitored blood glucose readings and does not replace a clinical venous laboratory HbA1c test.',
            }
          : null,
        glycemicControl: {
          timeInRangePercentage: timeInRangePct,
          inRangeCount,
          highCount,
          lowCount,
          totalReadings: totalGlucose,
          averageGlucose: avgGlucose,
          isEstimated: false,
        },
      },
      summary: await HealthInsightService.getJourneyProgressSummary(patientId),
      milestones: await HealthInsightService.generatePatientMilestones(patientId),
      insights: await HealthInsightService.calculateHealthInsights(patientId),
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 3.1 GET /api/journey/insights — Health Insights Engine (Phase 7)
// ============================================================================
router.get('/insights', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);
    const insights = await HealthInsightService.calculateHealthInsights(patientId);
    res.json({
      patientId,
      totalInsights: insights.length,
      insights,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 3.2 GET /api/journey/milestones — Personalised Care Journey Milestones (Phase 7)
// ============================================================================
router.get('/milestones', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);
    const milestones = await HealthInsightService.generatePatientMilestones(patientId);
    res.json({
      patientId,
      totalMilestones: milestones.length,
      milestones,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 3.3 GET /api/journey/summary — Complete Progress Summary (Phase 7)
// ============================================================================
router.get('/summary', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);
    const summary = await HealthInsightService.getJourneyProgressSummary(patientId);
    res.json(summary);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 4. GET /api/journey/follow-up — Follow-up Navigator & Server-Confirmed Appointments
// ============================================================================
router.get('/follow-up', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);

    const now = new Date();

    const [activePlan, appointments, pendingDocs, doctorAssignment] = await Promise.all([
      prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        orderBy: { version: 'desc' },
      }),
      prisma.appointment.findMany({
        where: { patientId, scheduledAt: { gte: new Date(now.getTime() - 24 * 3600000) } },
        include: { doctor: { select: { id: true, email: true, profile: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.healthDocument.findMany({
        where: { userId: patientId, processingStatus: 'PENDING' },
      }),
      prisma.doctorPatientAssignment.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: { doctor: { select: { id: true, email: true, profile: true } } },
      }),
    ]);

    const reviewDate = activePlan?.reviewDate ? new Date(activePlan.reviewDate) : null;
    let daysUntilReview: number | null = null;
    let isReviewOverdue = false;

    if (reviewDate) {
      const diffMs = reviewDate.getTime() - now.getTime();
      daysUntilReview = Math.round(diffMs / 86400000);
      isReviewOverdue = diffMs < 0;
    }

    res.json({
      patientId,
      nextReviewDate: reviewDate ? reviewDate.toISOString() : null,
      daysUntilReview,
      isReviewOverdue,
      upcomingAppointments: appointments.map((a) => ({
        id: a.id,
        doctorId: a.doctorId,
        doctorName: a.doctor.profile?.fullName || a.doctor.email,
        scheduledAt: a.scheduledAt.toISOString(),
        durationMinutes: a.durationMinutes,
        reason: a.reason,
        visitType: a.visitType,
        status: a.status,
        // STRICT SAFETY RULE: Never claim an appointment is confirmed without server confirmation!
        isServerConfirmed: a.status === 'CONFIRMED',
        statusLabel:
          a.status === 'CONFIRMED'
            ? 'Confirmed by Clinic'
            : a.status === 'REQUESTED'
            ? 'Awaiting Clinic Confirmation'
            : a.status,
      })),
      pendingClinicalReports: pendingDocs.map((d) => ({
        id: d.id,
        title: d.title,
        category: d.category,
        uploadedAt: d.createdAt.toISOString(),
      })),
      assignedClinician: doctorAssignment
        ? {
            id: doctorAssignment.doctor.id,
            name: doctorAssignment.doctor.profile?.fullName || doctorAssignment.doctor.email,
            email: doctorAssignment.doctor.email,
            activatedAt: doctorAssignment.activatedAt ? doctorAssignment.activatedAt.toISOString() : null,
          }
        : null,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ============================================================================
// 5. GET /api/journey/history — Unified Chronological Clinical History Log
// ============================================================================
router.get('/history', async (req: Request, res: Response): Promise<void> => {
  try {
    const { patientId } = await resolveJourneyTargetPatient(req);

    const [observations, tasks, consultations, carePlans, appointments, documents] = await Promise.all([
      prisma.healthObservation.findMany({ where: { userId: patientId }, orderBy: { observedAt: 'desc' }, take: 50 }),
      prisma.careTask.findMany({ where: { userId: patientId }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.consultationNote.findMany({ where: { userId: patientId, status: 'APPROVED' }, orderBy: { approvedAt: 'desc' }, take: 20 }),
      prisma.carePlan.findMany({ where: { patientId }, orderBy: { version: 'desc' }, take: 10 }),
      prisma.appointment.findMany({ where: { patientId }, include: { doctor: { select: { id: true, email: true, profile: true } } }, orderBy: { scheduledAt: 'desc' }, take: 20 }),
      prisma.healthDocument.findMany({ where: { userId: patientId }, orderBy: { reportDate: 'desc' }, take: 20 }),
    ]);

    const events: Array<{
      id: string;
      eventType: 'OBSERVATION' | 'TASK' | 'CONSULTATION' | 'CARE_PLAN' | 'APPOINTMENT' | 'DOCUMENT';
      title: string;
      summary: string;
      timestamp: string;
      metadata: Record<string, unknown>;
    }> = [];

    // Observations
    observations.forEach((o) => {
      events.push({
        id: `obs-${o.id}`,
        eventType: 'OBSERVATION',
        title: `${o.type.replace(/_/g, ' ')}: ${o.numericValue} ${o.unit}`,
        summary: `Context: ${o.context} • Recorded by ${o.provenance}`,
        timestamp: o.observedAt.toISOString(),
        metadata: { numericValue: o.numericValue, unit: o.unit, context: o.context },
      });
    });

    // Care Tasks
    tasks.forEach((t) => {
      events.push({
        id: `task-${t.id}`,
        eventType: 'TASK',
        title: `Care Task: ${t.title}`,
        summary: `Status: ${t.status}${t.completedAt ? ` • Completed on ${new Date(t.completedAt).toLocaleDateString('en-IN')}` : ''}`,
        timestamp: (t.completedAt || t.createdAt).toISOString(),
        metadata: { category: t.category, status: t.status },
      });
    });

    // Consultations
    consultations.forEach((c) => {
      events.push({
        id: `consult-${c.id}`,
        eventType: 'CONSULTATION',
        title: `Clinical Consultation Note (${c.clinicianName})`,
        summary: c.approvedNoteText?.slice(0, 160) || 'Approved clinical documentation',
        timestamp: (c.approvedAt || c.createdAt).toISOString(),
        metadata: { clinicianName: c.clinicianName, status: c.status },
      });
    });

    // Care Plans
    carePlans.forEach((p) => {
      events.push({
        id: `plan-${p.id}`,
        eventType: 'CARE_PLAN',
        title: `Care Plan v${p.version}: ${p.title}`,
        summary: `Status: ${p.status} • Diagnosis: ${p.diagnosis || 'Type 2 Diabetes Mellitus'}`,
        timestamp: (p.approvedAt || p.createdAt).toISOString(),
        metadata: { version: p.version, status: p.status },
      });
    });

    // Appointments
    appointments.forEach((a) => {
      events.push({
        id: `appt-${a.id}`,
        eventType: 'APPOINTMENT',
        title: `Doctor Appointment: ${a.reason}`,
        summary: `With ${a.doctor.profile?.fullName || a.doctor.email} • Status: ${a.status}`,
        timestamp: a.scheduledAt.toISOString(),
        metadata: { status: a.status, isServerConfirmed: a.status === 'CONFIRMED' },
      });
    });

    // Documents
    documents.forEach((d) => {
      events.push({
        id: `doc-${d.id}`,
        eventType: 'DOCUMENT',
        title: `Health Document: ${d.title}`,
        summary: `Category: ${d.category} • Status: ${d.processingStatus}`,
        timestamp: d.reportDate.toISOString(),
        metadata: { category: d.category },
      });
    });

    // Sort descending by timestamp
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    res.json({
      patientId,
      totalEvents: events.length,
      history: events,
    });
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
