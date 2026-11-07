# AarogyaDamu — HL7 FHIR R4 (v4.0.1) Interoperability Specification

**Healthcare Interoperability Standard:** HL7 FHIR Release 4 (R4) Version 4.0.1
**Official HL7 Specification:** https://hl7.org/fhir/R4/
**Implementation Classification:** Specialized Diabetes Care Journey Interoperability Layer
**Server Base URL:** `https://app.example.com/api/fhir/r4` (configurable via `FHIR_SERVER_URL`)
**MIME Media Type:** `application/fhir+json; charset=utf-8`

---

## 1. Architectural Overview

AarogyaDamu provides an interoperability abstraction layer between its relational persistence engine (PostgreSQL/Prisma) and healthcare systems using HL7 FHIR R4 (v4.0.1).

Rather than superficially renaming internal database columns, AarogyaDamu implements:
1. **Semantic Transformation Layer (`services/api/src/fhir/mapper.ts`):** Deterministic bi-directional mapping between application state and official FHIR resource schemas.
2. **Clinical Terminology Binding (`packages/contracts/src/loinc.ts`):** Mandatory LOINC codes for observations, SNOMED CT and ICD-10 for conditions and care plans, and UCUM units for all numerical measurements.
3. **Strict Invariant Validation (`services/api/src/fhir/validator.ts`):** Structural validation ensuring mandatory FHIR elements (`status`, `intent`, `code`, `subject`) are present, generating standardized `OperationOutcome` responses on errors.
4. **Bundle Serialization (`services/api/src/fhir/bundle.ts`):** Compliant `searchset` bundles for query results and `collection` bundles for the comprehensive `Patient/:id/$everything` export.

---

## 2. Resource Mapping Matrix

| Internal Domain Model | HL7 FHIR R4 Resource | Required Bindings & Coding Systems | Conformance Profile |
| :--- | :--- | :--- | :--- |
| **`User` + `PatientProfile`** | `Patient` | System `identifiers/patient`, HumanName, ContactPoint | `StructureDefinition/Patient` |
| **`User` (Clinician)** | `Practitioner` | Qualification: SNOMED CT `11935004` (Diabetologist) | `StructureDefinition/Practitioner` |
| **`CaregiverConsent` / Caregiver User** | `RelatedPerson` | HL7 RoleCode `DAU`, `SON`, `FAMMEMB`, reference to `Patient` | `StructureDefinition/RelatedPerson` |
| **`HealthObservation`** | `Observation` | LOINC (`14771-0`, `1558-6`, `88365-2`, `4548-4`, `85354-9`), UCUM | `StructureDefinition/Observation`, `vitalsigns` |
| **Diabetes Diagnosis** | `Condition` | SNOMED CT `44054006` (T2DM), ICD-10 `E11` | `StructureDefinition/Condition` |
| **`CarePlan`** | `CarePlan` | Category: SNOMED CT `734163000` (Diabetes care plan), activities | `StructureDefinition/CarePlan` |
| **`CarePlanGoal`** | `Goal` | LifecycleStatus (`active`, `completed`), target ranges | `StructureDefinition/Goal` |
| **`CareTask`** | `Task` | Intent `order`, priority (`routine`, `urgent`), owner, executionPeriod | `StructureDefinition/Task` |
| **`MedicationSchedule`** | `MedicationRequest` | Intent `order`, status `active`, dosageInstruction | `StructureDefinition/MedicationRequest` |
| **`MedicationAdherenceEvent`** | `MedicationStatement` | Status (`completed`, `not-taken`), dateAsserted | `StructureDefinition/MedicationStatement` |
| **`Appointment`** | `Encounter` | Class `AMB` (Ambulatory), SNOMED CT `408443003` (Diabetology clinic) | `StructureDefinition/Encounter` |
| **`HealthDocument` (Lab)** | `DiagnosticReport` | Category `LAB`, effectiveDateTime, conclusion | `StructureDefinition/DiagnosticReport` |
| **`HealthDocument` (General)** | `DocumentReference` | Attachment content with contentType, date, URL | `StructureDefinition/DocumentReference` |
| **`CaregiverConsent`** | `Consent` | Scope `patient-privacy`, category `IDSCL`, permit actions | `StructureDefinition/Consent` |
| **`CareTeamMessage` / Notice** | `Communication` | Status `completed`, sender, recipient, payload | `StructureDefinition/Communication` |
| **`AuditLog`** | `AuditEvent` | Type `rest`, action C/R/U/D, recorded, outcome `0` (Success) | `StructureDefinition/AuditEvent` |

---

## 3. Supported RESTful Endpoints

All endpoints require OAuth2 / SMART-on-FHIR Bearer tokens (via `Authorization: Bearer <token>`) and enforce RBAC and patient consent boundaries.

### Conformance Metadata
- **`GET /api/fhir/r4/metadata`**: Returns the server `CapabilityStatement` listing supported interaction modes and resource types.

### Patient & Clinical Records
- **`GET /api/fhir/r4/Patient`**: Searches accessible patients (clinician returns assigned patients; patient returns self).
- **`GET /api/fhir/r4/Patient/:id`**: Reads a single patient by ID.
- **`GET /api/fhir/r4/Patient/:id/$everything`**: Comprehensive patient record bundle containing all observations, conditions, care plans, goals, tasks, medication requests, encounters, and consents.

### Observations & Vitals
- **`GET /api/fhir/r4/Observation`**: Searches observations by patient (`subject=Patient/:id`).
- **`GET /api/fhir/r4/Observation/:id`**: Reads a specific observation.

### Care Coordination
- **`GET /api/fhir/r4/Condition`**: Searches active diabetes conditions.
- **`GET /api/fhir/r4/CarePlan`**: Searches patient care plans.
- **`GET /api/fhir/r4/Goal`**: Searches care goals.
- **`GET /api/fhir/r4/Task`**: Searches pending or completed care tasks.

### Medications & Visits
- **`GET /api/fhir/r4/MedicationRequest`**: Prescriptions authorized by clinician.
- **`GET /api/fhir/r4/MedicationStatement`**: Patient-reported adherence statements.
- **`GET /api/fhir/r4/Encounter`**: Diabetology clinic visits and scheduled consultations.
- **`GET /api/fhir/r4/DiagnosticReport`**: Laboratory reports and biomarker panels.
- **`GET /api/fhir/r4/DocumentReference`**: Clinical documents and uploaded reports.
- **`GET /api/fhir/r4/Consent`**: Caregiver delegation consents.
- **`GET /api/fhir/r4/AuditEvent`**: Clinical and security audit log events.

---

## 4. Error Handling via OperationOutcome

When validation fails or an unauthorized request is rejected, the API responds with an official `OperationOutcome` resource:

```json
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "security",
      "diagnostics": "Caregiver lacks VIEW_OBSERVATIONS permission for this patient record."
    }
  ]
}
```

---

## 5. Verification Evidence

Conformance is verified via automated tests in `services/api/src/__tests__/fhir_r4.test.ts` (22 assertions passing):
- Exact LOINC analyte and UCUM unit bindings verified.
- Schema validator invariants tested against intentional missing fields.
- Bundle total and `$everything` composition verified.
