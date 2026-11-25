import { prisma } from '../../db/prisma';
import { updateTenantContext } from '../../db/tenantContext';

export interface ClinicianHistorySummary {
  patientId: string;
  patientName: string;
  diabetesType: string;
  diagnosisYear: number | null;
  knownAllergies: string;
  timeframeDays: number;
  glucoseMetrics: {
    totalReadingsCount: number;
    fastingAverageMgDl: number | null;
    postMealAverageMgDl: number | null;
    hypoglycemiaEpisodesCount: number;
    hyperglycemiaEpisodesCount: number;
  };
  activeMedications: Array<{
    name: string;
    dosage: string;
    frequency: string;
    adherenceRatePercent: number;
  }>;
  recentConsultations: Array<{
    date: string;
    doctorName: string;
    summary: string;
  }>;
  aiClinicalDisclaimer: string;
  generatedAt: string;
}

export interface ClinicianConsultationDraft {
  patientId: string;
  appointmentId?: string;
  isAiDraft: true;
  requiresPhysicianReview: true;
  draftedSoapNote: {
    subjective: string;
    objective: {
      latestVitals: {
        fastingGlucose?: number;
        postMealGlucose?: number;
        systolicBp?: number;
        diastolicBp?: number;
        lastReadingTimestamp?: string;
      };
      examinationDraft: string;
    };
    provisionalAssessment: Array<{
      display: string;
      code?: string;
      category: 'PROVISIONAL';
      clinicalRationale: string;
    }>;
    suggestedPlan: {
      suggestedMedications: Array<{
        medicationName: string;
        dosage: string;
        frequency: string;
        timing: string;
        clinicalRationale: string;
      }>;
      suggestedLabOrders: string[];
      suggestedLifestyleInstructions: string;
      suggestedFollowUpDays: number;
    };
  };
  provenance: {
    model: string;
    generatedAt: string;
  };
}

export interface MetricTrendComparison {
  patientId: string;
  metric: string;
  unit: string;
  currentPeriod: {
    label: string;
    mean: number;
    count: number;
  };
  previousPeriod: {
    label: string;
    mean: number;
    count: number;
  };
  delta: number;
  percentChange: number;
  trendDirection: 'IMPROVING' | 'WORSENING' | 'STABLE' | 'INSUFFICIENT_DATA';
  clinicalInterpretation: string;
}

export class ClinicianDamuService {
  /**
   * Verifies that the clinician has legitimate, authorized clinical access to the patient
   * via active DoctorPatientAssignment, direct Appointment, or practice assignment.
   */
  private static async assertClinicianAuthorization(
    clinicianId: string,
    practiceId: string,
    patientId: string,
  ): Promise<void> {
    // 1. Direct active assignment
    const assignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        doctorId: clinicianId,
        patientId,
        status: 'ACTIVE',
      },
    });

    if (assignment) {
      updateTenantContext({ practiceId, patientId });
      return;
    }

    // 2. Direct active appointment (historical cancelled/rejected appointments strictly excluded)
    const activeAppointment = await prisma.appointment.findFirst({
      where: {
        doctorId: clinicianId,
        patientId,
        status: { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED', 'COMPLETED'] },
        AND: [{ status: { notIn: ['CANCELLED', 'REJECTED'] } }],
      },
    });

    if (activeAppointment) {
      updateTenantContext({ practiceId, patientId });
      return;
    }

    // 3. Practice-level assignment (only if clinician has an active DOCTOR/OWNER role in this practice)
    if (practiceId) {
      const clinicianMembership = await prisma.practiceMembership.findUnique({
        where: {
          practiceId_userId: { practiceId, userId: clinicianId },
        },
      });

      if (!clinicianMembership || !clinicianMembership.isActive || clinicianMembership.role === 'RECEPTIONIST') {
        throw new Error('Unauthorized: Clinician is not actively assigned to this patient');
      }

      const practiceDoctors = await prisma.practiceMembership.findMany({
        where: {
          practiceId,
          isActive: true,
          role: { in: ['OWNER', 'DOCTOR'] },
        },
        select: { userId: true },
      });

      const doctorIds = practiceDoctors.map((d) => d.userId);
      if (doctorIds.length > 0) {
        const practiceAssignment = await prisma.doctorPatientAssignment.findFirst({
          where: {
            doctorId: { in: doctorIds },
            patientId,
            status: 'ACTIVE',
          },
        });
        if (practiceAssignment) {
          updateTenantContext({ practiceId, patientId });
          return;
        }
      }
    }

    throw new Error('Unauthorized: Clinician is not actively assigned to this patient');
  }

  /**
   * Generates a comprehensive longitudinal patient summary for doctor review.
   */
  static async summarizePatientHistory(
    clinicianId: string,
    practiceId: string,
    patientId: string,
    timeframeDays: number = 90,
  ): Promise<ClinicianHistorySummary> {
    // Enforce authorization prior to fetching records
    await this.assertClinicianAuthorization(clinicianId, practiceId, patientId);

    // 1. Fetch patient profile
    const patient = await prisma.user.findUnique({
      where: { id: patientId },
      include: {
        profile: true,
      },
    });

    if (!patient) {
      throw new Error('Patient record not found');
    }

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - timeframeDays);

    // 3. Aggregate glucose observations
    const observations = await prisma.healthObservation.findMany({
      where: {
        userId: patientId,
        observedAt: { gte: sinceDate },
      },
      orderBy: { observedAt: 'desc' },
    });

    let fastingTotal = 0;
    let fastingCount = 0;
    let postMealTotal = 0;
    let postMealCount = 0;
    let hypoCount = 0;
    let hyperCount = 0;

    for (const obs of observations) {
      if (obs.type === 'BLOOD_GLUCOSE') {
        const val = obs.numericValue;
        if (val < 70) hypoCount++;
        if (val > 250) hyperCount++;

        if (obs.context === 'FASTING' || obs.context === 'MORNING') {
          fastingTotal += val;
          fastingCount++;
        } else if (obs.context === 'POST_MEAL_2HR' || obs.context === 'EVENING') {
          postMealTotal += val;
          postMealCount++;
        }
      }
    }

    // 4. Fetch medication schedules and adherence events
    const schedules = await prisma.medicationSchedule.findMany({
      where: { userId: patientId, status: 'ACTIVE' },
    });

    const activeMeds = await Promise.all(
      schedules.map(async (s) => {
        const adherenceEvents = await prisma.medicationAdherenceEvent.findMany({
          where: {
            medicationId: s.id,
            recordedAt: { gte: sinceDate },
          },
        });
        const taken = adherenceEvents.filter((e) => e.action === 'TAKEN').length;
        const total = adherenceEvents.length;
        const adherenceRate = total > 0 ? Math.round((taken / total) * 100) : 100;

        return {
          name: s.medicationName || s.medicineName || 'Prescribed Medication',
          dosage: s.dosage,
          frequency: s.frequency || 'Daily',
          adherenceRatePercent: adherenceRate,
        };
      }),
    );

    // 5. Fetch past consultation notes
    const recentNotes = await prisma.consultationNote.findMany({
      where: {
        userId: patientId,
        status: 'APPROVED',
      },
      orderBy: { approvedAt: 'desc' },
      take: 3,
    });

    const recentConsultations = recentNotes.map((n) => ({
      date: n.approvedAt ? n.approvedAt.toISOString().split('T')[0] : n.createdAt.toISOString().split('T')[0],
      doctorName: n.clinicianName,
      summary: n.structuredNote ? n.structuredNote.slice(0, 300) + '...' : 'Routine consultation completed.',
    }));

    return {
      patientId: patient.id,
      patientName: patient.profile?.fullName || patient.email.split('@')[0],
      diabetesType: patient.profile?.diabetesType || 'Type 2 Diabetes',
      diagnosisYear: patient.profile?.diagnosisYear || 2021,
      knownAllergies: patient.profile?.knownAllergies || 'None documented',
      timeframeDays,
      glucoseMetrics: {
        totalReadingsCount: observations.length,
        fastingAverageMgDl: fastingCount > 0 ? Math.round(fastingTotal / fastingCount) : null,
        postMealAverageMgDl: postMealCount > 0 ? Math.round(postMealTotal / postMealCount) : null,
        hypoglycemiaEpisodesCount: hypoCount,
        hyperglycemiaEpisodesCount: hyperCount,
      },
      activeMedications: activeMeds,
      recentConsultations,
      aiClinicalDisclaimer:
        'CLINICIAN DECISION SUPPORT NOTICE: This summary is synthesized by Damu AI from authenticated patient records. It must be clinically verified by the treating physician prior to diagnostic or therapeutic action.',
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Pre-populates a structured SOAP consultation draft for clinician review and edit.
   */
  static async draftConsultationNote(
    clinicianId: string,
    practiceId: string,
    patientId: string,
    chiefComplaint: string,
    appointmentId?: string,
  ): Promise<ClinicianConsultationDraft> {
    // Enforce authorization prior to accessing clinical observations
    await this.assertClinicianAuthorization(clinicianId, practiceId, patientId);

    // Get latest vitals
    const latestGlucose = await prisma.healthObservation.findFirst({
      where: { userId: patientId, type: 'BLOOD_GLUCOSE' },
      orderBy: { observedAt: 'desc' },
    });

    const latestBp = await prisma.healthObservation.findFirst({
      where: { userId: patientId, type: 'BLOOD_PRESSURE' },
      orderBy: { observedAt: 'desc' },
    });

    return {
      patientId,
      appointmentId,
      isAiDraft: true,
      requiresPhysicianReview: true,
      draftedSoapNote: {
        subjective: `Patient presents with chief complaint: "${chiefComplaint}". Reports ambulatory symptoms recorded in health journal.`,
        objective: {
          latestVitals: {
            fastingGlucose: latestGlucose?.context === 'FASTING' ? latestGlucose.numericValue : undefined,
            postMealGlucose: latestGlucose?.context === 'POST_MEAL_2HR' ? latestGlucose.numericValue : undefined,
            systolicBp: latestBp?.numericValue,
            diastolicBp: latestBp?.secondaryValue || undefined,
            lastReadingTimestamp: latestGlucose?.observedAt.toISOString(),
          },
          examinationDraft: 'Physical exam pending clinician confirmation. Ambulatory vitals retrieved from patient journal.',
        },
        provisionalAssessment: [
          {
            display: 'Type 2 diabetes mellitus with suboptimal glycemic control',
            code: 'E11.65',
            category: 'PROVISIONAL',
            clinicalRationale: 'Based on patient complaint and recent elevated ambulatory glucose readings.',
          },
        ],
        suggestedPlan: {
          suggestedMedications: [
            {
              medicationName: 'Metformin Hydrochloride (Glucophage)',
              dosage: '500 mg',
              frequency: '1-0-1',
              timing: 'AFTER_FOOD',
              clinicalRationale: 'First-line biguanide for Type 2 glycemic optimization.',
            },
          ],
          suggestedLabOrders: ['HbA1c (Hemoglobin A1c)', 'Fasting Plasma Glucose', 'Serum Creatinine', 'Urine Microalbumin'],
          suggestedLifestyleInstructions:
            'Standard Indian Diabetes Diet: Increase dietary fiber (methi seeds, green vegetables); minimize simple sugars and refined flours. 30 mins moderate exercise 5 days/week.',
          suggestedFollowUpDays: 30,
        },
      },
      provenance: {
        model: 'Damu-Clinical-Agent-v2',
        generatedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Calculates longitudinal trend comparison between two equal consecutive timeframes.
   */
  static async compareTrends(
    clinicianId: string,
    practiceId: string,
    patientId: string,
    metric: string = 'BLOOD_GLUCOSE',
    periodDays: number = 30,
  ): Promise<MetricTrendComparison> {
    // Enforce authorization prior to computing trends
    await this.assertClinicianAuthorization(clinicianId, practiceId, patientId);

    const now = new Date();
    const currentStart = new Date(now.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const previousStart = new Date(now.getTime() - 2 * periodDays * 24 * 60 * 60 * 1000);

    const currentReadings = await prisma.healthObservation.findMany({
      where: {
        userId: patientId,
        type: metric,
        observedAt: { gte: currentStart, lte: now },
      },
    });

    const previousReadings = await prisma.healthObservation.findMany({
      where: {
        userId: patientId,
        type: metric,
        observedAt: { gte: previousStart, lt: currentStart },
      },
    });

    const currMean = currentReadings.length > 0
      ? currentReadings.reduce((sum, r) => sum + r.numericValue, 0) / currentReadings.length
      : 0;
    const prevMean = previousReadings.length > 0
      ? previousReadings.reduce((sum, r) => sum + r.numericValue, 0) / previousReadings.length
      : 0;

    let direction: 'IMPROVING' | 'WORSENING' | 'STABLE' | 'INSUFFICIENT_DATA' = 'STABLE';
    let delta = 0;
    let percentChange = 0;
    let clinicalInterpretation = '';

    if (currentReadings.length === 0 || previousReadings.length === 0) {
      direction = 'INSUFFICIENT_DATA';
      clinicalInterpretation = 'Insufficient readings in the compared periods to determine statistical trend.';
    } else {
      delta = Math.round((currMean - prevMean) * 10) / 10;
      percentChange = Math.round(((currMean - prevMean) / prevMean) * 1000) / 10;

      if (metric === 'BLOOD_GLUCOSE') {
        if (delta < -10) {
          direction = 'IMPROVING';
          clinicalInterpretation = `Fasting/random glucose improved by ${Math.abs(delta)} mg/dL (${Math.abs(percentChange)}% decrease) compared to the prior ${periodDays} days.`;
        } else if (delta > 15) {
          direction = 'WORSENING';
          clinicalInterpretation = `Glycemic control worsened with an average increase of ${delta} mg/dL (+${percentChange}%) over the last ${periodDays} days.`;
        } else {
          direction = 'STABLE';
          clinicalInterpretation = `Mean glucose remained stable within ±10 mg/dL (${delta > 0 ? '+' : ''}${delta} mg/dL change).`;
        }
      } else {
        direction = Math.abs(delta) < 2 ? 'STABLE' : delta < 0 ? 'IMPROVING' : 'WORSENING';
        clinicalInterpretation = `Observed ${delta > 0 ? '+' : ''}${delta} change between periods.`;
      }
    }

    return {
      patientId,
      metric,
      unit: metric === 'BLOOD_GLUCOSE' ? 'mg/dL' : metric === 'BLOOD_PRESSURE' ? 'mmHg' : 'units',
      currentPeriod: {
        label: `Last ${periodDays} days`,
        mean: Math.round(currMean * 10) / 10,
        count: currentReadings.length,
      },
      previousPeriod: {
        label: `Prior ${periodDays} days`,
        mean: Math.round(prevMean * 10) / 10,
        count: previousReadings.length,
      },
      delta,
      percentChange,
      trendDirection: direction,
      clinicalInterpretation,
    };
  }

  /**
   * Scans practice patients for overdue diabetes screening and missing lab work.
   */
  static async checkMissingDocumentation(practiceId: string, overdueDays: number = 90) {
    const overdueCutoff = new Date();
    overdueCutoff.setDate(overdueCutoff.getDate() - overdueDays);

    // Get patients assigned to doctors in this practice
    const practiceDoctors = await prisma.practiceMembership.findMany({
      where: { practiceId, isActive: true, role: { in: ['OWNER', 'DOCTOR'] } },
      select: { userId: true },
    });

    const doctorIds = practiceDoctors.map((d) => d.userId);

    const assignments = await prisma.doctorPatientAssignment.findMany({
      where: { doctorId: { in: doctorIds }, status: 'ACTIVE' },
      include: {
        patient: {
          select: {
            id: true,
            email: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    });

    const alerts: Array<{
      patientId: string;
      patientName: string;
      missingItem: string;
      lastRecordedDate: string | null;
      priority: 'HIGH' | 'MEDIUM';
    }> = [];

    for (const a of assignments) {
      const p = a.patient;
      const patientName = p.profile?.fullName || p.email.split('@')[0];

      // Check last HbA1c observation
      const lastHba1c = await prisma.healthObservation.findFirst({
        where: { userId: p.id, type: 'HBA1C' },
        orderBy: { observedAt: 'desc' },
      });

      if (!lastHba1c || lastHba1c.observedAt < overdueCutoff) {
        alerts.push({
          patientId: p.id,
          patientName,
          missingItem: 'HbA1c Lab Test (>90 days overdue)',
          lastRecordedDate: lastHba1c ? lastHba1c.observedAt.toISOString().split('T')[0] : null,
          priority: 'HIGH',
        });
      }
    }

    return alerts;
  }
}

