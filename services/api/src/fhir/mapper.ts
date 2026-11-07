/**
 * HL7 FHIR R4 Data Mapper
 * Transforms AarogyaDamu clinical models into valid HL7 FHIR R4 (v4.0.1) resources.
 */

import {
  FhirPatient,
  FhirPractitioner,
  FhirRelatedPerson,
  FhirObservation,
  FhirCondition,
  FhirCarePlan,
  FhirGoal,
  FhirTask,
  FhirMedicationRequest,
  FhirMedicationStatement,
  FhirEncounter,
  FhirDiagnosticReport,
  FhirDocumentReference,
  FhirConsent,
  FhirCommunication,
  FhirProvenance,
  FhirAuditEvent,
} from './types';
import { resolveLoincCoding, toCanonicalUcum, LOINC_CODES } from '@aarogyadamu/contracts';

const FHIR_BASE_URL = process.env.FHIR_SERVER_URL || 'https://app.example.com/api/fhir/r4';

/**
 * Maps User & PatientProfile to FHIR Patient resource
 */
export function mapToFhirPatient(user: any, profile?: any): FhirPatient {
  const patientProfile = profile || user.profile;
  const fullName = patientProfile?.fullName || 'Synthetic Patient';
  const nameParts = fullName.split(' ');
  const family = nameParts.length > 1 ? nameParts[nameParts.length - 1] : undefined;
  const given = nameParts.length > 1 ? nameParts.slice(0, -1) : [fullName];

  return {
    resourceType: 'Patient',
    id: user.id,
    meta: {
      versionId: '1',
      lastUpdated: (user.updatedAt || new Date()).toISOString(),
      profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
    },
    identifier: [
      {
        use: 'official',
        system: `${FHIR_BASE_URL}/identifiers/patient`,
        value: user.id,
      },
      ...(user.isSyntheticDemo ? [{
        use: 'temp' as const,
        system: 'https://aarogyadamu.local/fhir/demo-status',
        value: 'SYNTHETIC_DEMO_DATA',
      }] : []),
    ],
    active: user.isActive ?? true,
    name: [
      {
        use: 'official',
        text: fullName,
        family,
        given,
      },
    ],
    telecom: [
      {
        system: 'email',
        value: user.email,
        use: 'home',
      },
    ],
    gender: 'unknown',
    birthDate: patientProfile?.dateOfBirth 
      ? new Date(patientProfile.dateOfBirth).toISOString().split('T')[0]
      : undefined,
    generalPractitioner: patientProfile?.primaryClinician ? [
      {
        display: patientProfile.primaryClinician,
      },
    ] : undefined,
  };
}

/**
 * Maps User (Clinician) to FHIR Practitioner resource
 */
export function mapToFhirPractitioner(user: any, profile?: any): FhirPractitioner {
  const clinicianProfile = profile || user.profile;
  const fullName = clinicianProfile?.fullName || 'Dr. Clinician';
  const nameParts = fullName.replace(/^Dr\.\s*/i, '').split(' ');
  const family = nameParts.length > 1 ? nameParts[nameParts.length - 1] : fullName;
  const given = nameParts.length > 1 ? nameParts.slice(0, -1) : ['Dr.'];

  return {
    resourceType: 'Practitioner',
    id: user.id,
    meta: {
      versionId: '1',
      lastUpdated: (user.updatedAt || new Date()).toISOString(),
      profile: ['http://hl7.org/fhir/StructureDefinition/Practitioner'],
    },
    identifier: [
      {
        use: 'official',
        system: `${FHIR_BASE_URL}/identifiers/practitioner`,
        value: user.id,
      },
    ],
    active: user.isActive ?? true,
    name: [
      {
        use: 'official',
        text: fullName,
        prefix: ['Dr.'],
        family,
        given,
      },
    ],
    telecom: [
      {
        system: 'email',
        value: user.email,
        use: 'work',
      },
    ],
    qualification: [
      {
        code: {
          coding: [
            {
              system: 'http://snomed.info/sct',
              code: '11935004',
              display: 'Diabetologist',
            },
          ],
          text: clinicianProfile?.primaryClinician || 'Diabetology & Endocrinology',
        },
      },
    ],
  };
}

/**
 * Maps CaregiverConsent or Caregiver User to FHIR RelatedPerson resource
 */
export function mapToFhirRelatedPerson(consentOrUser: any, patientId: string): FhirRelatedPerson {
  const isConsent = !!consentOrUser.caregiverEmail;
  const id = isConsent ? consentOrUser.id : consentOrUser.id;
  const name = isConsent ? (consentOrUser.caregiverName || consentOrUser.caregiverEmail) : (consentOrUser.profile?.fullName || consentOrUser.email);
  const email = isConsent ? consentOrUser.caregiverEmail : consentOrUser.email;
  const relationship = isConsent ? (consentOrUser.relationship || 'CAREGIVER') : 'CAREGIVER';

  return {
    resourceType: 'RelatedPerson',
    id,
    meta: {
      versionId: '1',
      lastUpdated: (consentOrUser.updatedAt || new Date()).toISOString(),
      profile: ['http://hl7.org/fhir/StructureDefinition/RelatedPerson'],
    },
    active: isConsent ? consentOrUser.status === 'ACTIVE' : (consentOrUser.isActive ?? true),
    patient: {
      reference: `Patient/${patientId}`,
      type: 'Patient',
    },
    relationship: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode',
            code: relationship === 'DAUGHTER' ? 'DAU' : relationship === 'SON' ? 'SON' : 'FAMMEMB',
            display: relationship,
          },
        ],
        text: relationship,
      },
    ],
    name: [
      {
        use: 'usual',
        text: name,
      },
    ],
    telecom: [
      {
        system: 'email',
        value: email,
      },
    ],
  };
}

/**
 * Maps HealthObservation to FHIR Observation resource with verified LOINC & UCUM
 */
export function mapToFhirObservation(obs: any): FhirObservation {
  const loinc = resolveLoincCoding({
    type: obs.type,
    context: obs.context,
    provenance: obs.provenance,
  });

  const canonicalUcum = toCanonicalUcum(obs.unit || (loinc ? loinc.defaultUcumUnit : ''));
  const effectiveDateTime = (obs.observedAt || obs.createdAt || new Date()).toISOString();

  // Blood Pressure has panel with systolic/diastolic components
  if (obs.type === 'BLOOD_PRESSURE' && obs.secondaryValue) {
    return {
      resourceType: 'Observation',
      id: obs.id,
      meta: {
        lastUpdated: (obs.updatedAt || new Date()).toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/vitalsigns'],
      },
      status: 'final',
      category: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
              display: 'Vital Signs',
            },
          ],
        },
      ],
      code: {
        coding: [
          {
            system: 'http://loinc.org',
            code: LOINC_CODES.BLOOD_PRESSURE_PANEL.code,
            display: LOINC_CODES.BLOOD_PRESSURE_PANEL.display,
          },
        ],
        text: 'Blood Pressure Panel',
      },
      subject: {
        reference: `Patient/${obs.userId}`,
        type: 'Patient',
      },
      effectiveDateTime,
      component: [
        {
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: LOINC_CODES.BP_SYSTOLIC.code,
                display: LOINC_CODES.BP_SYSTOLIC.display,
              },
            ],
            text: 'Systolic blood pressure',
          },
          valueQuantity: {
            value: Number(obs.numericValue),
            unit: 'mm[Hg]',
            system: 'http://unitsofmeasure.org',
            code: 'mm[Hg]',
          },
        },
        {
          code: {
            coding: [
              {
                system: 'http://loinc.org',
                code: LOINC_CODES.BP_DIASTOLIC.code,
                display: LOINC_CODES.BP_DIASTOLIC.display,
              },
            ],
            text: 'Diastolic blood pressure',
          },
          valueQuantity: {
            value: Number(obs.secondaryValue),
            unit: 'mm[Hg]',
            system: 'http://unitsofmeasure.org',
            code: 'mm[Hg]',
          },
        },
      ],
      note: obs.notes ? [{ text: obs.notes }] : undefined,
    };
  }

  return {
    resourceType: 'Observation',
    id: obs.id,
    meta: {
      lastUpdated: (obs.updatedAt || new Date()).toISOString(),
      profile: [
        obs.type === 'BLOOD_GLUCOSE' || obs.type === 'HBA1C'
          ? 'http://hl7.org/fhir/StructureDefinition/Observation'
          : 'http://hl7.org/fhir/StructureDefinition/vitalsigns',
      ],
    },
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: obs.type === 'BLOOD_GLUCOSE' || obs.type === 'HBA1C' ? 'laboratory' : 'vital-signs',
            display: obs.type === 'BLOOD_GLUCOSE' || obs.type === 'HBA1C' ? 'Laboratory' : 'Vital Signs',
          },
        ],
      },
    ],
    code: {
      coding: loinc ? [
        {
          system: loinc.system,
          code: loinc.code,
          display: loinc.display,
        },
      ] : [
        {
          system: 'https://aarogyadamu.local/terminology',
          code: obs.type,
          display: obs.type.replace(/_/g, ' '),
        },
      ],
      text: loinc ? loinc.shortName : obs.type,
    },
    subject: {
      reference: `Patient/${obs.userId}`,
      type: 'Patient',
    },
    effectiveDateTime,
    valueQuantity: {
      value: Number(obs.numericValue),
      unit: obs.unit || (loinc ? loinc.defaultUcumUnit : ''),
      system: 'http://unitsofmeasure.org',
      code: canonicalUcum,
    },
    referenceRange: loinc?.referenceRange ? [
      {
        low: loinc.referenceRange.low ? {
          value: loinc.referenceRange.low,
          unit: loinc.referenceRange.unit,
          system: 'http://unitsofmeasure.org',
          code: toCanonicalUcum(loinc.referenceRange.unit),
        } : undefined,
        high: loinc.referenceRange.high ? {
          value: loinc.referenceRange.high,
          unit: loinc.referenceRange.unit,
          system: 'http://unitsofmeasure.org',
          code: toCanonicalUcum(loinc.referenceRange.unit),
        } : undefined,
        text: loinc.referenceRange.text,
      },
    ] : undefined,
    note: [
      ...(obs.notes ? [{ text: obs.notes }] : []),
      ...(obs.context ? [{ text: `Timing Context: ${obs.context}` }] : []),
      ...(obs.provenance ? [{ text: `Provenance: ${obs.provenance}` }] : []),
    ],
  };
}

/**
 * Creates Condition resource for Diabetes diagnosis
 */
export function mapToFhirCondition(patientId: string, profile?: any): FhirCondition {
  const diabetesType = profile?.diabetesType || 'TYPE_2_DIABETES';
  const isType1 = diabetesType === 'TYPE_1_DIABETES';

  return {
    resourceType: 'Condition',
    id: `cond-${patientId}-diabetes`,
    clinicalStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
          code: 'active',
          display: 'Active',
        },
      ],
    },
    verificationStatus: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
          code: 'confirmed',
          display: 'Confirmed',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: 'problem-list-item',
            display: 'Problem List Item',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: 'http://snomed.info/sct',
          code: isType1 ? '46635009' : '44054006',
          display: isType1 ? 'Type 1 diabetes mellitus' : 'Type 2 diabetes mellitus',
        },
        {
          system: 'http://hl7.org/fhir/sid/icd-10',
          code: isType1 ? 'E10' : 'E11',
          display: isType1 ? 'Type 1 diabetes mellitus' : 'Type 2 diabetes mellitus without complications',
        },
      ],
      text: isType1 ? 'Type 1 Diabetes Mellitus' : 'Type 2 Diabetes Mellitus',
    },
    subject: {
      reference: `Patient/${patientId}`,
      type: 'Patient',
    },
    recordedDate: profile?.diagnosisYear ? `${profile.diagnosisYear}-01-01` : undefined,
  };
}

/**
 * Maps CarePlan to FHIR CarePlan resource
 */
export function mapToFhirCarePlan(carePlan: any): FhirCarePlan {
  return {
    resourceType: 'CarePlan',
    id: carePlan.id,
    meta: {
      versionId: String(carePlan.version || 1),
      lastUpdated: (carePlan.updatedAt || new Date()).toISOString(),
      profile: ['http://hl7.org/fhir/StructureDefinition/CarePlan'],
    },
    status: carePlan.status === 'ACTIVE' ? 'active' : carePlan.status === 'COMPLETED' ? 'completed' : 'draft',
    intent: 'plan',
    category: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '734163000',
            display: 'Diabetes mellitus care plan',
          },
        ],
        text: 'Diabetes Care Plan',
      },
    ],
    title: carePlan.title || 'Diabetes Care Plan',
    description: carePlan.summary,
    subject: {
      reference: `Patient/${carePlan.patientId}`,
      type: 'Patient',
    },
    created: (carePlan.createdAt || new Date()).toISOString(),
    author: carePlan.doctorId ? {
      reference: `Practitioner/${carePlan.doctorId}`,
      type: 'Practitioner',
    } : undefined,
    addresses: [
      {
        reference: `Condition/cond-${carePlan.patientId}-diabetes`,
        type: 'Condition',
        display: 'Type 2 Diabetes Mellitus',
      },
    ],
    goal: (carePlan.goals || []).map((g: any) => ({
      reference: `Goal/${g.id}`,
      type: 'Goal',
      display: g.title,
    })),
    activity: (carePlan.activities || []).map((act: any) => ({
      detail: {
        kind: 'Task',
        code: {
          text: act.title,
        },
        status: 'in-progress',
        description: act.instructions,
        scheduledString: `${act.frequency || 'DAILY'} - ${act.timing || 'MORNING'}`,
      },
    })),
  };
}

/**
 * Maps CarePlanGoal to FHIR Goal resource
 */
export function mapToFhirGoal(goal: any, patientId: string): FhirGoal {
  return {
    resourceType: 'Goal',
    id: goal.id,
    lifecycleStatus: goal.status === 'ACHIEVED' || goal.status === 'COMPLETED' ? 'completed' : 'active',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/goal-category',
            code: goal.category?.toLowerCase() || 'physiotherapy',
            display: goal.category || 'Target',
          },
        ],
      },
    ],
    description: {
      text: goal.title,
    },
    subject: {
      reference: `Patient/${patientId}`,
      type: 'Patient',
    },
    target: [
      {
        detailString: `${goal.targetValue || ''} ${goal.unit || ''}`.trim(),
        dueDate: goal.timeframe,
      },
    ],
  };
}

/**
 * Maps CareTask to FHIR Task resource
 */
export function mapToFhirTask(task: any): FhirTask {
  const statusMap: Record<string, FhirTask['status']> = {
    PENDING: 'ready',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    SNOOZED: 'on-hold',
  };

  return {
    resourceType: 'Task',
    id: task.id,
    status: statusMap[task.status] || 'ready',
    intent: 'order',
    priority: task.priority === 'HIGH' ? 'urgent' : 'routine',
    code: {
      text: task.title,
    },
    description: task.instructions || task.description || task.title,
    for: {
      reference: `Patient/${task.userId}`,
      type: 'Patient',
    },
    authoredOn: (task.createdAt || new Date()).toISOString(),
    lastModified: (task.updatedAt || new Date()).toISOString(),
    requester: task.assignedById ? {
      reference: `Practitioner/${task.assignedById}`,
      type: 'Practitioner',
    } : undefined,
    owner: task.completedById ? {
      reference: task.completedByRole === 'CAREGIVER' 
        ? `RelatedPerson/${task.completedById}` 
        : `Patient/${task.completedById}`,
    } : {
      reference: `Patient/${task.userId}`,
    },
    executionPeriod: task.dueAt ? {
      end: new Date(task.dueAt).toISOString(),
    } : undefined,
    note: task.clinicalNotes ? [{ text: task.clinicalNotes }] : undefined,
  };
}

/**
 * Maps MedicationSchedule to FHIR MedicationRequest
 */
export function mapToFhirMedicationRequest(med: any): FhirMedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    id: med.id,
    status: med.isActive ? 'active' : 'stopped',
    intent: 'order',
    medicationCodeableConcept: {
      text: med.medicineName,
    },
    subject: {
      reference: `Patient/${med.userId}`,
      type: 'Patient',
    },
    authoredOn: (med.createdAt || new Date()).toISOString(),
    dosageInstruction: [
      {
        text: `${med.dosage || ''} - ${med.timing || ''}`.trim(),
      },
    ],
  };
}

/**
 * Maps MedicationAdherenceEvent or intake to FHIR MedicationStatement
 */
export function mapToFhirMedicationStatement(event: any, patientId: string): FhirMedicationStatement {
  return {
    resourceType: 'MedicationStatement',
    id: event.id,
    status: event.status === 'TAKEN' ? 'completed' : event.status === 'SKIPPED' ? 'not-taken' : 'active',
    medicationCodeableConcept: {
      text: event.medicineName || 'Prescribed Diabetes Medication',
    },
    subject: {
      reference: `Patient/${patientId}`,
      type: 'Patient',
    },
    effectiveDateTime: (event.takenAt || event.createdAt || new Date()).toISOString(),
    dateAsserted: (event.createdAt || new Date()).toISOString(),
    note: event.notes ? [{ text: event.notes }] : undefined,
  };
}

/**
 * Maps Appointment to FHIR Encounter
 */
export function mapToFhirEncounter(appt: any): FhirEncounter {
  const statusMap: Record<string, FhirEncounter['status']> = {
    CONFIRMED: 'planned',
    SCHEDULED: 'planned',
    IN_PROGRESS: 'in-progress',
    COMPLETED: 'finished',
    CANCELLED: 'cancelled',
  };

  return {
    resourceType: 'Encounter',
    id: appt.id,
    status: statusMap[appt.status] || 'planned',
    class: {
      system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
      code: 'AMB',
      display: 'ambulatory',
    },
    type: [
      {
        coding: [
          {
            system: 'http://snomed.info/sct',
            code: '408443003',
            display: 'Diabetology clinic',
          },
        ],
        text: 'Diabetes Consultation & Glycemic Review',
      },
    ],
    subject: {
      reference: `Patient/${appt.patientId}`,
      type: 'Patient',
    },
    participant: appt.doctorId ? [
      {
        individual: {
          reference: `Practitioner/${appt.doctorId}`,
          type: 'Practitioner',
        },
      },
    ] : undefined,
    period: {
      start: (appt.scheduledAt || appt.createdAt || new Date()).toISOString(),
    },
  };
}

/**
 * Maps HealthDocument to FHIR DiagnosticReport or DocumentReference
 */
export function mapToFhirDiagnosticReport(doc: any): FhirDiagnosticReport {
  return {
    resourceType: 'DiagnosticReport',
    id: doc.id,
    status: 'final',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v2-0074',
            code: 'LAB',
            display: 'Laboratory',
          },
        ],
      },
    ],
    code: {
      text: doc.title || 'Laboratory Report',
    },
    subject: {
      reference: `Patient/${doc.userId}`,
      type: 'Patient',
    },
    effectiveDateTime: doc.reportDate ? new Date(doc.reportDate).toISOString() : (doc.createdAt || new Date()).toISOString(),
    issued: (doc.createdAt || new Date()).toISOString(),
    conclusion: doc.extractedData ? (typeof doc.extractedData === 'string' ? doc.extractedData : JSON.stringify(doc.extractedData)) : undefined,
  };
}

export function mapToFhirDocumentReference(doc: any): FhirDocumentReference {
  return {
    resourceType: 'DocumentReference',
    id: doc.id,
    status: 'current',
    docStatus: 'final',
    type: {
      text: doc.category || 'Clinical Document',
    },
    subject: {
      reference: `Patient/${doc.userId}`,
      type: 'Patient',
    },
    date: (doc.createdAt || new Date()).toISOString(),
    description: doc.title,
    content: [
      {
        attachment: {
          contentType: doc.mimeType || 'application/pdf',
          title: doc.title,
          url: `${FHIR_BASE_URL}/Binary/${doc.id}`,
        },
      },
    ],
  };
}

/**
 * Maps CaregiverConsent to FHIR Consent
 */
export function mapToFhirConsent(consent: any): FhirConsent {
  let permissions: string[] = [];
  try {
    permissions = typeof consent.permissions === 'string' ? JSON.parse(consent.permissions) : (consent.permissions || []);
  } catch {
    permissions = [];
  }

  return {
    resourceType: 'Consent',
    id: consent.id,
    status: consent.status === 'ACTIVE' ? 'active' : consent.status === 'REVOKED' ? 'inactive' : 'draft',
    scope: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/consentscope',
          code: 'patient-privacy',
          display: 'Privacy Consent',
        },
      ],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
            code: 'IDSCL',
            display: 'information disclosure',
          },
        ],
        text: 'Caregiver Health Data Access Delegation',
      },
    ],
    patient: {
      reference: `Patient/${consent.patientId}`,
      type: 'Patient',
    },
    dateTime: (consent.createdAt || new Date()).toISOString(),
    provision: {
      type: consent.status === 'ACTIVE' ? 'permit' : 'deny',
      period: {
        start: (consent.createdAt || new Date()).toISOString(),
        end: consent.expiresAt ? new Date(consent.expiresAt).toISOString() : undefined,
      },
      actor: [
        {
          role: {
            text: consent.relationship || 'CAREGIVER',
          },
          reference: {
            display: `${consent.caregiverName || ''} <${consent.caregiverEmail}>`.trim(),
          },
        },
      ],
      action: permissions.map((p) => ({
        coding: [
          {
            system: 'https://aarogyadamu.local/consent-actions',
            code: p,
            display: p.replace(/_/g, ' '),
          },
        ],
      })),
    },
  };
}

/**
 * Maps CareTeamMessage or Notification to FHIR Communication
 */
export function mapToFhirCommunication(msg: any): FhirCommunication {
  return {
    resourceType: 'Communication',
    id: msg.id,
    status: 'completed',
    subject: msg.patientId ? {
      reference: `Patient/${msg.patientId}`,
      type: 'Patient',
    } : undefined,
    sender: msg.senderId ? {
      reference: `User/${msg.senderId}`,
    } : undefined,
    recipient: msg.recipientId ? [
      {
        reference: `User/${msg.recipientId}`,
      },
    ] : undefined,
    sent: (msg.createdAt || new Date()).toISOString(),
    payload: [
      {
        contentString: msg.content || msg.message || msg.body || '',
      },
    ],
  };
}

/**
 * Maps AuditLog to FHIR AuditEvent
 */
export function mapToFhirAuditEvent(log: any): FhirAuditEvent {
  const actionChar = log.action?.startsWith('CREATE') ? 'C'
    : log.action?.startsWith('UPDATE') || log.action?.startsWith('AMEND') ? 'U'
    : log.action?.startsWith('DELETE') ? 'D' : 'E';

  return {
    resourceType: 'AuditEvent',
    id: log.id,
    type: {
      system: 'http://terminology.hl7.org/CodeSystem/audit-event-type',
      code: 'rest',
      display: 'RESTful Operation',
    },
    action: actionChar as any,
    recorded: (log.createdAt || new Date()).toISOString(),
    outcome: log.status === 'SUCCESS' || !log.status ? '0' : '4',
    agent: [
      {
        who: log.userId ? {
          reference: `User/${log.userId}`,
        } : undefined,
        requestor: true,
      },
    ],
    source: {
      site: 'AarogyaDamu API',
      observer: {
        display: 'AarogyaDamu Security & Clinical Audit Subsystem',
      },
    },
    entity: log.targetId ? [
      {
        what: {
          reference: `${log.resourceType || 'Resource'}/${log.targetId}`,
        },
        description: log.action,
      },
    ] : undefined,
  };
}

