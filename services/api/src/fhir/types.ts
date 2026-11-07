/**
 * HL7 FHIR R4 (Version 4.0.1) Core Resource Types
 * Official Specification: https://hl7.org/fhir/R4/
 */

export interface FhirMeta {
  versionId?: string;
  lastUpdated?: string;
  source?: string;
  profile?: string[];
  security?: FhirCoding[];
  tag?: FhirCoding[];
}

export interface FhirCoding {
  system?: string;
  version?: string;
  code?: string;
  display?: string;
  userSelected?: boolean;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirIdentifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary' | 'old';
  type?: FhirCodeableConcept;
  system?: string;
  value?: string;
  period?: FhirPeriod;
  assigner?: FhirReference;
}

export interface FhirReference {
  reference?: string;
  type?: string;
  identifier?: FhirIdentifier;
  display?: string;
}

export interface FhirPeriod {
  start?: string;
  end?: string;
}

export interface FhirQuantity {
  value?: number;
  comparator?: '<' | '<=' | '>=' | '>';
  unit?: string;
  system?: string;
  code?: string;
}

export interface FhirRange {
  low?: FhirQuantity;
  high?: FhirQuantity;
}

export interface FhirHumanName {
  use?: 'usual' | 'official' | 'temp' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
  prefix?: string[];
  suffix?: string[];
}

export interface FhirContactPoint {
  system?: 'phone' | 'fax' | 'email' | 'pager' | 'url' | 'sms' | 'other';
  value?: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
  rank?: number;
  period?: FhirPeriod;
}

export interface FhirAddress {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  type?: 'postal' | 'physical' | 'both';
  text?: string;
  line?: string[];
  city?: string;
  district?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface FhirAnnotation {
  authorReference?: FhirReference;
  authorString?: string;
  time?: string;
  text: string;
}

export interface FhirAttachment {
  contentType?: string;
  language?: string;
  data?: string;
  url?: string;
  size?: number;
  hash?: string;
  title?: string;
  creation?: string;
}

// ----------------------------------------------------------------------
// Resources
// ----------------------------------------------------------------------

export interface FhirResourceBase {
  resourceType: string;
  id?: string;
  meta?: FhirMeta;
  implicitRules?: string;
  language?: string;
}

export interface FhirPatient extends FhirResourceBase {
  resourceType: 'Patient';
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  address?: FhirAddress[];
  generalPractitioner?: FhirReference[];
  managingOrganization?: FhirReference;
}

export interface FhirPractitioner extends FhirResourceBase {
  resourceType: 'Practitioner';
  identifier?: FhirIdentifier[];
  active?: boolean;
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  qualification?: {
    identifier?: FhirIdentifier[];
    code: FhirCodeableConcept;
    period?: FhirPeriod;
    issuer?: FhirReference;
  }[];
}

export interface FhirRelatedPerson extends FhirResourceBase {
  resourceType: 'RelatedPerson';
  identifier?: FhirIdentifier[];
  active?: boolean;
  patient: FhirReference;
  relationship?: FhirCodeableConcept[];
  name?: FhirHumanName[];
  telecom?: FhirContactPoint[];
  period?: FhirPeriod;
}

export interface FhirObservation extends FhirResourceBase {
  resourceType: 'Observation';
  identifier?: FhirIdentifier[];
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueString?: string;
  valueCodeableConcept?: FhirCodeableConcept;
  interpretation?: FhirCodeableConcept[];
  note?: FhirAnnotation[];
  referenceRange?: {
    low?: FhirQuantity;
    high?: FhirQuantity;
    type?: FhirCodeableConcept;
    appliesTo?: FhirCodeableConcept[];
    age?: FhirRange;
    text?: string;
  }[];
  component?: {
    code: FhirCodeableConcept;
    valueQuantity?: FhirQuantity;
    valueCodeableConcept?: FhirCodeableConcept;
    interpretation?: FhirCodeableConcept[];
  }[];
}

export interface FhirCondition extends FhirResourceBase {
  resourceType: 'Condition';
  identifier?: FhirIdentifier[];
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  severity?: FhirCodeableConcept;
  code: FhirCodeableConcept;
  subject: FhirReference;
  onsetDateTime?: string;
  recordedDate?: string;
  recorder?: FhirReference;
  note?: FhirAnnotation[];
}

export interface FhirCarePlan extends FhirResourceBase {
  resourceType: 'CarePlan';
  identifier?: FhirIdentifier[];
  status: 'draft' | 'active' | 'on-hold' | 'revoked' | 'completed' | 'entered-in-error' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'option';
  category?: FhirCodeableConcept[];
  title?: string;
  description?: string;
  subject: FhirReference;
  period?: FhirPeriod;
  created?: string;
  author?: FhirReference;
  addresses?: FhirReference[];
  goal?: FhirReference[];
  activity?: {
    outcomeCodeableConcept?: FhirCodeableConcept[];
    outcomeReference?: FhirReference[];
    progress?: FhirAnnotation[];
    reference?: FhirReference;
    detail?: {
      kind?: 'Appointment' | 'CommunicationRequest' | 'DeviceRequest' | 'MedicationRequest' | 'NutritionOrder' | 'Task' | 'ServiceRequest' | 'VisionPrescription';
      code?: FhirCodeableConcept;
      status: 'not-started' | 'scheduled' | 'in-progress' | 'on-hold' | 'completed' | 'cancelled' | 'stopped' | 'unknown' | 'entered-in-error';
      statusReason?: FhirCodeableConcept;
      doNotPerform?: boolean;
      scheduledTiming?: any;
      scheduledPeriod?: FhirPeriod;
      scheduledString?: string;
      description?: string;
      performer?: FhirReference[];
    };
  }[];
  note?: FhirAnnotation[];
}

export interface FhirGoal extends FhirResourceBase {
  resourceType: 'Goal';
  identifier?: FhirIdentifier[];
  lifecycleStatus: 'proposed' | 'planned' | 'accepted' | 'active' | 'on-hold' | 'completed' | 'cancelled' | 'entered-in-error' | 'rejected';
  category?: FhirCodeableConcept[];
  description: FhirCodeableConcept;
  subject: FhirReference;
  target?: {
    measure?: FhirCodeableConcept;
    detailQuantity?: FhirQuantity;
    detailRange?: FhirRange;
    detailString?: string;
    dueDate?: string;
  }[];
  statusDate?: string;
  expressedBy?: FhirReference;
  addresses?: FhirReference[];
  note?: FhirAnnotation[];
}

export interface FhirTask extends FhirResourceBase {
  resourceType: 'Task';
  identifier?: FhirIdentifier[];
  status: 'draft' | 'requested' | 'received' | 'accepted' | 'rejected' | 'ready' | 'cancelled' | 'in-progress' | 'on-hold' | 'failed' | 'completed' | 'entered-in-error';
  intent: 'unknown' | 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  code?: FhirCodeableConcept;
  description?: string;
  for?: FhirReference;
  authoredOn?: string;
  lastModified?: string;
  requester?: FhirReference;
  owner?: FhirReference;
  executionPeriod?: FhirPeriod;
  note?: FhirAnnotation[];
}

export interface FhirMedicationRequest extends FhirResourceBase {
  resourceType: 'MedicationRequest';
  identifier?: FhirIdentifier[];
  status: 'active' | 'on-hold' | 'cancelled' | 'completed' | 'entered-in-error' | 'stopped' | 'draft' | 'unknown';
  intent: 'proposal' | 'plan' | 'order' | 'original-order' | 'reflex-order' | 'filler-order' | 'instance-order' | 'option';
  category?: FhirCodeableConcept[];
  medicationCodeableConcept?: FhirCodeableConcept;
  medicationReference?: FhirReference;
  subject: FhirReference;
  authoredOn?: string;
  requester?: FhirReference;
  dosageInstruction?: {
    sequence?: number;
    text?: string;
    timing?: any;
    route?: FhirCodeableConcept;
    doseAndRate?: {
      doseQuantity?: FhirQuantity;
    }[];
  }[];
  note?: FhirAnnotation[];
}

export interface FhirMedicationStatement extends FhirResourceBase {
  resourceType: 'MedicationStatement';
  identifier?: FhirIdentifier[];
  status: 'active' | 'completed' | 'entered-in-error' | 'intended' | 'stopped' | 'on-hold' | 'unknown' | 'not-taken';
  category?: FhirCodeableConcept;
  medicationCodeableConcept?: FhirCodeableConcept;
  medicationReference?: FhirReference;
  subject: FhirReference;
  effectiveDateTime?: string;
  effectivePeriod?: FhirPeriod;
  dateAsserted?: string;
  informationSource?: FhirReference;
  dosage?: {
    text?: string;
    timing?: any;
  }[];
  note?: FhirAnnotation[];
}

export interface FhirEncounter extends FhirResourceBase {
  resourceType: 'Encounter';
  identifier?: FhirIdentifier[];
  status: 'planned' | 'arrived' | 'triaged' | 'in-progress' | 'onleave' | 'finished' | 'cancelled' | 'entered-in-error' | 'unknown';
  class: FhirCoding;
  type?: FhirCodeableConcept[];
  subject: FhirReference;
  participant?: {
    type?: FhirCodeableConcept[];
    individual?: FhirReference;
  }[];
  period?: FhirPeriod;
  reasonCode?: FhirCodeableConcept[];
}

export interface FhirDiagnosticReport extends FhirResourceBase {
  resourceType: 'DiagnosticReport';
  identifier?: FhirIdentifier[];
  status: 'registered' | 'partial' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'appended' | 'cancelled' | 'entered-in-error' | 'unknown';
  category?: FhirCodeableConcept[];
  code: FhirCodeableConcept;
  subject: FhirReference;
  effectiveDateTime?: string;
  issued?: string;
  performer?: FhirReference[];
  result?: FhirReference[];
  conclusion?: string;
  presentedForm?: FhirAttachment[];
}

export interface FhirDocumentReference extends FhirResourceBase {
  resourceType: 'DocumentReference';
  identifier?: FhirIdentifier[];
  status: 'current' | 'superseded' | 'entered-in-error';
  docStatus?: 'preliminary' | 'final' | 'amended' | 'entered-in-error';
  type?: FhirCodeableConcept;
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  date?: string;
  author?: FhirReference[];
  description?: string;
  content: {
    attachment: FhirAttachment;
  }[];
}

export interface FhirConsent extends FhirResourceBase {
  resourceType: 'Consent';
  identifier?: FhirIdentifier[];
  status: 'draft' | 'proposed' | 'active' | 'rejected' | 'inactive' | 'entered-in-error';
  scope: FhirCodeableConcept;
  category: FhirCodeableConcept[];
  patient: FhirReference;
  dateTime?: string;
  performer?: FhirReference[];
  policy?: {
    authority?: string;
    uri?: string;
  }[];
  provision?: {
    type?: 'deny' | 'permit';
    period?: FhirPeriod;
    actor?: {
      role: FhirCodeableConcept;
      reference: FhirReference;
    }[];
    action?: FhirCodeableConcept[];
  };
}

export interface FhirCommunication extends FhirResourceBase {
  resourceType: 'Communication';
  identifier?: FhirIdentifier[];
  status: 'preparation' | 'in-progress' | 'not-done' | 'on-hold' | 'stopped' | 'completed' | 'entered-in-error' | 'unknown';
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  recipient?: FhirReference[];
  sender?: FhirReference;
  sent?: string;
  received?: string;
  payload?: {
    contentString?: string;
    contentAttachment?: FhirAttachment;
  }[];
}

export interface FhirProvenance extends FhirResourceBase {
  resourceType: 'Provenance';
  target: FhirReference[];
  occurredDateTime?: string;
  recorded: string;
  reason?: FhirCodeableConcept[];
  activity?: FhirCodeableConcept;
  agent: {
    type?: FhirCodeableConcept;
    role?: FhirCodeableConcept[];
    who: FhirReference;
    onBehalfOf?: FhirReference;
  }[];
}

export interface FhirAuditEvent extends FhirResourceBase {
  resourceType: 'AuditEvent';
  type: FhirCoding;
  subtype?: FhirCoding[];
  action?: 'C' | 'R' | 'U' | 'D' | 'E';
  period?: FhirPeriod;
  recorded: string;
  outcome?: '0' | '4' | '8' | '12';
  outcomeDesc?: string;
  agent: {
    type?: FhirCodeableConcept;
    role?: FhirCodeableConcept[];
    who?: FhirReference;
    requestor: boolean;
  }[];
  source: {
    site?: string;
    observer: FhirReference;
    type?: FhirCoding[];
  };
  entity?: {
    what?: FhirReference;
    type?: FhirCoding;
    role?: FhirCoding;
    description?: string;
  }[];
}

export interface FhirOperationOutcome extends FhirResourceBase {
  resourceType: 'OperationOutcome';
  issue: {
    severity: 'fatal' | 'error' | 'warning' | 'information';
    code: string;
    details?: FhirCodeableConcept;
    diagnostics?: string;
    location?: string[];
    expression?: string[];
  }[];
}

export interface FhirBundleEntry {
  fullUrl?: string;
  resource?: FhirResourceBase;
  search?: {
    mode?: 'match' | 'include' | 'outcome';
    score?: number;
  };
}

export interface FhirBundle extends FhirResourceBase {
  resourceType: 'Bundle';
  identifier?: FhirIdentifier;
  type: 'document' | 'message' | 'transaction' | 'transaction-response' | 'batch' | 'batch-response' | 'history' | 'searchset' | 'collection';
  timestamp?: string;
  total?: number;
  link?: {
    relation: string;
    url: string;
  }[];
  entry?: FhirBundleEntry[];
}

