import { prisma } from '../db/prisma';
import { ConsultationWorkspaceRecordInput, ConsultationTemplate } from '@aarogyadamu/contracts';

export class ConsultationWorkspaceService {
  /**
   * Retrieves active consultation templates for a practice.
   * If none exist, seeds default Indian diabetes and clinical templates.
   */
  static async getTemplates(practiceId: string): Promise<ConsultationTemplate[]> {
    const existing = await prisma.consultationTemplate.findMany({
      where: { practiceId },
      orderBy: { createdAt: 'asc' },
    });

    if (existing.length > 0) {
      return existing.map((t) => ({
        id: t.id,
        name: t.name,
        specialty: t.specialty,
        chiefComplaint: t.chiefComplaint || '',
        defaultDiagnoses: t.defaultDiagnosesJson ? JSON.parse(t.defaultDiagnosesJson) : [],
        defaultPrescriptions: t.defaultPrescriptionsJson ? JSON.parse(t.defaultPrescriptionsJson) : [],
        defaultLabOrders: t.defaultLabOrdersJson ? JSON.parse(t.defaultLabOrdersJson) : [],
        defaultLifestyleAdvice: t.defaultLifestyleAdvice || '',
      }));
    }

    // Seed default standard templates for Indian clinical diabetology
    const defaults: Array<Omit<ConsultationTemplate, 'id'>> = [
      {
        name: 'Type 2 Diabetes Routine Follow-up',
        specialty: 'Diabetology',
        chiefComplaint: 'Quarterly review of glycemic control, fasting blood sugars, and treatment adherence.',
        defaultDiagnoses: [
          { code: 'E11.9', display: 'Type 2 diabetes mellitus without complications', category: 'CONFIRMED' },
        ],
        defaultPrescriptions: [
          {
            medicationName: 'Metformin Hydrochloride (Glucophage)',
            dosage: '500 mg',
            frequency: '1-0-1',
            timing: 'AFTER_FOOD',
            durationDays: 90,
            instructions: 'Take immediately after breakfast and dinner.',
          },
        ],
        defaultLabOrders: ['HbA1c', 'Fasting Blood Sugar', 'Lipid Profile', 'Serum Creatinine'],
        defaultLifestyleAdvice: 'Maintain 30 mins brisk walking 5 days/week. Follow Diabetes Plate: 50% non-starchy vegetables, 25% protein, 25% complex carbs.',
      },
      {
        name: 'Diabetic Hypertension Review',
        specialty: 'Diabetology & Internal Medicine',
        chiefComplaint: 'Blood pressure and glucose dual review with home BP log assessment.',
        defaultDiagnoses: [
          { code: 'E11.9', display: 'Type 2 diabetes mellitus', category: 'CONFIRMED' },
          { code: 'I10', display: 'Essential (primary) hypertension', category: 'CONFIRMED' },
        ],
        defaultPrescriptions: [
          {
            medicationName: 'Telmisartan',
            dosage: '40 mg',
            frequency: '1-0-0',
            timing: 'AFTER_FOOD',
            durationDays: 30,
            instructions: 'Take once daily in the morning.',
          },
          {
            medicationName: 'Metformin Hydrochloride',
            dosage: '500 mg',
            frequency: '1-0-1',
            timing: 'AFTER_FOOD',
            durationDays: 30,
            instructions: 'Take after meals.',
          },
        ],
        defaultLabOrders: ['Serum Electrolytes', 'Serum Creatinine', 'Urine Microalbumin/Creatinine Ratio'],
        defaultLifestyleAdvice: 'DASH diet with restricted sodium (<2g/day). Avoid added table salt and processed pickles.',
      },
      {
        name: 'First-Time Diabetic Evaluation',
        specialty: 'Diabetology',
        chiefComplaint: 'Newly detected hyperglycemia, polyuria, polydipsia, and fatigue.',
        defaultDiagnoses: [
          { code: 'E11.65', display: 'Type 2 diabetes mellitus with hyperglycemia (New diagnosis)', category: 'CONFIRMED' },
        ],
        defaultPrescriptions: [
          {
            medicationName: 'Metformin Hydrochloride',
            dosage: '500 mg',
            frequency: '1-0-0',
            timing: 'AFTER_FOOD',
            durationDays: 14,
            instructions: 'Start once daily with dinner for 1 week, then increase to 1-0-1 if well tolerated.',
          },
        ],
        defaultLabOrders: ['HbA1c', 'Fasting & Post-Prandial Blood Sugar', 'Complete Hemogram', 'Liver Function Test', 'Lipid Profile', 'Urine Routine'],
        defaultLifestyleAdvice: 'Diabetes education initiated. Log fasting and post-meal glucose in AarogyaDamu app.',
      },
    ];

    for (const d of defaults) {
      await prisma.consultationTemplate.create({
        data: {
          practiceId,
          name: d.name,
          specialty: d.specialty,
          chiefComplaint: d.chiefComplaint,
          defaultDiagnosesJson: JSON.stringify(d.defaultDiagnoses),
          defaultPrescriptionsJson: JSON.stringify(d.defaultPrescriptions),
          defaultLabOrdersJson: JSON.stringify(d.defaultLabOrders),
          defaultLifestyleAdvice: d.defaultLifestyleAdvice,
        },
      });
    }

    return await this.getTemplates(practiceId);
  }

  /**
   * Finalizes a complete doctor-approved consultation encounter.
   */
  static async finalizeConsultation(
    doctorUserId: string,
    doctorName: string,
    practiceId: string,
    input: ConsultationWorkspaceRecordInput,
  ) {
    // 1. Verify doctor has active membership in practice
    const membership = await prisma.practiceMembership.findUnique({
      where: { practiceId_userId: { practiceId, userId: doctorUserId } },
    });

    if (!membership || !membership.isActive || membership.role === 'RECEPTIONIST') {
      throw new Error('Unauthorized: Only licensed physicians can finalize clinical consultations');
    }

    // 2. Verify patient exists
    const patient = await prisma.user.findUnique({
      where: { id: input.patientId },
      include: { profile: true },
    });

    if (!patient) {
      throw new Error('Patient not found');
    }

    // 3. Verify clinician-patient authorization (IDOR / BOLA guard)
    const assignment = await prisma.doctorPatientAssignment.findFirst({
      where: {
        doctorId: doctorUserId,
        patientId: input.patientId,
        status: 'ACTIVE',
      },
    });

    if (!assignment) {
      // Check if there is an active valid appointment with this doctor or within the practice
      const appointment = input.appointmentId
        ? await prisma.appointment.findFirst({
            where: {
              id: input.appointmentId,
              patientId: input.patientId,
              status: { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED', 'COMPLETED'] },
              AND: [{ status: { notIn: ['CANCELLED', 'REJECTED'] } }],
            },
          })
        : await prisma.appointment.findFirst({
            where: {
              doctorId: doctorUserId,
              patientId: input.patientId,
              status: { in: ['CONFIRMED', 'REQUESTED', 'RESCHEDULED', 'COMPLETED'] },
              AND: [{ status: { notIn: ['CANCELLED', 'REJECTED'] } }],
            },
          });

      if (!appointment) {
        // Check if patient is assigned to any doctor in this practice
        const practiceDoctors = await prisma.practiceMembership.findMany({
          where: { practiceId, isActive: true, role: { in: ['OWNER', 'DOCTOR'] } },
          select: { userId: true },
        });
        const doctorIds = practiceDoctors.map((d) => d.userId);
        const practiceAssignment = await prisma.doctorPatientAssignment.findFirst({
          where: {
            doctorId: { in: doctorIds },
            patientId: input.patientId,
            status: 'ACTIVE',
          },
        });

        if (!practiceAssignment) {
          throw new Error('Unauthorized: Clinician is not actively assigned to this patient');
        }
      }
    }

    // Build structured SOAP clinical note text
    const examLines: string[] = [];
    if (input.examination) {
      const e = input.examination;
      if (e.bpSystolic && e.bpDiastolic) examLines.push(`BP: ${e.bpSystolic}/${e.bpDiastolic} mmHg`);
      if (e.pulseRate) examLines.push(`Pulse: ${e.pulseRate} bpm`);
      if (e.weightKg) examLines.push(`Weight: ${e.weightKg} kg`);
      if (e.randomBloodSugar) examLines.push(`RBS: ${e.randomBloodSugar} mg/dL`);
      if (e.generalExam) examLines.push(`General: ${e.generalExam}`);
      if (e.systemicExam) examLines.push(`Systemic: ${e.systemicExam}`);
      if (e.footExam) examLines.push(`Foot Exam: ${e.footExam}`);
    }

    const diagnosesText = input.diagnoses.map((d) => `• [${d.category}] ${d.display}${d.code ? ` (${d.code})` : ''}`).join('\n');
    const prescriptionsText = input.prescriptions
      .map((p, idx) => `${idx + 1}. ${p.medicationName} ${p.dosage} — ${p.frequency} (${p.timing}) for ${p.durationDays} days. ${p.instructions || ''}`)
      .join('\n');

    const noteBody = [
      `### CHIEF COMPLAINT & HISTORY`,
      input.chiefComplaint,
      input.historyOfPresentIllness ? `\n**History of Present Illness:**\n${input.historyOfPresentIllness}` : '',
      `\n### PHYSICAL EXAMINATION & VITALS`,
      examLines.length > 0 ? examLines.join('\n') : 'Routine physical exam conducted; vitals stable.',
      `\n### CLINICAL DIAGNOSES`,
      diagnosesText,
      `\n### PRESCRIPTION (Rx)`,
      prescriptionsText || 'No new medications prescribed. Continue existing regimen.',
      input.labOrders.length > 0 ? `\n### INVESTIGATIONS ORDERED\n${input.labOrders.map((l) => `• ${l}`).join('\n')}` : '',
      input.lifestyleAdvice ? `\n### LIFESTYLE & DIETARY GUIDANCE\n${input.lifestyleAdvice}` : '',
      input.followUpDays ? `\n**Follow-up:** In ${input.followUpDays} days.` : '',
      `\n---\n*Clinically verified and digitally signed by ${doctorName}*`,
    ].filter(Boolean).join('\n');

    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      // Create ConsultationNote in DRAFT status so clinical items can be attached
      const note = await tx.consultationNote.create({
        data: {
          userId: input.patientId,
          clinicianId: doctorUserId,
          clinicianName: doctorName,
          appointmentId: input.appointmentId,
          status: 'DRAFT',
          isManual: true,
          structuredNote: noteBody,
          clinicalDiagnosisJson: JSON.stringify(input.diagnoses),
          examinationFindingsJson: input.examination ? JSON.stringify(input.examination) : null,
          labOrdersJson: JSON.stringify(input.labOrders),
          lifestyleAdvice: input.lifestyleAdvice,
        },
      });

      // Save individual prescription items and sync into active MedicationSchedule
      for (const rx of input.prescriptions) {
        await tx.consultationPrescriptionItem.create({
          data: {
            consultationNoteId: note.id,
            medicationName: rx.medicationName,
            dosage: rx.dosage,
            frequency: rx.frequency,
            timing: rx.timing,
            durationDays: rx.durationDays,
            instructions: rx.instructions,
          },
        });

        // Sync directly into patient Med Vault as an authorized clinician prescription
        await tx.medicationSchedule.create({
          data: {
            userId: input.patientId,
            medicineName: rx.medicationName,
            medicationName: rx.medicationName,
            dosage: rx.dosage,
            frequency: rx.frequency,
            timing: rx.timing || 'MORNING',
            instructions: rx.instructions,
            prescriber: doctorName,
            source: 'CLINICIAN_PRESCRIBED',
            status: 'ACTIVE',
            reviewStatus: 'CLINICIAN_REVIEWED',
            reviewedByClinicianId: doctorUserId,
            reviewedAt: now,
            clinicalReviewNotes: `Prescribed in consultation by Dr. ${doctorName}`,
            isActive: true,
          },
        });
      }

      // Automatically create CareTasks for ordered investigations so they populate the patient agenda
      for (const lab of input.labOrders) {
        await tx.careTask.create({
          data: {
            userId: input.patientId,
            assignedById: doctorUserId,
            title: `Lab Test: ${lab}`,
            category: 'LAB_TEST',
            instructions: `Doctor ordered diagnostic investigation: ${lab}. Please complete at diagnostic center and upload report.`,
            priority: 'HIGH',
            status: 'PENDING',
            dueAt: new Date(Date.now() + (input.followUpDays || 14) * 86400000),
          },
        });
      }

      // If follow-up days specified, create follow-up reminder task
      if (input.followUpDays) {
        await tx.careTask.create({
          data: {
            userId: input.patientId,
            assignedById: doctorUserId,
            title: `Follow-up Consultation Review`,
            category: 'FOLLOW_UP',
            instructions: `Follow-up consultation due in ${input.followUpDays} days with Dr. ${doctorName}.`,
            priority: 'MEDIUM',
            status: 'PENDING',
            dueAt: new Date(Date.now() + input.followUpDays * 86400000),
          },
        });
      }

      // If appointment linked, validate and mark it completed with strict state checking
      if (input.appointmentId) {
        const appointment = await tx.appointment.findUnique({
          where: { id: input.appointmentId },
        });

        if (!appointment) {
          throw new Error(`Appointment with ID '${input.appointmentId}' not found.`);
        }

        if (appointment.patientId !== input.patientId) {
          throw new Error('Appointment does not belong to the consultation patient.');
        }

        if (appointment.doctorId !== doctorUserId) {
          throw new Error('Appointment is assigned to another doctor.');
        }

        if (['CANCELLED', 'DECLINED', 'MISSED'].includes(appointment.status)) {
          throw new Error(`Cannot complete consultation for an appointment with status '${appointment.status}'.`);
        }

        if (appointment.status !== 'COMPLETED') {
          await tx.appointment.update({
            where: { id: input.appointmentId },
            data: {
              status: 'COMPLETED',
              completedAt: now,
            },
          });

          await tx.auditLog.create({
            data: {
              userId: input.patientId,
              actorId: doctorUserId,
              action: 'APPOINTMENT_COMPLETED',
              entityType: 'Appointment',
              entityId: input.appointmentId,
              metadata: JSON.stringify({
                status: 'COMPLETED',
                source: 'CONSULTATION_FINALIZATION',
                consultationNoteId: note.id,
              }),
            },
          });
        }
      }

      // Ensure active doctor-patient assignment
      const existingAssignment = await tx.doctorPatientAssignment.findFirst({
        where: { doctorId: doctorUserId, patientId: input.patientId },
      });

      if (!existingAssignment) {
        await tx.doctorPatientAssignment.create({
          data: {
            doctorId: doctorUserId,
            patientId: input.patientId,
            status: 'ACTIVE',
            activatedAt: now,
          },
        });
      } else if (existingAssignment.status !== 'ACTIVE') {
        await tx.doctorPatientAssignment.update({
          where: { id: existingAssignment.id },
          data: { status: 'ACTIVE', activatedAt: now },
        });
      }

      // Finalize and approve note once all prescription items, schedules and care tasks are attached
      const finalizedNote = await tx.consultationNote.update({
        where: { id: note.id },
        data: {
          status: 'APPROVED',
          approvedNoteText: noteBody,
          approvedAt: now,
          approvedBy: doctorName,
          sharedWithPatient: true,
          sharedAt: now,
        },
      });

      return finalizedNote;
    });

    return result;
  }
}

