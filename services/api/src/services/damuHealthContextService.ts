import { safeClinicalLog } from '../audit/clinicalAuditLogger';
import { prisma } from '../db/prisma';

export interface PatientHealthContextData {
  patientId: string;
  fullName: string;
  diabetesType: string;
  targetFastingMin?: number | null;
  targetFastingMax?: number | null;
  targetPostMealMax?: number | null;
  glucoseMetrics: {
    totalReadings30d: number;
    overallAverage: number | null;
    fastingAverage: number | null;
    postMealAverage: number | null;
    highest: { value: number; date: string } | null;
    lowest: { value: number; date: string } | null;
    timeInRangePercent: number; // 70-180 mg/dL
    fastingInTargetPercent: number | null;
    postMealInTargetPercent: number | null;
    standardDeviation: number | null;
    coefficientOfVariationPercent: number | null;
    dataSufficiency: 'NONE' | 'LIMITED' | 'ADEQUATE';
    hypoCount: number; // < 70
    severeHypoCount: number; // < 54
    hyperCount: number; // > 180
    trend7dVsPrior7d: {
      recent7dAvg: number | null;
      prior7dAvg: number | null;
      changeDelta: number | null;
      percentChange: number | null;
      direction: 'STABLE' | 'INCREASING' | 'DECREASING' | 'INSUFFICIENT_DATA';
    };
    recentReadings: Array<{ value: number; context: string | null; date: string }>;
  };
  medications: Array<{
    id: string;
    medicineName: string;
    dosage: string;
    timing: string;
    instructions: string | null;
    prescriber: string | null;
    status: string;
  }>;
  medicationAdherence: {
    adherenceRatePercent: number;
    takenDosesCount: number;
    scheduledOrReportedCount: number;
    skippedCount: number;
    missedCount: number;
    recentEvents: Array<{ action: string; scheduledTime: string; medicineName: string }>;
  };
  carePlan: {
    title: string;
    diagnosis: string | null;
    doctorInstructions: string | null;
    goals: Array<{ title: string; targetValue: string | null }>;
    activities: Array<{ title: string; category: string; instructions: string | null }>;
  } | null;
  tasks: Array<{
    id: string;
    title: string;
    priority: string;
    status: string;
    dueAt: string;
    instructions: string | null;
  }>;
  reminders: Array<{
    id: string;
    title: string;
    remindAt: string;
    status: string;
  }>;
  appointments: Array<{
    id: string;
    doctorName: string;
    scheduledAt: string;
    status: string;
    clinicName: string | null;
    visitType: string;
  }>;
  approvedConsultations: Array<{
    id: string;
    clinicianName: string;
    approvedAt: string;
    summaryText: string;
  }>;
  medicalReports: Array<{
    id: string;
    title: string;
    category: string;
    reportDate: string;
    notes: string | null;
  }>;
}

/**
 * Aggregates patient health records for Damu health intelligence reasoning.
 * Grounding Rule: All queries use actual database records with clinical boundaries.
 */
export async function getAggregatedPatientHealthContext(
  patientId: string,
  filterPermissions?: {
    canViewHealthSummary?: boolean;
    canViewMedications?: boolean;
    canViewTasks?: boolean;
    canViewConsultations?: boolean;
  }
): Promise<PatientHealthContextData> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. Patient Profile
  const profile = await prisma.patientProfile.findUnique({
    where: { userId: patientId },
    select: { fullName: true, diabetesType: true, targetFastingMin: true, targetFastingMax: true, targetPostMealMax: true },
  });

  const fullName = profile?.fullName || 'Patient';
  const diabetesType = profile?.diabetesType || 'Type 2 Diabetes Mellitus';
  const targetFastingMin = profile?.targetFastingMin ?? 80;
  const targetFastingMax = profile?.targetFastingMax ?? 130;
  const targetPostMealMax = profile?.targetPostMealMax ?? 180;

  // 2. Glucose Logs & Metrics (30 days)
  let glucoseMetrics: PatientHealthContextData['glucoseMetrics'] = {
    totalReadings30d: 0,
    overallAverage: null,
    fastingAverage: null,
    postMealAverage: null,
    highest: null,
    lowest: null,
    timeInRangePercent: 100,
    fastingInTargetPercent: null,
    postMealInTargetPercent: null,
    standardDeviation: null,
    coefficientOfVariationPercent: null,
    dataSufficiency: 'NONE',
    hypoCount: 0,
    severeHypoCount: 0,
    hyperCount: 0,
    trend7dVsPrior7d: {
      recent7dAvg: null,
      prior7dAvg: null,
      changeDelta: null,
      percentChange: null,
      direction: 'INSUFFICIENT_DATA',
    },
    recentReadings: [],
  };

  if (filterPermissions?.canViewHealthSummary !== false) {
    const observations = await prisma.healthObservation.findMany({
      where: {
        userId: patientId,
        type: 'BLOOD_GLUCOSE',
        observedAt: { gte: thirtyDaysAgo },
      },
      orderBy: { observedAt: 'desc' },
    });

    if (observations.length > 0) {
      const values = observations.map(o => o.numericValue);
      const totalCount = observations.length;
      const sum = values.reduce((acc, v) => acc + v, 0);
      const overallAvg = Math.round(sum / totalCount);

      const fastingObs = observations.filter(o => o.context === 'FASTING');
      const fastingAvg = fastingObs.length > 0
        ? Math.round(fastingObs.reduce((acc, o) => acc + o.numericValue, 0) / fastingObs.length)
        : null;

      const postMealObs = observations.filter(o => o.context === 'POST_PRANDIAL' || o.context === 'POST_MEAL');
      const postMealAvg = postMealObs.length > 0
        ? Math.round(postMealObs.reduce((acc, o) => acc + o.numericValue, 0) / postMealObs.length)
        : null;

      const fastingInTargetPercent = fastingObs.length > 0
        ? Math.round((fastingObs.filter((o) => o.numericValue >= targetFastingMin && o.numericValue <= targetFastingMax).length / fastingObs.length) * 1000) / 10
        : null;
      const postMealInTargetPercent = postMealObs.length > 0
        ? Math.round((postMealObs.filter((o) => o.numericValue >= 70 && o.numericValue <= targetPostMealMax).length / postMealObs.length) * 1000) / 10
        : null;

      const variance = values.reduce((acc, value) => acc + ((value - overallAvg) ** 2), 0) / totalCount;
      const standardDeviation = Math.round(Math.sqrt(variance) * 10) / 10;
      const coefficientOfVariationPercent = overallAvg > 0
        ? Math.round((standardDeviation / overallAvg) * 1000) / 10
        : null;
      const dataSufficiency: PatientHealthContextData['glucoseMetrics']['dataSufficiency'] =
        totalCount === 0 ? 'NONE' : totalCount < 14 ? 'LIMITED' : 'ADEQUATE';

      let highest = observations[0];
      let lowest = observations[0];
      let inRangeCount = 0;
      let hypoCount = 0;
      let severeHypoCount = 0;
      let hyperCount = 0;

      for (const obs of observations) {
        if (obs.numericValue > highest.numericValue) highest = obs;
        if (obs.numericValue < lowest.numericValue) lowest = obs;
        if (obs.numericValue >= 70 && obs.numericValue <= 180) inRangeCount++;
        if (obs.numericValue < 70) hypoCount++;
        if (obs.numericValue < 54) severeHypoCount++;
        if (obs.numericValue > 180) hyperCount++;
      }

      const tirPercent = Math.round((inRangeCount / totalCount) * 1000) / 10;

      // 7-day vs prior 7-day comparison
      const recent7dObs = observations.filter(o => o.observedAt >= sevenDaysAgo);
      const prior7dObs = observations.filter(o => o.observedAt >= fourteenDaysAgo && o.observedAt < sevenDaysAgo);

      let trendDirection: PatientHealthContextData['glucoseMetrics']['trend7dVsPrior7d']['direction'] = 'INSUFFICIENT_DATA';
      let recent7dAvg: number | null = null;
      let prior7dAvg: number | null = null;
      let changeDelta: number | null = null;
      let percentChange: number | null = null;

      if (recent7dObs.length > 0 && prior7dObs.length > 0) {
        recent7dAvg = Math.round(recent7dObs.reduce((a, b) => a + b.numericValue, 0) / recent7dObs.length);
        prior7dAvg = Math.round(prior7dObs.reduce((a, b) => a + b.numericValue, 0) / prior7dObs.length);
        changeDelta = recent7dAvg - prior7dAvg;
        percentChange = Math.round(((changeDelta / prior7dAvg) * 100) * 10) / 10;

        if (Math.abs(changeDelta) <= 3) {
          trendDirection = 'STABLE';
        } else if (changeDelta > 3) {
          trendDirection = 'INCREASING';
        } else {
          trendDirection = 'DECREASING';
        }
      } else if (recent7dObs.length > 0) {
        recent7dAvg = Math.round(recent7dObs.reduce((a, b) => a + b.numericValue, 0) / recent7dObs.length);
      }

      glucoseMetrics = {
        totalReadings30d: totalCount,
        overallAverage: overallAvg,
        fastingAverage: fastingAvg,
        postMealAverage: postMealAvg,
        highest: { value: highest.numericValue, date: highest.observedAt.toISOString() },
        lowest: { value: lowest.numericValue, date: lowest.observedAt.toISOString() },
        timeInRangePercent: tirPercent,
        fastingInTargetPercent,
        postMealInTargetPercent,
        standardDeviation,
        coefficientOfVariationPercent,
        dataSufficiency,
        hypoCount,
        severeHypoCount,
        hyperCount,
        trend7dVsPrior7d: {
          recent7dAvg,
          prior7dAvg,
          changeDelta,
          percentChange,
          direction: trendDirection,
        },
        recentReadings: observations.slice(0, 10).map(o => ({
          value: o.numericValue,
          context: o.context,
          date: o.observedAt.toISOString(),
        })),
      };
    }
  }

  // 3. Medications & Adherence
  const medicationsList: PatientHealthContextData['medications'] = [];
  let adherenceData: PatientHealthContextData['medicationAdherence'] = {
    adherenceRatePercent: 100,
    takenDosesCount: 0,
    scheduledOrReportedCount: 0,
    skippedCount: 0,
    missedCount: 0,
    recentEvents: [],
  };

  if (filterPermissions?.canViewMedications !== false) {
    const medSchedules = await prisma.medicationSchedule.findMany({
      where: {
        userId: patientId,
        status: 'ACTIVE',
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    for (const m of medSchedules) {
      medicationsList.push({
        id: m.id,
        medicineName: m.medicineName || m.medicationName || 'Medication',
        dosage: m.dosage || m.dosageInstruction || 'As directed',
        timing: m.timing || 'Daily',
        instructions: m.foodInstructions || m.instructions || null,
        prescriber: m.prescriber || 'Treating Doctor',
        status: m.status,
      });
    }

    const adherenceEvents = await prisma.medicationAdherenceEvent.findMany({
      where: {
        userId: patientId,
        recordedAt: { gte: thirtyDaysAgo },
      },
      include: {
        medication: {
          select: { medicineName: true },
        },
      },
      orderBy: { recordedAt: 'desc' },
      take: 50,
    });

    if (adherenceEvents.length > 0) {
      let takenCount = 0;
      let skippedCount = 0;
      let missedCount = 0;

      for (const ev of adherenceEvents) {
        if (ev.action === 'TAKEN') takenCount++;
        else if (ev.action === 'SKIPPED') skippedCount++;
        else if (ev.action === 'MISSED') missedCount++;
      }

      const totalReported = adherenceEvents.length;
      const rate = totalReported > 0 ? Math.round((takenCount / totalReported) * 100) : 100;

      adherenceData = {
        adherenceRatePercent: rate,
        takenDosesCount: takenCount,
        scheduledOrReportedCount: totalReported,
        skippedCount,
        missedCount,
        recentEvents: adherenceEvents.slice(0, 5).map(ev => ({
          action: ev.action,
          scheduledTime: ev.scheduledTime.toISOString(),
          medicineName: ev.medication.medicineName || 'Medication',
        })),
      };
    }
  }

  // 4. Care Plan
  let carePlanData: PatientHealthContextData['carePlan'] = null;
  const activeCarePlan = await prisma.carePlan.findFirst({
    where: {
      patientId,
      status: 'ACTIVE',
    },
    include: {
      goals: true,
      activities: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  if (activeCarePlan) {
    carePlanData = {
      title: activeCarePlan.title,
      diagnosis: activeCarePlan.diagnosis,
      doctorInstructions: activeCarePlan.doctorInstructions,
      goals: activeCarePlan.goals.map(g => ({
        title: g.title,
        targetValue: g.targetValue,
      })),
      activities: activeCarePlan.activities.map(a => ({
        title: a.title,
        category: a.category,
        instructions: a.instructions,
      })),
    };
  }

  // 5. Tasks & Reminders
  const tasksList: PatientHealthContextData['tasks'] = [];
  if (filterPermissions?.canViewTasks !== false) {
    const rawTasks = await prisma.careTask.findMany({
      where: {
        userId: patientId,
        status: { in: ['PENDING', 'OVERDUE'] },
      },
      orderBy: { dueAt: 'asc' },
      take: 10,
    });

    for (const t of rawTasks) {
      tasksList.push({
        id: t.id,
        title: t.title,
        priority: t.priority,
        status: t.status,
        dueAt: t.dueAt.toISOString(),
        instructions: t.instructions,
      });
    }
  }

  const rawReminders = await prisma.reminder.findMany({
    where: {
      userId: patientId,
      status: 'SCHEDULED',
    },
    orderBy: { remindAt: 'asc' },
    take: 10,
  });

  const remindersList = rawReminders.map(r => ({
    id: r.id,
    title: r.title,
    remindAt: r.remindAt.toISOString(),
    status: r.status,
  }));

  // 6. Appointments
  const rawAppointments = await prisma.appointment.findMany({
    where: {
      patientId,
      status: { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED'] },
      scheduledAt: { gte: now },
    },
    include: {
      doctor: {
        select: {
          profile: {
            select: { fullName: true },
          },
        },
      },
    },
    orderBy: { scheduledAt: 'asc' },
    take: 5,
  });

  const appointmentsList = rawAppointments.map(a => ({
    id: a.id,
    doctorName: a.doctor?.profile?.fullName || 'Assigned Physician',
    scheduledAt: a.scheduledAt.toISOString(),
    status: a.status,
    clinicName: a.clinicName,
    visitType: a.visitType,
  }));

  // 7. Approved Consultation Summaries
  // Strictly enforce: status: 'APPROVED' AND sharedWithPatient: true.
  // Drafts, raw audio, and raw transcripts are completely excluded.
  const approvedNotesList: PatientHealthContextData['approvedConsultations'] = [];
  if (filterPermissions?.canViewConsultations !== false) {
    const rawNotes = await prisma.consultationNote.findMany({
      where: {
        userId: patientId,
        status: 'APPROVED',
        sharedWithPatient: true,
      },
      orderBy: { approvedAt: 'desc' },
      take: 5,
    });

    for (const n of rawNotes) {
      let summaryText = n.approvedNoteText || '';
      if (!summaryText && n.structuredNote) {
        try {
          const parsed = JSON.parse(n.structuredNote);
          summaryText = parsed.assessmentAndPlan || parsed.clinicalSummary || parsed.plan || 'Consultation summary on record.';
        } catch {
          summaryText = 'Doctor consultation note approved.';
        }
      }

      approvedNotesList.push({
        id: n.id,
        clinicianName: n.clinicianName || 'Doctor',
        approvedAt: n.approvedAt ? n.approvedAt.toISOString() : n.createdAt.toISOString(),
        summaryText: summaryText.trim(),
      });
    }
  }

  // 8. Health Reports
  const rawReports = await prisma.healthDocument.findMany({
    where: {
      userId: patientId,
      category: { in: ['LAB_REPORT', 'CLINICAL_SUMMARY', 'PRESCRIPTION_SCAN'] },
    },
    orderBy: { reportDate: 'desc' },
    take: 5,
  });

  const reportsList = rawReports.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    reportDate: r.reportDate.toISOString(),
    notes: r.notes,
  }));

  return {
    patientId,
    fullName,
    diabetesType,
    targetFastingMin,
    targetFastingMax,
    targetPostMealMax,
    glucoseMetrics,
    medications: medicationsList,
    medicationAdherence: adherenceData,
    carePlan: carePlanData,
    tasks: tasksList,
    reminders: remindersList,
    appointments: appointmentsList,
    approvedConsultations: approvedNotesList,
    medicalReports: reportsList,
  };
}
