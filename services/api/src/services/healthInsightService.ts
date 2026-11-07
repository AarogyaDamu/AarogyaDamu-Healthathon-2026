import type {
  HealthInsight,
  JourneyProgressSummary,
  JourneyMilestoneItem,
} from '@aarogyadamu/contracts';

import { prisma } from '../db/prisma';

const NON_CAUSATION_DISCLAIMER =
  'Progress observations are descriptive statistical calculations based on recorded data and doctor-defined care plans. Blood glucose dynamics are multi-factorial and influenced by nutrition, exercise, illness, stress, and medications. AarogyaDamu does not assert medical causation or replace clinical judgment.';

export class HealthInsightService {
  /**
   * Idempotently detects and records care journey milestones based on verified application events.
   */
  static async generatePatientMilestones(patientId: string): Promise<JourneyMilestoneItem[]> {
    const milestonesToUpsert: Array<{
      milestoneKey: string;
      title: string;
      description: string;
      achievedAt: Date;
      eventRefType: string;
      eventRefId: string;
      actorId?: string;
      metadata?: Record<string, unknown>;
    }> = [];

    // 1. First Glucose Reading
    const firstObs = await prisma.healthObservation.findFirst({
      where: { userId: patientId },
      orderBy: { observedAt: 'asc' },
    });
    if (firstObs) {
      milestonesToUpsert.push({
        milestoneKey: 'FIRST_GLUCOSE_READING',
        title: 'First Blood Glucose Logged',
        description: `First glucose observation recorded (${firstObs.numericValue} ${firstObs.unit}).`,
        achievedAt: firstObs.observedAt,
        eventRefType: 'HealthObservation',
        eventRefId: firstObs.id,
        metadata: { numericValue: firstObs.numericValue, unit: firstObs.unit, context: firstObs.context },
      });
    }

    // 2. First Care Task Completed
    const firstCompletedTask = await prisma.careTask.findFirst({
      where: { userId: patientId, status: 'COMPLETED' },
      orderBy: { completedAt: 'asc' },
    });
    if (firstCompletedTask && firstCompletedTask.completedAt) {
      milestonesToUpsert.push({
        milestoneKey: 'FIRST_TASK_COMPLETED',
        title: 'First Care Task Completed',
        description: `Completed doctor-assigned task: ${firstCompletedTask.title}`,
        achievedAt: firstCompletedTask.completedAt,
        eventRefType: 'CareTask',
        eventRefId: firstCompletedTask.id,
        actorId: firstCompletedTask.completedById || patientId,
        metadata: { category: firstCompletedTask.category, priority: firstCompletedTask.priority },
      });
    }

    // 3. Care Plan Initiated
    const activeCarePlan = await prisma.carePlan.findFirst({
      where: { patientId, status: { in: ['ACTIVE', 'SUPERSEDED'] } },
      orderBy: { createdAt: 'asc' },
    });
    if (activeCarePlan) {
      milestonesToUpsert.push({
        milestoneKey: 'CARE_PLAN_INITIATED',
        title: 'Doctor Care Plan Established',
        description: `Active clinical care plan version ${activeCarePlan.version} established.`,
        achievedAt: activeCarePlan.approvedAt || activeCarePlan.createdAt,
        eventRefType: 'CarePlan',
        eventRefId: activeCarePlan.id,
        metadata: { title: activeCarePlan.title, version: activeCarePlan.version },
      });
    }

    // 4. First Doctor Consultation / Approved Clinical Note
    const firstConsult = await prisma.consultationNote.findFirst({
      where: { userId: patientId, status: 'APPROVED' },
      orderBy: { approvedAt: 'asc' },
    });
    if (firstConsult && firstConsult.approvedAt) {
      milestonesToUpsert.push({
        milestoneKey: 'FIRST_CONSULTATION',
        title: 'First Doctor Consultation Completed',
        description: `Clinical consultation documented and approved with ${firstConsult.clinicianName}.`,
        achievedAt: firstConsult.approvedAt,
        eventRefType: 'ConsultationNote',
        eventRefId: firstConsult.id,
        actorId: firstConsult.clinicianId,
        metadata: { clinicianName: firstConsult.clinicianName },
      });
    }

    // 5. First Medication Dose Taken
    const firstTakenDose = await prisma.medicationAdherenceEvent.findFirst({
      where: { userId: patientId, action: 'TAKEN' },
      orderBy: { recordedAt: 'asc' },
    });
    if (firstTakenDose) {
      milestonesToUpsert.push({
        milestoneKey: 'FIRST_MEDICATION_TAKEN',
        title: 'Medication Adherence Initiated',
        description: 'First prescribed medication dose recorded as taken in Med Vault.',
        achievedAt: firstTakenDose.recordedAt,
        eventRefType: 'MedicationAdherenceEvent',
        eventRefId: firstTakenDose.id,
        actorId: firstTakenDose.userId,
        metadata: { medicationId: firstTakenDose.medicationId, action: firstTakenDose.action },
      });
    }

    // Upsert detected milestones idempotently
    for (const m of milestonesToUpsert) {
      await prisma.journeyMilestone.upsert({
        where: {
          userId_milestoneKey: {
            userId: patientId,
            milestoneKey: m.milestoneKey,
          },
        },
        create: {
          userId: patientId,
          milestoneKey: m.milestoneKey,
          title: m.title,
          description: m.description,
          achievedAt: m.achievedAt,
          eventRefType: m.eventRefType,
          eventRefId: m.eventRefId,
          actorId: m.actorId,
          metadata: m.metadata ? JSON.stringify(m.metadata) : null,
        },
        update: {
          // Preserve historical achievedAt timestamp once created
          title: m.title,
          description: m.description,
        },
      });
    }

    const recorded = await prisma.journeyMilestone.findMany({
      where: { userId: patientId },
      orderBy: { achievedAt: 'asc' },
    });

    return recorded.map((r) => ({
      id: r.id,
      userId: r.userId,
      milestoneKey: r.milestoneKey,
      title: r.title,
      description: r.description,
      achievedAt: r.achievedAt.toISOString(),
      eventRefType: r.eventRefType,
      eventRefId: r.eventRefId,
      actorId: r.actorId,
      metadata: r.metadata ? JSON.parse(r.metadata) : undefined,
    }));
  }

  /**
   * Generates deterministic, validated health insights across glucose, medications, care plans, and appointments.
   */
  static async calculateHealthInsights(patientId: string): Promise<HealthInsight[]> {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 86400000);
    const fourteenDaysAgo = new Date(now - 14 * 86400000);
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const [
      profile,
      obs30Days,
      prescriptions,
      adherence30Days,
      activePlan,
      tasks,
      appointments,
      approvedConsultations,
    ] = await Promise.all([
      prisma.patientProfile.findUnique({ where: { userId: patientId } }),
      prisma.healthObservation.findMany({
        where: { userId: patientId, observedAt: { gte: thirtyDaysAgo } },
        orderBy: { observedAt: 'desc' },
      }),
      prisma.medicationSchedule.findMany({
        where: { userId: patientId, isActive: true },
      }),
      prisma.medicationAdherenceEvent.findMany({
        where: { userId: patientId, scheduledTime: { gte: thirtyDaysAgo } },
        orderBy: { scheduledTime: 'desc' },
      }),
      prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: { goals: true, activities: true },
        orderBy: { version: 'desc' },
      }),
      prisma.careTask.findMany({
        where: { userId: patientId },
        orderBy: { dueAt: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { patientId, scheduledAt: { gte: new Date(now - 24 * 3600000) } },
        include: { doctor: { select: { id: true, email: true, profile: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.consultationNote.findMany({
        where: { userId: patientId, status: 'APPROVED', sharedWithPatient: true },
        orderBy: { approvedAt: 'desc' },
        take: 3,
      }),
    ]);

    const insights: HealthInsight[] = [];
    const createdIso = new Date().toISOString();

    // =========================================================================
    // 1. GLUCOSE INSIGHTS
    // =========================================================================
    const glucoseObs = obs30Days.filter((o) => o.type === 'BLOOD_GLUCOSE' || o.type === 'GLUCOSE');
    const totalGlucoseReadings = glucoseObs.length;

    if (totalGlucoseReadings === 0) {
      insights.push({
        id: `ins-gluc-none-${patientId}`,
        category: 'GLUCOSE',
        title: 'No Glucose Readings Recorded',
        summary:
          'No blood glucose readings were recorded in the past 30 days. Regular logging helps your doctor evaluate your glycemic control.',
        periodLabel: 'Past 30 Days',
        readingCount: 0,
        confidence: 1.0,
        dataSufficiency: 'INSUFFICIENT',
        isActionable: true,
        suggestedDiscussion: 'Discuss a comfortable self-monitoring schedule with your doctor.',
        sourceReference: 'HealthObservation (0 records)',
        createdAt: createdIso,
      });
    } else if (totalGlucoseReadings < 3) {
      insights.push({
        id: `ins-gluc-limited-${patientId}`,
        category: 'GLUCOSE',
        title: 'Limited Glucose Records (Insufficient for Trends)',
        summary: `Only ${totalGlucoseReadings} glucose reading(s) recorded in the past 30 days. At least 3 verified readings are required to calculate trend statistics without distortion.`,
        periodLabel: 'Past 30 Days',
        readingCount: totalGlucoseReadings,
        confidence: 0.6,
        dataSufficiency: 'INSUFFICIENT',
        isActionable: true,
        suggestedDiscussion: 'Aim to record fasting and 2-hour post-meal readings regularly as prescribed.',
        sourceReference: `HealthObservation (${totalGlucoseReadings} records)`,
        createdAt: createdIso,
      });
    } else {
      // 7-day vs Prior 7-day Trend Analysis
      const obs7Days = glucoseObs.filter((o) => o.observedAt >= sevenDaysAgo);
      const obsPrior7Days = glucoseObs.filter(
        (o) => o.observedAt < sevenDaysAgo && o.observedAt >= fourteenDaysAgo
      );

      const fastingMin = profile?.targetFastingMin ?? 80;
      const postMealMax = profile?.targetPostMealMax ?? 180;

      // Time-in-Range (TIR)
      const inRangeCount = glucoseObs.filter(
        (o) => o.numericValue >= fastingMin && o.numericValue <= postMealMax
      ).length;
      const tirPercentage = Math.round((inRangeCount / totalGlucoseReadings) * 100);

      const avg30Days = Math.round(
        glucoseObs.reduce((sum, o) => sum + o.numericValue, 0) / totalGlucoseReadings
      );

      // Fasting readings
      const fastingReadings = glucoseObs.filter((o) => o.context === 'FASTING');
      const avgFasting =
        fastingReadings.length > 0
          ? Math.round(fastingReadings.reduce((sum, o) => sum + o.numericValue, 0) / fastingReadings.length)
          : null;

      if (obs7Days.length >= 2 && obsPrior7Days.length >= 2) {
        const avg7d = Math.round(
          obs7Days.reduce((sum, o) => sum + o.numericValue, 0) / obs7Days.length
        );
        const avgPrior7d = Math.round(
          obsPrior7Days.reduce((sum, o) => sum + o.numericValue, 0) / obsPrior7Days.length
        );
        const delta = avg7d - avgPrior7d;

        let trendTitle = 'Recorded Glucose Relatively Stable';
        let trendSummary = `Your average recorded blood glucose this week was ${avg7d} mg/dL compared to ${avgPrior7d} mg/dL the prior week (difference: ${Math.abs(delta)} mg/dL).`;

        if (delta > 5) {
          trendTitle = 'Recorded Glucose Higher This Week';
          trendSummary = `Your average recorded glucose this week was ${avg7d} mg/dL, which is ${delta} mg/dL higher than the prior week (${avgPrior7d} mg/dL).`;
        } else if (delta < -5) {
          trendTitle = 'Recorded Glucose Lower This Week';
          trendSummary = `Your average recorded glucose this week was ${avg7d} mg/dL, which is ${Math.abs(delta)} mg/dL lower than the prior week (${avgPrior7d} mg/dL).`;
        }

        insights.push({
          id: `ins-gluc-trend-${patientId}`,
          category: 'GLUCOSE',
          title: trendTitle,
          summary: `${trendSummary} ${NON_CAUSATION_DISCLAIMER}`,
          periodLabel: 'Last 7 Days vs Prior 7 Days',
          readingCount: obs7Days.length + obsPrior7Days.length,
          confidence: 0.9,
          dataSufficiency: 'SUFFICIENT',
          isActionable: Math.abs(delta) > 15,
          suggestedDiscussion: Math.abs(delta) > 15 ? 'Discuss weekly glucose variability with your doctor.' : undefined,
          sourceReference: `HealthObservation: 7d (${obs7Days.length} logs), prior 7d (${obsPrior7Days.length} logs)`,
          createdAt: createdIso,
        });
      }

      // Time-in-Range Insight
      insights.push({
        id: `ins-gluc-tir-${patientId}`,
        category: 'GLUCOSE',
        title: `Time-In-Range: ${tirPercentage}%`,
        summary: `Over the past 30 days, ${inRangeCount} of ${totalGlucoseReadings} recorded readings (${tirPercentage}%) fell within clinical targets (${fastingMin} - ${postMealMax} mg/dL). Average glucose across all readings is ${avg30Days} mg/dL.`,
        periodLabel: 'Past 30 Days',
        readingCount: totalGlucoseReadings,
        confidence: 0.95,
        dataSufficiency: 'SUFFICIENT',
        isActionable: tirPercentage < 70,
        suggestedDiscussion: tirPercentage < 70 ? 'Share your Time-in-Range with your doctor to review your glycemic targets.' : undefined,
        sourceReference: `HealthObservation (${totalGlucoseReadings} readings, targets: ${fastingMin}-${postMealMax} mg/dL)`,
        createdAt: createdIso,
      });

      // Fasting average insight if present
      if (avgFasting !== null) {
        insights.push({
          id: `ins-gluc-fasting-${patientId}`,
          category: 'GLUCOSE',
          title: `Fasting Glucose Average: ${avgFasting} mg/dL`,
          summary: `Calculated from ${fastingReadings.length} fasting measurements over the past 30 days. Doctor-prescribed fasting target is ${fastingMin} - ${profile?.targetFastingMax ?? 130} mg/dL.`,
          periodLabel: 'Past 30 Days (Fasting)',
          readingCount: fastingReadings.length,
          confidence: 0.92,
          dataSufficiency: 'SUFFICIENT',
          isActionable: avgFasting > (profile?.targetFastingMax ?? 130),
          sourceReference: `HealthObservation: ${fastingReadings.length} fasting readings`,
          createdAt: createdIso,
        });
      }

      // Check for reading gap (>48 hours since last reading)
      const latestReadingTime = new Date(glucoseObs[0].observedAt).getTime();
      const hoursSinceLast = Math.round((now - latestReadingTime) / 3600000);
      if (hoursSinceLast >= 48) {
        insights.push({
          id: `ins-gluc-gap-${patientId}`,
          category: 'GLUCOSE',
          title: `Logging Reminder: ${Math.round(hoursSinceLast / 24)} Days Since Last Log`,
          summary: `Your last glucose log was recorded ${Math.round(hoursSinceLast / 24)} days ago. Consistent self-monitoring provides valuable longitudinal patterns for your healthcare team.`,
          periodLabel: 'Recent Recording Consistency',
          readingCount: 1,
          confidence: 0.88,
          dataSufficiency: 'LIMITED',
          isActionable: true,
          suggestedDiscussion: 'Set up optional logging reminders to stay on schedule.',
          sourceReference: `HealthObservation: latest at ${glucoseObs[0].observedAt.toISOString()}`,
          createdAt: createdIso,
        });
      }
    }

    // =========================================================================
    // 2. MEDICATION ADHERENCE INSIGHTS
    // =========================================================================
    if (prescriptions.length === 0) {
      insights.push({
        id: `ins-med-none-${patientId}`,
        category: 'MEDICATION',
        title: 'No Active Prescriptions in Med Vault',
        summary: 'No active doctor prescriptions are on record. Prescriptions can only be added by your treating physician.',
        periodLabel: 'Active Med Vault',
        readingCount: 0,
        confidence: 1.0,
        dataSufficiency: 'SUFFICIENT',
        isActionable: false,
        sourceReference: 'MedicationSchedule (0 active records)',
        createdAt: createdIso,
      });
    } else {
      const takenDoses = adherence30Days.filter((e) => e.action === 'TAKEN');
      const skippedDoses = adherence30Days.filter((e) => e.action === 'SKIPPED');
      const totalRecordedDoses = adherence30Days.length;

      const adherenceRate =
        totalRecordedDoses > 0 ? Math.round((takenDoses.length / totalRecordedDoses) * 100) : 100;

      // 7-day adherence
      const adherence7Days = adherence30Days.filter((e) => e.scheduledTime >= sevenDaysAgo);
      const taken7Days = adherence7Days.filter((e) => e.action === 'TAKEN');
      const weeklyRate =
        adherence7Days.length > 0 ? Math.round((taken7Days.length / adherence7Days.length) * 100) : 100;

      insights.push({
        id: `ins-med-adherence-${patientId}`,
        category: 'MEDICATION',
        title: `Medication Adherence: ${adherenceRate}%`,
        summary: `You have ${prescriptions.length} doctor-prescribed medication(s). In the past 30 days, ${takenDoses.length} of ${totalRecordedDoses} recorded dose events were taken (${adherenceRate}% adherence). Past 7-day adherence is ${weeklyRate}%.`,
        periodLabel: 'Past 30 Days',
        readingCount: totalRecordedDoses,
        confidence: 0.95,
        dataSufficiency: totalRecordedDoses >= 5 ? 'SUFFICIENT' : 'LIMITED',
        isActionable: adherenceRate < 80,
        suggestedDiscussion:
          adherenceRate < 80
            ? 'Discuss any medication side effects or scheduling difficulties with your doctor.'
            : undefined,
        sourceReference: `MedicationAdherenceEvent (${totalRecordedDoses} events, ${prescriptions.length} active prescriptions)`,
        createdAt: createdIso,
      });
    }

    // =========================================================================
    // 3. CARE PLAN & DOCTOR TASK INSIGHTS
    // =========================================================================
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
    const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const overdueTasks = pendingTasks.filter(
      (t) => new Date(t.dueAt).getTime() < startOfToday.getTime()
    );

    if (totalTasks > 0) {
      const completionRate = Math.round((completedTasks.length / totalTasks) * 100);

      if (overdueTasks.length > 0) {
        insights.push({
          id: `ins-task-overdue-${patientId}`,
          category: 'CARE_PLAN',
          title: `${overdueTasks.length} Doctor Care Task(s) Overdue`,
          summary: `You have ${overdueTasks.length} doctor-assigned task(s) past their scheduled due date. Completing your care activities supports your diabetes management goals.`,
          periodLabel: 'Active Tasks',
          readingCount: overdueTasks.length,
          confidence: 1.0,
          dataSufficiency: 'SUFFICIENT',
          isActionable: true,
          suggestedDiscussion: 'Review overdue tasks in the Tasks section and discuss any blockers with your clinician.',
          sourceReference: `CareTask (${overdueTasks.length} overdue of ${totalTasks} total)`,
          createdAt: createdIso,
        });
      } else {
        insights.push({
          id: `ins-task-ontrack-${patientId}`,
          category: 'CARE_PLAN',
          title: `Care Plan Tasks: ${completionRate}% Completed`,
          summary: `You have completed ${completedTasks.length} of ${totalTasks} doctor-assigned activities. All active tasks are currently on schedule.`,
          periodLabel: 'Active Tasks',
          readingCount: totalTasks,
          confidence: 0.95,
          dataSufficiency: 'SUFFICIENT',
          isActionable: false,
          sourceReference: `CareTask (${completedTasks.length}/${totalTasks} completed)`,
          createdAt: createdIso,
        });
      }
    }

    // =========================================================================
    // 4. APPOINTMENT & CONSULTATION INSIGHTS
    // =========================================================================
    const upcomingAppts = appointments.filter(
      (a) => new Date(a.scheduledAt).getTime() >= now && a.status !== 'CANCELLED'
    );

    if (upcomingAppts.length > 0) {
      const nextAppt = upcomingAppts[0];
      const isConfirmed = nextAppt.status === 'CONFIRMED';
      const apptDateStr = new Date(nextAppt.scheduledAt).toLocaleDateString('en-IN', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
      const doctorName = nextAppt.doctor.profile?.fullName || nextAppt.doctor.email;

      insights.push({
        id: `ins-appt-next-${nextAppt.id}`,
        category: 'APPOINTMENT',
        title: isConfirmed
          ? `Upcoming Consultation Confirmed (${apptDateStr})`
          : `Consultation Requested (${apptDateStr})`,
        summary: isConfirmed
          ? `Your consultation with ${doctorName} is confirmed for ${apptDateStr}. Reason: ${nextAppt.reason}.`
          : `Your appointment request with ${doctorName} for ${apptDateStr} is awaiting clinic confirmation.`,
        periodLabel: 'Upcoming Schedule',
        readingCount: 1,
        confidence: 1.0,
        dataSufficiency: 'SUFFICIENT',
        isActionable: false,
        suggestedDiscussion: 'Prepare your recent glucose trends and medication questions for your visit.',
        sourceReference: `Appointment (${nextAppt.id}, status: ${nextAppt.status})`,
        createdAt: createdIso,
      });
    }

    if (approvedConsultations.length > 0) {
      const latestConsult = approvedConsultations[0];
      const consultDateStr = latestConsult.approvedAt
        ? new Date(latestConsult.approvedAt).toLocaleDateString('en-IN', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })
        : 'recent';

      insights.push({
        id: `ins-consult-recent-${latestConsult.id}`,
        category: 'CONSULTATION' as any,
        title: `Doctor Consultation Summary Available (${consultDateStr})`,
        summary: `Your treating physician ${latestConsult.clinicianName} approved and shared your clinical consultation summary. Review follow-up recommendations in your Health Timeline.`,
        periodLabel: 'Recent Consultation',
        readingCount: 1,
        confidence: 1.0,
        dataSufficiency: 'SUFFICIENT',
        isActionable: false,
        sourceReference: `ConsultationNote (${latestConsult.id}, approved by ${latestConsult.clinicianName})`,
        createdAt: createdIso,
      });
    }

    return insights;
  }

  /**
   * Assembles the complete progress dashboard summary across all domains.
   */
  static async getJourneyProgressSummary(patientId: string): Promise<JourneyProgressSummary> {
    const now = Date.now();
    const sevenDaysAgo = new Date(now - 7 * 86400000);
    const fourteenDaysAgo = new Date(now - 14 * 86400000);
    const thirtyDaysAgo = new Date(now - 30 * 86400000);

    const [
      profile,
      obs30Days,
      prescriptions,
      adherence30Days,
      activePlan,
      tasks,
      appointments,
      approvedConsultations,
      milestones,
      insights,
    ] = await Promise.all([
      prisma.patientProfile.findUnique({ where: { userId: patientId } }),
      prisma.healthObservation.findMany({
        where: { userId: patientId, observedAt: { gte: thirtyDaysAgo } },
        orderBy: { observedAt: 'desc' },
      }),
      prisma.medicationSchedule.findMany({
        where: { userId: patientId, isActive: true },
      }),
      prisma.medicationAdherenceEvent.findMany({
        where: { userId: patientId, scheduledTime: { gte: thirtyDaysAgo } },
        orderBy: { scheduledTime: 'desc' },
      }),
      prisma.carePlan.findFirst({
        where: { patientId, status: 'ACTIVE' },
        include: { goals: true, activities: true },
        orderBy: { version: 'desc' },
      }),
      prisma.careTask.findMany({
        where: { userId: patientId },
        orderBy: { dueAt: 'asc' },
      }),
      prisma.appointment.findMany({
        where: { patientId, scheduledAt: { gte: new Date(now - 24 * 3600000) } },
        include: { doctor: { select: { id: true, email: true, profile: true } } },
        orderBy: { scheduledAt: 'asc' },
      }),
      prisma.consultationNote.findMany({
        where: { userId: patientId, status: 'APPROVED', sharedWithPatient: true },
        orderBy: { approvedAt: 'desc' },
        take: 5,
      }),
      this.generatePatientMilestones(patientId),
      this.calculateHealthInsights(patientId),
    ]);

    // Glucose calculations
    const glucoseObs = obs30Days.filter((o) => o.type === 'BLOOD_GLUCOSE' || o.type === 'GLUCOSE');
    const total30d = glucoseObs.length;
    const obs7d = glucoseObs.filter((o) => o.observedAt >= sevenDaysAgo);
    const obsPrior7d = glucoseObs.filter(
      (o) => o.observedAt < sevenDaysAgo && o.observedAt >= fourteenDaysAgo
    );

    const avg30d = total30d > 0 ? Math.round(glucoseObs.reduce((s, o) => s + o.numericValue, 0) / total30d) : null;
    const avg7d = obs7d.length > 0 ? Math.round(obs7d.reduce((s, o) => s + o.numericValue, 0) / obs7d.length) : null;
    const avgPrior7d =
      obsPrior7d.length > 0
        ? Math.round(obsPrior7d.reduce((s, o) => s + o.numericValue, 0) / obsPrior7d.length)
        : null;

    let trendDelta: number | null = null;
    let trendDirection: 'INCREASING' | 'DECREASING' | 'STABLE' | 'INSUFFICIENT_DATA' =
      'INSUFFICIENT_DATA';

    if (avg7d !== null && avgPrior7d !== null) {
      trendDelta = avg7d - avgPrior7d;
      if (trendDelta > 5) trendDirection = 'INCREASING';
      else if (trendDelta < -5) trendDirection = 'DECREASING';
      else trendDirection = 'STABLE';
    } else if (total30d >= 3) {
      trendDirection = 'STABLE';
    }

    const fastingMin = profile?.targetFastingMin ?? 80;
    const postMealMax = profile?.targetPostMealMax ?? 180;

    const inRangeCount = glucoseObs.filter(
      (o) => o.numericValue >= fastingMin && o.numericValue <= postMealMax
    ).length;
    const tirPct = total30d > 0 ? Math.round((inRangeCount / total30d) * 100) : 0;

    const fastingReadings = glucoseObs.filter((o) => o.context === 'FASTING');
    const postMealReadings = glucoseObs.filter((o) => o.context === 'POST_MEAL_2HR' || o.context === 'PRE_MEAL');
    const avgFasting =
      fastingReadings.length > 0
        ? Math.round(fastingReadings.reduce((s, o) => s + o.numericValue, 0) / fastingReadings.length)
        : null;
    const avgPostMeal =
      postMealReadings.length > 0
        ? Math.round(postMealReadings.reduce((s, o) => s + o.numericValue, 0) / postMealReadings.length)
        : null;

    const hypoCount = glucoseObs.filter((o) => o.numericValue < 70).length;
    const hyperCount = glucoseObs.filter((o) => o.numericValue > postMealMax).length;

    // Check missing measurement period
    let missingMeasurementAlert: string | null = null;
    if (total30d > 0) {
      const hoursSinceLast = Math.round((now - new Date(glucoseObs[0].observedAt).getTime()) / 3600000);
      if (hoursSinceLast >= 48) {
        missingMeasurementAlert = `No blood glucose logs recorded in the last ${Math.round(hoursSinceLast / 24)} days.`;
      }
    } else {
      missingMeasurementAlert = 'No blood glucose logs recorded in the past 30 days.';
    }

    // Medication calculations
    const takenDoses = adherence30Days.filter((e) => e.action === 'TAKEN');
    const skippedDoses = adherence30Days.filter((e) => e.action === 'SKIPPED');
    const totalAdherenceDoses = adherence30Days.length;
    const unconfirmedDoses = Math.max(0, prescriptions.length * 30 - totalAdherenceDoses);

    const adherenceRatePct =
      totalAdherenceDoses > 0 ? Math.round((takenDoses.length / totalAdherenceDoses) * 100) : 100;

    const adherence7d = adherence30Days.filter((e) => e.scheduledTime >= sevenDaysAgo);
    const taken7d = adherence7d.filter((e) => e.action === 'TAKEN');
    const weeklyAdherencePct =
      adherence7d.length > 0 ? Math.round((taken7d.length / adherence7d.length) * 100) : 100;

    // Care task calculations
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED');
    const pendingTasks = tasks.filter((t) => t.status === 'PENDING');
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const overdueTasks = pendingTasks.filter(
      (t) => new Date(t.dueAt).getTime() < startOfToday.getTime()
    );
    const completionRatePct =
      tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 100;

    // Appointment calculations
    const upcomingAppts = appointments.filter(
      (a) => new Date(a.scheduledAt).getTime() >= now && a.status !== 'CANCELLED'
    );
    const nextAppt = upcomingAppts[0]
      ? {
          id: upcomingAppts[0].id,
          scheduledAt: upcomingAppts[0].scheduledAt.toISOString(),
          doctorName: upcomingAppts[0].doctor.profile?.fullName || upcomingAppts[0].doctor.email,
          reason: upcomingAppts[0].reason,
          isServerConfirmed: upcomingAppts[0].status === 'CONFIRMED',
        }
      : null;

    const latestConsult = approvedConsultations[0]
      ? {
          id: approvedConsultations[0].id,
          clinicianName: approvedConsultations[0].clinicianName,
          approvedAt: approvedConsultations[0].approvedAt
            ? approvedConsultations[0].approvedAt.toISOString()
            : approvedConsultations[0].createdAt.toISOString(),
          summarySnippet:
            approvedConsultations[0].approvedNoteText?.slice(0, 160) || 'Approved clinical documentation',
        }
      : null;

    // Determine current stage
    const currentStageId =
      milestones.length >= 4 ? 'DAILY_MONITORING' : milestones.length >= 2 ? 'CARE_PLAN_APPROVAL' : 'INITIAL_ASSESSMENT';

    return {
      patientId,
      evaluationDate: new Date().toISOString(),
      overallProgress: {
        currentStageId,
        completedStagesCount: Math.min(milestones.length + 2, 9),
        totalStagesCount: 9,
        completionPercentage: Math.min(100, Math.round(((milestones.length + 2) / 9) * 100)),
      },
      glucoseProgress: {
        totalReadings30Days: total30d,
        readings7Days: obs7d.length,
        readingsPrior7Days: obsPrior7d.length,
        averageGlucose30Days: avg30d,
        averageGlucose7Days: avg7d,
        averageGlucosePrior7Days: avgPrior7d,
        trendDelta7Days: trendDelta,
        trendDirection,
        timeInRangePercentage: tirPct,
        fastingAverage: avgFasting,
        postMealAverage: avgPostMeal,
        hypoCount,
        hyperCount,
        missingMeasurementAlert,
        nonCausationDisclaimer: NON_CAUSATION_DISCLAIMER,
      },
      medicationAdherence: {
        prescribedMedicinesCount: prescriptions.length,
        recordedDoses30Days: totalAdherenceDoses,
        takenDosesCount: takenDoses.length,
        skippedDosesCount: skippedDoses.length,
        unconfirmedDosesCount: unconfirmedDoses,
        adherenceRatePercentage: adherenceRatePct,
        weeklyAdherenceRate: weeklyAdherencePct,
      },
      carePlanProgress: {
        activePlanTitle: activePlan?.title || null,
        planVersion: activePlan?.version || null,
        totalTasksAssigned: tasks.length,
        completedTasksCount: completedTasks.length,
        pendingTasksCount: pendingTasks.length,
        overdueTasksCount: overdueTasks.length,
        completionRatePercentage: completionRatePct,
      },
      consultationsAndAppointments: {
        upcomingAppointmentsCount: upcomingAppts.length,
        nextAppointment: nextAppt,
        recentApprovedConsultationsCount: approvedConsultations.length,
        latestApprovedConsultation: latestConsult,
      },
      milestones,
      insights,
    };
  }
}
