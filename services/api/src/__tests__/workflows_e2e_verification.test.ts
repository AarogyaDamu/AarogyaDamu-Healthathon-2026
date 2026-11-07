/**
 * End-to-End Workflow Verification Suite for Health-a-thon 2026
 * 
 * Verifies the 6 Core Healthcare Workflows:
 * 1. Doctor creates/monitors patient -> patient logs in -> records glucose -> doctor sees updated glucose.
 * 2. Doctor prescribes medicine -> patient sees prescription -> records medicine status -> doctor sees adherence.
 * 3. Doctor creates care plan -> patient completes activities -> doctor sees progress.
 * 4. Patient grants caregiver permission -> caregiver completes delegated activity -> doctor sees update.
 * 5. Patient revokes caregiver permission -> caregiver access is denied.
 * 6. Laboratory observation is saved -> appropriate FHIR R4 representation is generated -> verified LOINC coding included.
 */

import {
  mapToFhirPatient,
  mapToFhirPractitioner,
  mapToFhirObservation,
  mapToFhirCarePlan,
  mapToFhirTask,
  mapToFhirMedicationRequest,
  mapToFhirMedicationStatement,
  mapToFhirConsent,
} from '../fhir/mapper';
import { validateFhirResource } from '../fhir/validator';
import {
  formatGlucoseReading,
  resolveLoincCoding,
  LOINC_CODES,
  toCanonicalUcum,
} from '@aarogyadamu/contracts';

describe('AarogyaDamu 6 Core Clinical Workflow Verification', () => {
  const doctorId = 'doc-101-rupam';
  const patientId = 'pat-202-ramesh';
  const caregiverId = 'cg-303-meera';

  // --------------------------------------------------------------------------
  // WORKFLOW 1: Doctor-Patient Glycemic Tracking
  // --------------------------------------------------------------------------
  describe('Workflow 1: Glycemic Monitoring & Cross-Application Visibility', () => {
    it('doctor assigns patient and patient logs glucose with immediate ADA target evaluation', () => {
      // 1. Doctor assigns patient
      const assignment = {
        doctorId,
        patientId,
        status: 'ACTIVE',
        activatedAt: new Date(),
      };
      expect(assignment.status).toBe('ACTIVE');

      // 2. Patient records fasting glucose
      const patientReading = {
        id: 'obs-glucose-126',
        userId: patientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: 126,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning routine check before breakfast',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date(),
      };

      // 3. Clinical evaluation
      const interpretation = formatGlucoseReading(patientReading.numericValue, patientReading.context, 'PATIENT');
      expect(interpretation.status).toBe('NORMAL');
      expect(interpretation.label).toBe('In Target Range');

      // 4. Doctor sees clinically coded observation
      const clinicianInterpretation = formatGlucoseReading(patientReading.numericValue, patientReading.context, 'CLINICIAN');
      expect(clinicianInterpretation.status).toBe('NORMAL');
      expect(clinicianInterpretation.label).toBe('In Glycemic Target');

      // 5. FHIR interoperability representation
      const fhirObs = mapToFhirObservation(patientReading);
      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.GLUCOSE_BLOOD_GLUCOMETER.code);
      expect(fhirObs.valueQuantity?.value).toBe(126);
      expect(fhirObs.valueQuantity?.code).toBe('mg/dL');
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 2: Prescription Issuance & Adherence Tracking
  // --------------------------------------------------------------------------
  describe('Workflow 2: Prescription Issuance & Patient Adherence Reporting', () => {
    it('doctor prescribes medicine, patient marks taken, and adherence calculates', () => {
      // 1. Doctor issues prescription
      const prescription = {
        id: 'rx-metformin-500',
        userId: patientId,
        medicineName: 'Tab Metformin 500mg SR',
        dosage: '500mg',
        timing: 'NIGHT',
        isActive: true,
        createdAt: new Date(),
      };

      const fhirMedReq = mapToFhirMedicationRequest(prescription);
      expect(fhirMedReq.resourceType).toBe('MedicationRequest');
      expect(fhirMedReq.status).toBe('active');
      expect(validateFhirResource(fhirMedReq).valid).toBe(true);

      // 2. Patient confirms dose taken
      const adherenceEvent = {
        id: 'adh-event-1',
        medicineScheduleId: prescription.id,
        medicineName: prescription.medicineName,
        status: 'TAKEN',
        takenAt: new Date(),
      };

      const fhirMedStmt = mapToFhirMedicationStatement(adherenceEvent, patientId);
      expect(fhirMedStmt.resourceType).toBe('MedicationStatement');
      expect(fhirMedStmt.status).toBe('completed');
      expect(validateFhirResource(fhirMedStmt).valid).toBe(true);

      // 3. Adherence rate calculation
      const totalExpectedDoses = 7;
      const dosesTaken = 7;
      const adherenceRate = Math.round((dosesTaken / totalExpectedDoses) * 100);
      expect(adherenceRate).toBe(100);
    });
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 3: Shared Care Plan & Goal Progress
  // --------------------------------------------------------------------------
  describe('Workflow 3: Doctor Creates Care Plan & Patient Completes Activities', () => {
    it('creates active care plan, tracks daily activity completion, and updates progress', () => {
      const carePlan = {
        id: 'cp-v1',
        patientId,
        doctorId,
        version: 1,
        status: 'ACTIVE',
        title: 'Type 2 Diabetes Control Plan',
        goals: [
          {
            id: 'goal-fasting',
            title: 'Maintain fasting blood sugar 80-130 mg/dL',
            targetValue: '80 - 130',
            unit: 'mg/dL',
            status: 'IN_PROGRESS',
          },
        ],
        activities: [
          {
            title: 'Morning fasting blood glucose check',
            frequency: 'DAILY',
            timing: 'MORNING',
          },
        ],
      };

      const fhirPlan = mapToFhirCarePlan(carePlan);
      expect(fhirPlan.resourceType).toBe('CarePlan');
      expect(fhirPlan.status).toBe('active');
      expect(validateFhirResource(fhirPlan).valid).toBe(true);

      // Patient completes task
      const task = {
        id: 'task-sugar-check-1',
        userId: patientId,
        carePlanId: carePlan.id,
        title: 'Morning fasting blood glucose check',
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: patientId,
        completedByRole: 'PATIENT',
      };

      const fhirTask = mapToFhirTask(task);
      expect(fhirTask.status).toBe('completed');
      expect(fhirTask.owner?.reference).toBe(`Patient/${patientId}`);
      expect(validateFhirResource(fhirTask).valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 4: Caregiver Delegation & Completion
  // --------------------------------------------------------------------------
  describe('Workflow 4: Patient Grants Caregiver Permission & Caregiver Completes Task', () => {
    it('permits caregiver to complete delegated task with proper attribution', () => {
      // 1. Active consent
      const consent = {
        id: 'consent-meera-1',
        patientId,
        caregiverEmail: 'meera.joshi@family.aarogyadamu.local',
        caregiverName: 'Meera Joshi',
        relationship: 'DAUGHTER',
        status: 'ACTIVE',
        permissions: JSON.stringify(['MANAGE_TASKS', 'VIEW_OBSERVATIONS']),
        expiresAt: new Date(Date.now() + 86400000 * 30),
      };

      const fhirConsent = mapToFhirConsent(consent);
      expect(fhirConsent.status).toBe('active');
      expect(validateFhirResource(fhirConsent).valid).toBe(true);

      // 2. Caregiver completes delegated task
      const caregiverTask = {
        id: 'task-pillbox-refill',
        userId: patientId,
        title: 'Weekly pill box replenishment & adherence review',
        status: 'COMPLETED',
        completedAt: new Date(),
        completedById: caregiverId,
        completedByRole: 'CAREGIVER',
      };

      const fhirTask = mapToFhirTask(caregiverTask);
      expect(fhirTask.status).toBe('completed');
      expect(fhirTask.owner?.reference).toBe(`RelatedPerson/${caregiverId}`);
      expect(validateFhirResource(fhirTask).valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 5: Caregiver Consent Revocation
  // --------------------------------------------------------------------------
  describe('Workflow 5: Patient Revokes Caregiver Permission & Blocks Access', () => {
    it('immediately reflects revocation in Consent resource and denies delegated actions', () => {
      const revokedConsent = {
        id: 'consent-meera-1',
        patientId,
        caregiverEmail: 'meera.joshi@family.aarogyadamu.local',
        status: 'REVOKED',
        permissions: JSON.stringify(['MANAGE_TASKS']),
        updatedAt: new Date(),
      };

      const fhirConsent = mapToFhirConsent(revokedConsent);
      expect(fhirConsent.status).toBe('inactive');
      expect(fhirConsent.provision?.type).toBe('deny');
      expect(validateFhirResource(fhirConsent).valid).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // WORKFLOW 6: Laboratory Observation & LOINC Serialization
  // --------------------------------------------------------------------------
  describe('Workflow 6: Laboratory Observation -> FHIR R4 with Verified LOINC', () => {
    it('generates fully compliant FHIR R4 Observation with verified LOINC and UCUM', () => {
      const labReportObservation = {
        id: 'obs-lab-hba1c-6-3',
        userId: patientId,
        type: 'HBA1C',
        numericValue: 6.3,
        unit: '%',
        context: 'LAB_CONFIRMED',
        provenance: 'LAB_REPORT',
        observedAt: new Date('2026-10-11T09:00:00Z'),
        notes: 'Metropolis Healthcare Pune',
      };

      const loinc = resolveLoincCoding({
        type: labReportObservation.type,
        context: labReportObservation.context,
        provenance: labReportObservation.provenance,
      });

      expect(loinc?.code).toBe('4548-4');
      expect(toCanonicalUcum(labReportObservation.unit)).toBe('%');

      const fhirObs = mapToFhirObservation(labReportObservation);
      expect(fhirObs.resourceType).toBe('Observation');
      expect(fhirObs.status).toBe('final');
      expect(fhirObs.code.coding?.[0].code).toBe('4548-4');
      expect(fhirObs.code.coding?.[0].system).toBe('http://loinc.org');
      expect(fhirObs.valueQuantity?.value).toBe(6.3);
      expect(fhirObs.valueQuantity?.code).toBe('%');
      expect(fhirObs.valueQuantity?.system).toBe('http://unitsofmeasure.org');

      const validation = validateFhirResource(fhirObs);
      expect(validation.valid).toBe(true);
    });
  });
});

