/**
 * Automated Verification & Validation Suite for HL7 FHIR R4 (v4.0.1)
 * Validates mapping accuracy, LOINC & UCUM coding, schema conformance, bundles, and OperationOutcome.
 */

import {
  mapToFhirPatient,
  mapToFhirPractitioner,
  mapToFhirRelatedPerson,
  mapToFhirObservation,
  mapToFhirCondition,
  mapToFhirCarePlan,
  mapToFhirGoal,
  mapToFhirTask,
  mapToFhirMedicationRequest,
  mapToFhirMedicationStatement,
  mapToFhirEncounter,
  mapToFhirDiagnosticReport,
  mapToFhirDocumentReference,
  mapToFhirConsent,
  mapToFhirCommunication,
  mapToFhirAuditEvent,
} from '../fhir/mapper';
import { validateFhirResource, createOperationOutcome } from '../fhir/validator';
import { createSearchsetBundle, createPatientRecordBundle } from '../fhir/bundle';
import { LOINC_CODES, resolveLoincCoding, toCanonicalUcum } from '@aarogyadamu/contracts';

describe('HL7 FHIR R4 (v4.0.1) Healthcare Interoperability & Conformance Suite', () => {
  const mockPatientId = 'patient-uuid-12345';
  const mockDoctorId = 'doctor-uuid-67890';
  const mockCaregiverId = 'caregiver-uuid-54321';

  // ==========================================================================
  // 1. PATIENT RESOURCE VALIDATION
  // ==========================================================================
  describe('1. Patient Resource Mapping & Conformance', () => {
    it('maps user and profile into a compliant FHIR Patient resource', () => {
      const user = {
        id: mockPatientId,
        email: 'ramesh.deshmukh@aarogyadamu.local',
        isActive: true,
        isSyntheticDemo: true,
        updatedAt: new Date('2026-11-01T10:00:00Z'),
        profile: {
          fullName: 'Ramesh Deshmukh',
          dateOfBirth: new Date('1966-06-18'),
          primaryClinician: 'Dr. Rupam Choudhary (Diabetologist)',
        },
      };

      const patient = mapToFhirPatient(user);

      expect(patient.resourceType).toBe('Patient');
      expect(patient.id).toBe(mockPatientId);
      expect(patient.active).toBe(true);
      expect(patient.name?.[0].family).toBe('Deshmukh');
      expect(patient.name?.[0].given).toEqual(['Ramesh']);
      expect(patient.telecom?.[0].value).toBe('ramesh.deshmukh@aarogyadamu.local');
      expect(patient.birthDate).toBe('1966-06-18');
      expect(patient.identifier?.some((id) => id.value === 'SYNTHETIC_DEMO_DATA')).toBe(true);

      const validation = validateFhirResource(patient);
      expect(validation.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 2. PRACTITIONER RESOURCE VALIDATION
  // ==========================================================================
  describe('2. Practitioner Resource Mapping & Conformance', () => {
    it('maps clinician into FHIR Practitioner with Diabetologist qualification', () => {
      const doctor = {
        id: mockDoctorId,
        email: 'dr.rc@aarogyadamu.local',
        isClinician: true,
        isActive: true,
        updatedAt: new Date('2026-11-01T10:00:00Z'),
        profile: {
          fullName: 'Dr. Rupam Choudhary',
          primaryClinician: 'Sahyadri Specialty Hospital',
        },
      };

      const practitioner = mapToFhirPractitioner(doctor);

      expect(practitioner.resourceType).toBe('Practitioner');
      expect(practitioner.id).toBe(mockDoctorId);
      expect(practitioner.name?.[0].text).toBe('Dr. Rupam Choudhary');
      expect(practitioner.qualification?.[0].code.coding?.[0].code).toBe('11935004'); // SNOMED Diabetologist

      const validation = validateFhirResource(practitioner);
      expect(validation.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 3. RELATED PERSON (CAREGIVER) RESOURCE VALIDATION
  // ==========================================================================
  describe('3. RelatedPerson Resource Mapping & Conformance', () => {
    it('maps caregiver into FHIR RelatedPerson linked to patient', () => {
      const consent = {
        id: 'consent-999',
        patientId: mockPatientId,
        caregiverEmail: 'meera.joshi@family.aarogyadamu.local',
        caregiverName: 'Meera Joshi',
        relationship: 'DAUGHTER',
        status: 'ACTIVE',
        updatedAt: new Date('2026-11-01T10:00:00Z'),
      };

      const relatedPerson = mapToFhirRelatedPerson(consent, mockPatientId);

      expect(relatedPerson.resourceType).toBe('RelatedPerson');
      expect(relatedPerson.patient.reference).toBe(`Patient/${mockPatientId}`);
      expect(relatedPerson.relationship?.[0].coding?.[0].code).toBe('DAU');
      expect(relatedPerson.name?.[0].text).toBe('Meera Joshi');

      const validation = validateFhirResource(relatedPerson);
      expect(validation.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 4. OBSERVATION RESOURCE VALIDATION (LOINC & UCUM)
  // ==========================================================================
  describe('4. Observation Resource with Verified LOINC & UCUM Coding', () => {
    it('maps fasting glucometer reading to LOINC 14771-0 with UCUM mg/dL', () => {
      const obs = {
        id: 'obs-glucose-1',
        userId: mockPatientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: 118,
        unit: 'mg/dL',
        context: 'FASTING',
        notes: 'Morning before breakfast',
        provenance: 'PATIENT_ENTERED',
        observedAt: new Date('2026-11-07T07:30:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.resourceType).toBe('Observation');
      expect(fhirObs.status).toBe('final');
      expect(fhirObs.code.coding?.[0].system).toBe('http://loinc.org');
      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.GLUCOSE_BLOOD_GLUCOMETER.code);
      expect(fhirObs.valueQuantity?.value).toBe(118);
      expect(fhirObs.valueQuantity?.system).toBe('http://unitsofmeasure.org');
      expect(fhirObs.valueQuantity?.code).toBe('mg/dL');
      expect(fhirObs.subject.reference).toBe(`Patient/${mockPatientId}`);

      const validation = validateFhirResource(fhirObs);
      expect(validation.valid).toBe(true);
    });

    it('maps 2-hour postprandial glucose to LOINC 88365-2', () => {
      const obs = {
        id: 'obs-glucose-2',
        userId: mockPatientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: 162,
        unit: 'mg/dL',
        context: 'POST_MEAL_2HR',
        observedAt: new Date('2026-11-07T14:00:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.GLUCOSE_POST_MEAL_2HR.code);
      expect(fhirObs.valueQuantity?.value).toBe(162);
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });

    it('maps venous fasting laboratory glucose to LOINC 1558-6', () => {
      const obs = {
        id: 'obs-glucose-lab',
        userId: mockPatientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: 112,
        unit: 'mg/dL',
        context: 'FASTING',
        provenance: 'LAB_CONFIRMED',
        observedAt: new Date('2026-11-01T08:00:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.GLUCOSE_FASTING_SERUM.code);
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });

    it('maps HbA1c to LOINC 4548-4 with UCUM %', () => {
      const obs = {
        id: 'obs-hba1c-1',
        userId: mockPatientId,
        type: 'HBA1C',
        numericValue: 6.3,
        unit: '%',
        observedAt: new Date('2026-10-11T09:00:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.HBA1C_BLOOD.code);
      expect(fhirObs.valueQuantity?.value).toBe(6.3);
      expect(fhirObs.valueQuantity?.code).toBe('%');
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });

    it('maps Blood Pressure to panel LOINC 85354-9 with systolic and diastolic components', () => {
      const obs = {
        id: 'obs-bp-1',
        userId: mockPatientId,
        type: 'BLOOD_PRESSURE',
        numericValue: 124,
        secondaryValue: 78,
        unit: 'mmHg',
        observedAt: new Date('2026-11-06T18:00:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.BLOOD_PRESSURE_PANEL.code);
      expect(fhirObs.component).toHaveLength(2);
      expect(fhirObs.component?.[0].code.coding?.[0].code).toBe(LOINC_CODES.BP_SYSTOLIC.code);
      expect(fhirObs.component?.[0].valueQuantity?.value).toBe(124);
      expect(fhirObs.component?.[0].valueQuantity?.code).toBe('mm[Hg]');
      expect(fhirObs.component?.[1].code.coding?.[0].code).toBe(LOINC_CODES.BP_DIASTOLIC.code);
      expect(fhirObs.component?.[1].valueQuantity?.value).toBe(78);
      expect(fhirObs.component?.[1].valueQuantity?.code).toBe('mm[Hg]');
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });

    it('maps body weight to LOINC 29463-7 with UCUM kg', () => {
      const obs = {
        id: 'obs-weight-1',
        userId: mockPatientId,
        type: 'WEIGHT',
        numericValue: 72.5,
        unit: 'kg',
        observedAt: new Date('2026-11-05T07:00:00Z'),
      };

      const fhirObs = mapToFhirObservation(obs);

      expect(fhirObs.code.coding?.[0].code).toBe(LOINC_CODES.BODY_WEIGHT.code);
      expect(fhirObs.valueQuantity?.value).toBe(72.5);
      expect(fhirObs.valueQuantity?.code).toBe('kg');
      expect(validateFhirResource(fhirObs).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 5. CONDITION RESOURCE VALIDATION
  // ==========================================================================
  describe('5. Condition Resource Mapping & Conformance', () => {
    it('creates Type 2 Diabetes Mellitus Condition with SNOMED 44054006 and ICD-10 E11', () => {
      const condition = mapToFhirCondition(mockPatientId, {
        diabetesType: 'TYPE_2_DIABETES',
        diagnosisYear: 2021,
      });

      expect(condition.resourceType).toBe('Condition');
      expect(condition.clinicalStatus?.coding?.[0].code).toBe('active');
      expect(condition.verificationStatus?.coding?.[0].code).toBe('confirmed');
      expect(condition.code.coding?.some((c) => c.code === '44054006')).toBe(true);
      expect(condition.code.coding?.some((c) => c.code === 'E11')).toBe(true);
      expect(condition.subject.reference).toBe(`Patient/${mockPatientId}`);
      expect(condition.recordedDate).toBe('2021-01-01');

      const validation = validateFhirResource(condition);
      expect(validation.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 6. CAREPLAN & GOAL RESOURCE VALIDATION
  // ==========================================================================
  describe('6. CarePlan & Goal Resource Conformance', () => {
    it('maps care plan with diabetes SNOMED category 734163000 and activities', () => {
      const cp = {
        id: 'careplan-001',
        patientId: mockPatientId,
        doctorId: mockDoctorId,
        version: 1,
        status: 'ACTIVE',
        title: 'Type 2 Diabetes Glycemic Control Plan v1',
        summary: 'Target fasting glucose 80-130 mg/dL, evening Metformin 500mg SR.',
        goals: [
          {
            id: 'goal-001',
            title: 'Maintain fasting blood sugar in target',
            targetValue: '80 - 130',
            unit: 'mg/dL',
            status: 'IN_PROGRESS',
          },
        ],
        activities: [
          {
            title: 'Morning fasting blood glucose check',
            instructions: 'Check before breakfast.',
            frequency: 'DAILY',
            timing: 'MORNING',
          },
        ],
      };

      const fhirCarePlan = mapToFhirCarePlan(cp);

      expect(fhirCarePlan.resourceType).toBe('CarePlan');
      expect(fhirCarePlan.status).toBe('active');
      expect(fhirCarePlan.intent).toBe('plan');
      expect(fhirCarePlan.category?.[0].coding?.[0].code).toBe('734163000');
      expect(fhirCarePlan.author?.reference).toBe(`Practitioner/${mockDoctorId}`);
      expect(fhirCarePlan.activity?.[0].detail?.description).toBe('Check before breakfast.');

      const validation = validateFhirResource(fhirCarePlan);
      expect(validation.valid).toBe(true);

      const fhirGoal = mapToFhirGoal(cp.goals[0], mockPatientId);
      expect(fhirGoal.resourceType).toBe('Goal');
      expect(fhirGoal.lifecycleStatus).toBe('active');
      expect(fhirGoal.subject.reference).toBe(`Patient/${mockPatientId}`);
      expect(validateFhirResource(fhirGoal).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 7. TASK RESOURCE VALIDATION
  // ==========================================================================
  describe('7. Task Resource Conformance', () => {
    it('maps care task into FHIR Task with status, priority, and execution period', () => {
      const task = {
        id: 'task-001',
        userId: mockPatientId,
        title: 'Check morning fasting blood glucose',
        instructions: 'Take reading immediately after waking up.',
        status: 'PENDING',
        priority: 'HIGH',
        dueAt: new Date('2026-11-08T08:00:00Z'),
        assignedById: mockDoctorId,
      };

      const fhirTask = mapToFhirTask(task);

      expect(fhirTask.resourceType).toBe('Task');
      expect(fhirTask.status).toBe('ready');
      expect(fhirTask.intent).toBe('order');
      expect(fhirTask.priority).toBe('urgent');
      expect(fhirTask.for?.reference).toBe(`Patient/${mockPatientId}`);
      expect(fhirTask.requester?.reference).toBe(`Practitioner/${mockDoctorId}`);

      const validation = validateFhirResource(fhirTask);
      expect(validation.valid).toBe(true);
    });
  });

  // ==========================================================================
  // 8. MEDICATIONREQUEST & MEDICATIONSTATEMENT
  // ==========================================================================
  describe('8. MedicationRequest & MedicationStatement Conformance', () => {
    it('maps doctor prescription into MedicationRequest', () => {
      const med = {
        id: 'med-001',
        userId: mockPatientId,
        medicineName: 'Tab Metformin 500mg SR',
        dosage: '500mg',
        timing: 'NIGHT',
        isActive: true,
      };

      const fhirMedReq = mapToFhirMedicationRequest(med);

      expect(fhirMedReq.resourceType).toBe('MedicationRequest');
      expect(fhirMedReq.status).toBe('active');
      expect(fhirMedReq.intent).toBe('order');
      expect(fhirMedReq.medicationCodeableConcept?.text).toBe('Tab Metformin 500mg SR');
      expect(validateFhirResource(fhirMedReq).valid).toBe(true);
    });

    it('maps patient adherence intake into MedicationStatement', () => {
      const event = {
        id: 'adh-001',
        medicineName: 'Tab Metformin 500mg SR',
        status: 'TAKEN',
        takenAt: new Date('2026-11-06T20:30:00Z'),
      };

      const fhirStmt = mapToFhirMedicationStatement(event, mockPatientId);

      expect(fhirStmt.resourceType).toBe('MedicationStatement');
      expect(fhirStmt.status).toBe('completed');
      expect(fhirStmt.subject.reference).toBe(`Patient/${mockPatientId}`);
      expect(validateFhirResource(fhirStmt).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 9. ENCOUNTER & DIAGNOSTIC REPORT
  // ==========================================================================
  describe('9. Encounter & DiagnosticReport Conformance', () => {
    it('maps clinical consultation appointment to Encounter', () => {
      const appt = {
        id: 'appt-001',
        patientId: mockPatientId,
        doctorId: mockDoctorId,
        status: 'CONFIRMED',
        scheduledAt: new Date('2026-11-10T11:00:00Z'),
      };

      const encounter = mapToFhirEncounter(appt);

      expect(encounter.resourceType).toBe('Encounter');
      expect(encounter.status).toBe('planned');
      expect(encounter.class.code).toBe('AMB');
      expect(encounter.participant?.[0].individual?.reference).toBe(`Practitioner/${mockDoctorId}`);
      expect(validateFhirResource(encounter).valid).toBe(true);
    });

    it('maps health lab document to DiagnosticReport and DocumentReference', () => {
      const doc = {
        id: 'doc-lab-1',
        userId: mockPatientId,
        title: 'Quarterly Glycemic Panel (HbA1c: 6.3%)',
        category: 'LAB_REPORT',
        mimeType: 'application/pdf',
      };

      const report = mapToFhirDiagnosticReport(doc);
      expect(report.resourceType).toBe('DiagnosticReport');
      expect(report.status).toBe('final');
      expect(validateFhirResource(report).valid).toBe(true);

      const docRef = mapToFhirDocumentReference(doc);
      expect(docRef.resourceType).toBe('DocumentReference');
      expect(docRef.status).toBe('current');
      expect(validateFhirResource(docRef).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 10. CONSENT & AUDIT EVENT
  // ==========================================================================
  describe('10. Consent & AuditEvent Conformance', () => {
    it('maps caregiver delegation consent into FHIR Consent', () => {
      const consent = {
        id: 'consent-001',
        patientId: mockPatientId,
        caregiverEmail: 'meera.joshi@family.aarogyadamu.local',
        relationship: 'DAUGHTER',
        status: 'ACTIVE',
        permissions: JSON.stringify(['VIEW_OBSERVATIONS', 'MANAGE_TASKS']),
        expiresAt: new Date('2027-11-01T00:00:00Z'),
      };

      const fhirConsent = mapToFhirConsent(consent);

      expect(fhirConsent.resourceType).toBe('Consent');
      expect(fhirConsent.status).toBe('active');
      expect(fhirConsent.scope.coding?.[0].code).toBe('patient-privacy');
      expect(fhirConsent.provision?.action).toHaveLength(2);
      expect(validateFhirResource(fhirConsent).valid).toBe(true);
    });

    it('maps audit log into FHIR AuditEvent', () => {
      const log = {
        id: 'audit-001',
        userId: mockDoctorId,
        action: 'UPDATE_CARE_PLAN',
        resourceType: 'CarePlan',
        targetId: 'careplan-001',
        status: 'SUCCESS',
        createdAt: new Date('2026-11-06T15:00:00Z'),
      };

      const event = mapToFhirAuditEvent(log);

      expect(event.resourceType).toBe('AuditEvent');
      expect(event.type.code).toBe('rest');
      expect(event.action).toBe('U');
      expect(event.outcome).toBe('0');
      expect(event.agent?.[0].who?.reference).toBe(`User/${mockDoctorId}`);
      expect(validateFhirResource(event).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 11. BUNDLE SERIALIZATION & PATIENT $EVERYTHING
  // ==========================================================================
  describe('11. FHIR Bundle Serialization & $everything Operations', () => {
    it('creates valid searchset bundle with total and self link', () => {
      const patient = mapToFhirPatient({ id: mockPatientId, email: 'p@test.local' });
      const bundle = createSearchsetBundle([patient], 'Patient', 1);

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('searchset');
      expect(bundle.total).toBe(1);
      expect(bundle.entry?.[0].resource?.resourceType).toBe('Patient');
      expect(validateFhirResource(bundle).valid).toBe(true);
    });

    it('creates comprehensive Patient $everything collection bundle', () => {
      const patient = mapToFhirPatient({ id: mockPatientId, email: 'p@test.local' });
      const condition = mapToFhirCondition(mockPatientId);
      const obs = mapToFhirObservation({
        id: 'obs-1',
        userId: mockPatientId,
        type: 'BLOOD_GLUCOSE',
        numericValue: 120,
        unit: 'mg/dL',
      });

      const bundle = createPatientRecordBundle(mockPatientId, [patient, condition, obs]);

      expect(bundle.resourceType).toBe('Bundle');
      expect(bundle.type).toBe('collection');
      expect(bundle.total).toBe(3);
      expect(bundle.entry?.map((e) => e.resource?.resourceType)).toEqual([
        'Patient',
        'Condition',
        'Observation',
      ]);
      expect(validateFhirResource(bundle).valid).toBe(true);
    });
  });

  // ==========================================================================
  // 12. OPERATION OUTCOME ON INVALID FHIR RESOURCES
  // ==========================================================================
  describe('12. OperationOutcome Error Generation & Invariant Enforcement', () => {
    it('generates OperationOutcome when mandatory fields are missing', () => {
      const invalidObs = {
        resourceType: 'Observation',
        // missing status, code, subject
      };

      const result = validateFhirResource(invalidObs);

      expect(result.valid).toBe(false);
      expect(result.outcome?.resourceType).toBe('OperationOutcome');
      expect(result.outcome?.issue.length).toBeGreaterThanOrEqual(3);
      expect(result.outcome?.issue.some((i) => i.diagnostics?.includes('status'))).toBe(true);
      expect(result.outcome?.issue.some((i) => i.diagnostics?.includes('code'))).toBe(true);
      expect(result.outcome?.issue.some((i) => i.diagnostics?.includes('subject'))).toBe(true);
    });

    it('rejects payloads with missing or empty resourceType', () => {
      const result = validateFhirResource({});

      expect(result.valid).toBe(false);
      expect(result.outcome?.issue[0].diagnostics).toContain('resourceType');
    });
  });
});
