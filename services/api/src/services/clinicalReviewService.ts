import crypto from 'crypto';
import { prisma } from '../db/prisma';
import { logAuditEvent } from '../audit/auditLogger';
import {
  ClinicalReviewStatus,
  ChecklistItemStatus,
  ClinicalChecklistItemKey,
  ClinicalChecklistItem,
  ClinicalReviewEncounter,
} from '@aarogyadamu/contracts';

export const STANDARD_17_CHECKLIST_ITEMS: Array<{
  key: ClinicalChecklistItemKey;
  title: string;
  category: string;
  description: string;
}> = [
  {
    key: 'PATIENT_DETAILS_HISTORY',
    title: 'Patient Demographics & Background',
    category: '1. Identification & History',
    description: 'Verify age, gender, emergency contacts, and known clinical history.',
  },
  {
    key: 'DIABETES_HISTORY_DURATION',
    title: 'Diabetes Diagnosis & Duration',
    category: '1. Identification & History',
    description: 'Confirm diabetes classification (Type 2, Type 1, GDM) and years since diagnosis.',
  },
  {
    key: 'CURRENT_SYMPTOMS_CONCERNS',
    title: 'Active Symptoms & Patient Concerns',
    category: '2. Clinical Presentation',
    description: 'Check for polyuria, polydipsia, fatigue, paresthesias, or vision changes.',
  },
  {
    key: 'ALLERGIES_SENSITIVITIES',
    title: 'Known Drug Allergies & Sensitivities',
    category: '2. Clinical Presentation',
    description: 'Verify documented drug allergies (e.g. sulfa, penicillin, contrast dyes).',
  },
  {
    key: 'VITALS_BP_WEIGHT_BMI',
    title: 'Physical Examination & Vitals',
    category: '3. Physiological Baseline',
    description: 'Evaluate systolic/diastolic BP, resting pulse, weight, and BMI trajectories.',
  },
  {
    key: 'CGM_WEARABLE_READINGS',
    title: 'CGM Sensor Readings & Connectivity',
    category: '4. Glycemic Metrics',
    description: 'Verify active sensor connection, recent interstitial glucose readings, and sensor warmup.',
  },
  {
    key: 'TIME_IN_RANGE_VARIABILITY',
    title: 'Time in Range (TIR) & Glycemic Variability (CV)',
    category: '4. Glycemic Metrics',
    description: 'Ensure TIR > 70% (70-180 mg/dL), TBR < 4%, and CV <= 36%.',
  },
  {
    key: 'LAB_REPORTS_OCR_STATUS',
    title: 'Diagnostic Laboratory Reports & OCR Verification',
    category: '5. Investigations',
    description: 'Review Sarvam OCR verified laboratory reports and original scans.',
  },
  {
    key: 'HBA1C_LIPID_RENAL_PANEL',
    title: 'HbA1c, Renal Function (eGFR) & Lipid Profile',
    category: '5. Investigations',
    description: 'Confirm latest HbA1c target alignment, serum creatinine/eGFR, and LDL/triglycerides.',
  },
  {
    key: 'CURRENT_MEDICATIONS',
    title: 'Current Medication Regimen (Med Vault)',
    category: '6. Pharmacotherapy',
    description: 'Review all active oral hypoglycemic agents, insulins, statins, and antihypertensives.',
  },
  {
    key: 'MEDICATION_ADHERENCE',
    title: 'Medication Adherence Tracking',
    category: '6. Pharmacotherapy',
    description: 'Check verified medication adherence logs and reported missed doses.',
  },
  {
    key: 'PREVIOUS_CONSULTATIONS',
    title: 'Prior SOAP Notes & Consultation Records',
    category: '7. Continuity of Care',
    description: 'Review prior clinician SOAP documentation and treatment progression.',
  },
  {
    key: 'CARE_PLAN_LIFESTYLE_GOALS',
    title: 'Active Care Plan & Lifestyle Goals',
    category: '8. Self-Management',
    description: 'Inspect dietary guidance, physical activity targets, and self-care goals.',
  },
  {
    key: 'PENDING_DIAGNOSTIC_TESTS',
    title: 'Outstanding Diagnostic Lab Orders',
    category: '9. Care Coordination',
    description: 'Check for pending HbA1c, microalbumin, or ophthalmology/foot referrals.',
  },
  {
    key: 'FOLLOW_UP_NEXT_VISIT',
    title: 'Follow-Up Interval & Scheduled Visit',
    category: '9. Care Coordination',
    description: 'Confirm recommended follow-up date and visit format (in-person/teleconsult).',
  },
  {
    key: 'EMERGENCY_SOS_READINESS',
    title: 'Emergency Contact & Hypo Rescue Readiness',
    category: '10. Safety & Risk',
    description: 'Ensure active emergency contact and documented hypoglycemic rescue plan.',
  },
  {
    key: 'DATA_CONFLICT_ALERTS',
    title: 'Data Consistency & Integrity Verification',
    category: '10. Safety & Risk',
    description: 'Check for conflicting records, anomalous sensor dropouts, or unverified readings.',
  },
];

export class ClinicalReviewService {
  /**
   * Generates a hash representing the current patient clinical state to detect underlying changes.
   */
  static async computeDataSnapshotHash(patientId: string): Promise<string> {
    const obsCount = await prisma.healthObservation.count({ where: { userId: patientId } });
    const cgmCount = await prisma.cgmGlucoseReading.count({ where: { patientId } });
    const medsCount = await prisma.medicationSchedule.count({ where: { userId: patientId, isActive: true } });
    const raw = `${patientId}:${obsCount}:${cgmCount}:${medsCount}`;
    return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  /**
   * Initializes or loads the active Clinical Review Encounter for a patient.
   */
  static async getOrCreateEncounter(
    patientId: string,
    practiceId: string,
  ): Promise<ClinicalReviewEncounter> {
    // Look for active in-flight encounter
    let encounter = await prisma.clinicalReviewEncounter.findFirst({
      where: {
        patientId,
        status: { in: ['DRAFT', 'CLINICIAN_REVIEW', 'CLINICIAN_REVIEWED', 'DOCTOR_REVIEW', 'RETURNED_FOR_CORRECTION'] },
      },
      include: {
        initialReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        doctorReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const snapshotHash = await this.computeDataSnapshotHash(patientId);

    if (!encounter) {
      // Build initial 17-item checklist
      const checklist: ClinicalChecklistItem[] = STANDARD_17_CHECKLIST_ITEMS.map((item) => ({
        key: item.key,
        title: item.title,
        category: item.category,
        description: item.description,
        status: 'NOT_REVIEWED',
        summary: 'Awaiting initial clinician review',
        isFlaggedForReReview: false,
      }));

      encounter = await prisma.clinicalReviewEncounter.create({
        data: {
          patientId,
          practiceId,
          status: 'CLINICIAN_REVIEW',
          checklistJson: JSON.stringify(checklist),
          dataSnapshotHash: snapshotHash,
        },
        include: {
          initialReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
          doctorReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        },
      });
    }

    const parsedChecklist: ClinicalChecklistItem[] = JSON.parse(encounter.checklistJson);

    // If underlying patient clinical data changed since review started, flag items
    const dataChanged = encounter.dataSnapshotHash && encounter.dataSnapshotHash !== snapshotHash;
    if (dataChanged) {
      parsedChecklist.forEach((item) => {
        if (item.status === 'REVIEWED') {
          item.isFlaggedForReReview = true;
        }
      });
    }

    const completedCount = parsedChecklist.filter((i) => i.status === 'REVIEWED').length;

    return {
      id: encounter.id,
      patientId: encounter.patientId,
      practiceId: encounter.practiceId,
      status: encounter.status as ClinicalReviewStatus,
      initialReviewerId: encounter.initialReviewerId,
      initialReviewerName: encounter.initialReviewer?.profile?.fullName || encounter.initialReviewer?.email || null,
      initialReviewedAt: encounter.initialReviewedAt ? encounter.initialReviewedAt.toISOString() : null,
      doctorReviewerId: encounter.doctorReviewerId,
      doctorReviewerName: encounter.doctorReviewer?.profile?.fullName || encounter.doctorReviewer?.email || null,
      doctorReviewedAt: encounter.doctorReviewedAt ? encounter.doctorReviewedAt.toISOString() : null,
      doctorSignature: encounter.doctorSignature,
      correctionNotes: encounter.correctionNotes,
      clinicalSummaryNote: encounter.clinicalSummaryNote,
      checklist: parsedChecklist,
      dataSnapshotHash: encounter.dataSnapshotHash,
      completedItemsCount: completedCount,
      totalItemsCount: parsedChecklist.length,
      createdAt: encounter.createdAt.toISOString(),
      updatedAt: encounter.updatedAt.toISOString(),
    };
  }

  /**
   * Updates an individual checklist item by clinician or doctor.
   * Enforces clinical immutability on approved encounters and mandates clinical rationale.
   */
  static async updateChecklistItem(
    encounterId: string,
    reviewerId: string,
    reviewerRole: string,
    reviewerName: string,
    itemKey: ClinicalChecklistItemKey,
    status: ChecklistItemStatus,
    clinicalNotes?: string,
    needsAttentionReason?: string,
  ): Promise<ClinicalReviewEncounter> {
    const encounter = await prisma.clinicalReviewEncounter.findUnique({
      where: { id: encounterId },
      include: {
        initialReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        doctorReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      },
    });

    if (!encounter) throw new Error('Clinical Review Encounter not found');

    // Strict Clinical Immutability Guard
    if (encounter.status === 'APPROVED') {
      throw new Error(
        'Clinical encounter has already been approved and digitally signed by attending physician. Approved encounters are clinically immutable.',
      );
    }

    // Validation for NEEDS_ATTENTION: requires clinical justification
    if (status === 'NEEDS_ATTENTION' && (!needsAttentionReason || needsAttentionReason.trim().length < 3)) {
      throw new Error(
        "A clinical justification ('needsAttentionReason' min 3 chars) is mandatory when marking an item as NEEDS_ATTENTION.",
      );
    }

    // Validation for NOT_AVAILABLE: requires documentation explaining absence
    if (
      status === 'NOT_AVAILABLE' &&
      (!clinicalNotes || clinicalNotes.trim().length < 3) &&
      (!needsAttentionReason || needsAttentionReason.trim().length < 3)
    ) {
      throw new Error('A clinical explanation is mandatory when marking a checklist item as NOT_AVAILABLE.');
    }

    const checklist: ClinicalChecklistItem[] = JSON.parse(encounter.checklistJson);
    const itemIndex = checklist.findIndex((i) => i.key === itemKey);
    if (itemIndex === -1) throw new Error(`Checklist item '${itemKey}' not found`);

    checklist[itemIndex] = {
      ...checklist[itemIndex],
      status,
      reviewedByUserId: reviewerId,
      reviewedByRole: reviewerRole,
      reviewedByName: reviewerName,
      reviewedAt: new Date().toISOString(),
      clinicalNotes: clinicalNotes || checklist[itemIndex].clinicalNotes,
      needsAttentionReason: needsAttentionReason || undefined,
      isFlaggedForReReview: false,
    };

    const updated = await prisma.clinicalReviewEncounter.update({
      where: { id: encounterId },
      data: {
        checklistJson: JSON.stringify(checklist),
        initialReviewerId: encounter.initialReviewerId || reviewerId,
      },
      include: {
        initialReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
        doctorReviewer: { select: { id: true, email: true, profile: { select: { fullName: true } } } },
      },
    });

    const completedCount = checklist.filter((i) => i.status === 'REVIEWED').length;

    return {
      id: updated.id,
      patientId: updated.patientId,
      practiceId: updated.practiceId,
      status: updated.status as ClinicalReviewStatus,
      initialReviewerId: updated.initialReviewerId,
      initialReviewerName: updated.initialReviewer?.profile?.fullName || null,
      initialReviewedAt: updated.initialReviewedAt ? updated.initialReviewedAt.toISOString() : null,
      doctorReviewerId: updated.doctorReviewerId,
      doctorReviewerName: updated.doctorReviewer?.profile?.fullName || null,
      doctorReviewedAt: updated.doctorReviewedAt ? updated.doctorReviewedAt.toISOString() : null,
      doctorSignature: updated.doctorSignature,
      correctionNotes: updated.correctionNotes,
      clinicalSummaryNote: updated.clinicalSummaryNote,
      checklist,
      dataSnapshotHash: updated.dataSnapshotHash,
      completedItemsCount: completedCount,
      totalItemsCount: checklist.length,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Nurse or clinician completes their initial pass and submits to attending doctor.
   */
  static async submitToDoctor(encounterId: string, reviewerId: string): Promise<void> {
    await prisma.clinicalReviewEncounter.update({
      where: { id: encounterId },
      data: {
        status: 'DOCTOR_REVIEW',
        initialReviewerId: reviewerId,
        initialReviewedAt: new Date(),
      },
    });
  }

  /**
   * Attending Doctor conducts final sign-off, records digital approval and clinical summary.
   */
  static async finalizeDoctorApproval(
    encounterId: string,
    doctorId: string,
    doctorName: string,
    clinicalSummaryNote: string,
    signatureText: string,
  ): Promise<void> {
    const encounter = await prisma.clinicalReviewEncounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) throw new Error('Encounter not found');

    if (encounter.status === 'APPROVED') {
      throw new Error('This clinical encounter has already been approved and digitally signed.');
    }

    const checklist: ClinicalChecklistItem[] = JSON.parse(encounter.checklistJson);
    const unreviewed = checklist.filter((i) => i.status === 'NOT_REVIEWED');
    if (unreviewed.length > 0) {
      throw new Error(
        `Cannot approve clinical encounter: ${unreviewed.length} checklist items remain unreviewed. All 17 items must be evaluated before doctor approval.`,
      );
    }

    const now = new Date();

    await prisma.clinicalReviewEncounter.update({
      where: { id: encounterId },
      data: {
        status: 'APPROVED',
        doctorReviewerId: doctorId,
        doctorReviewedAt: now,
        doctorSignature: signatureText || `Digitally signed by ${doctorName}`,
        clinicalSummaryNote,
      },
    });

    // Record formal audit event via compliant AuditLogger
    await logAuditEvent({
      userId: encounter.patientId,
      actorId: doctorId,
      action: 'CLINICAL_REVIEW_APPROVED',
      entityType: 'ClinicalReviewEncounter',
      entityId: encounterId,
      metadata: {
        doctorName,
        status: 'APPROVED',
        summaryNote: clinicalSummaryNote.slice(0, 200),
      },
    });
  }

  /**
   * Doctor requests corrections from nurse/clinician.
   */
  static async requestCorrections(
    encounterId: string,
    doctorId: string,
    correctionNotes: string,
  ): Promise<void> {
    await prisma.clinicalReviewEncounter.update({
      where: { id: encounterId },
      data: {
        status: 'RETURNED_FOR_CORRECTION',
        correctionNotes,
        doctorReviewerId: doctorId,
      },
    });
  }
}

