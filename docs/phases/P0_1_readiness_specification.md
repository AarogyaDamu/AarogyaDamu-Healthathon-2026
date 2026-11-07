# AAROGYADAMU PROJECT 3 — P0.1 READINESS SPECIFICATION
## Phase P0.1: Unified Health Journal Specification & Implementation Blueprint

**Phase Identifier:** P0.1 — Unified Health Journal  
**Governing Document:** Master P0 Development Governance  
**Status:** **READY_FOR_IMPLEMENTATION** (Feature Flag `P0_1_HEALTH_JOURNAL` Currently Gated)  
**Execution Pre-requisite:** P0.0 and P0.0.1 Verification Complete  
**Architecture Diagram:** [`docs/architecture/p0-1-health-journal.mmd`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/docs/architecture/p0-1-health-journal.mmd)  

---

## 1. Executive Summary & Objectives

The Unified Health Journal is the core clinical recording surface of AarogyaDamu. It transforms isolated vital readings into a longitudinal health timeline across both mobile and web products:
- **Mobile Application:** Enables Patients and Caregivers to log, review, and synchronize blood glucose, blood pressure, weight, and HbA1c readings online or offline.
- **Doctor Web Portal:** Provides clinicians with an ambulatory glycemic profile, longitudinal trend analytics, and chronological consultation integration.
- **Architectural Principle:** **Zero Duplication.** Utilizes the existing `HealthObservation` data model and P0.0.1 deterministic clinical safety evaluator rather than constructing duplicate or parallel observation systems.

---

## 2. Core Supported Vitals & Clinical Metric Specifications

| Metric | Primary Unit | Alternative Unit | Primary Value | Secondary Value | Clinical Contexts |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Blood Glucose** | `mg/dL` | `mmol/L` (1 mmol/L = 18.0182 mg/dL) | Glucose reading | None | `FASTING`, `PRE_MEAL`, `POST_MEAL_2HR`, `BEDTIME`, `RANDOM` |
| **Blood Pressure** | `mmHg` | None | Systolic (mmHg) | Diastolic (mmHg) | `GENERAL`, `RESTING`, `MORNING`, `EVENING` |
| **Body Weight** | `kg` | `lbs` (1 kg = 2.20462 lbs) | Weight value | None | `FASTING`, `MORNING`, `POST_DIALYSIS` |
| **HbA1c** | `%` (NGSP) | `mmol/mol` (IFCC) | HbA1c percentage | None | `GENERAL`, `LAB_CONFIRMED` |

---

## 3. Provenance & Multi-Role Ingestion Matrix

Every journal entry records distinct provenance tags to maintain clinical auditability:

```typescript
export const SourceProvenanceEnum = z.enum([
  'MANUAL_PATIENT',   // Patient entered manually via mobile keypad
  'CAREGIVER_INPUT',  // Authorized caregiver entered on behalf of patient
  'BLUETOOTH_DEVICE', // Direct sync from BLE glucometer or BP cuff
  'DOCTOR_CLINICAL',  // Recorded by treating clinician during in-clinic visit
  'LAB_REPORT',       // Extracted from certified diagnostic lab document
  'AI_EXTRACTED',     // Extracted via Sarvam/Gemini OCR document pipeline
]);
```

### Authorization Gates:
1. **Patient Entry (`MANUAL_PATIENT`):** Permitted for own patient account (`effectivePatientId == req.user.id`).
2. **Caregiver Entry (`CAREGIVER_INPUT`):** Permitted only when `CaregiverConsent` has status `ACTIVE`, is unexpired, and includes `MANAGE_OBSERVATIONS`.
3. **Doctor Entry (`DOCTOR_CLINICAL`):** Permitted only when `User.isClinician == true` and an active `DoctorPatientAssignment` exists.
4. **Bluetooth Sync (`BLUETOOTH_DEVICE`):** Requires device identifier (`deviceModel`) and client timestamp.

---

## 4. API Endpoints Specification

### A. List Observations (Paginated & Filterable)
- **Route:** `GET /api/observations`
- **Headers:** `Authorization: Bearer <token>`, optional `X-Target-Patient-Id: <uuid>`
- **Query Parameters:**
  - `type`: `BLOOD_GLUCOSE | BLOOD_PRESSURE | WEIGHT | HBA1C` (optional)
  - `startDate`: ISO 8601 string (optional)
  - `endDate`: ISO 8601 string (optional)
  - `limit`: Integer, default 50, max 200
  - `cursor`: UUID string for pagination
- **Response:**
  ```json
  {
    "observations": [ ... ],
    "pagination": { "hasMore": false, "totalCount": 42 }
  }
  ```

### B. Ingest Observation (Idempotent)
- **Route:** `POST /api/observations`
- **Body:**
  ```json
  {
    "type": "BLOOD_GLUCOSE",
    "numericValue": 125,
    "unit": "mg/dL",
    "context": "FASTING",
    "observedAt": "2026-11-02T08:00:00.000Z",
    "sourceProvenance": "MANUAL_PATIENT",
    "idempotencyKey": "9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d",
    "notes": "Pre-breakfast reading"
  }
  ```
- **Responses:**
  - `201 Created`: Observation recorded + P0.0.1 safety evaluation result.
  - `200 OK`: Duplicate idempotency key detected (`isIdempotentReplay: true`), returns existing observation without duplicate creation.
  - `400 Bad Request`: Invalid/negative numbers or missing required fields.
  - `403 Forbidden`: Unauthorized actor or missing caregiver consent.

### C. Amend / Correct Observation (Audit Trail Preservation)
- **Route:** `PATCH /api/observations/:id`
- **Purpose:** Clinical record hygiene without silent deletion.
- **Body:**
  ```json
  {
    "numericValue": 135,
    "notes": "Corrected typo: was 13.5",
    "reasonForCorrection": "TYPO_CORRECTION"
  }
  ```
- **Behavior:** Updates `HealthObservation` record while logging full before-and-after diffs to `AuditLog` with `action: 'OBSERVATION_AMENDED'`.

### D. Ambulatory Glycemic & Vital Statistics
- **Route:** `GET /api/observations/stats`
- **Query Parameters:** `type=BLOOD_GLUCOSE&days=14`
- **Computed Outputs:**
  - `mean`: Average glucose value over window.
  - `standardDeviation` & `coefficientOfVariation` (CV%).
  - `timeInRange`:
    - `veryLow` (< 54 mg/dL): Target < 1%
    - `low` (54–69 mg/dL): Target < 4%
    - `target` (70–180 mg/dL): Target > 70%
    - `high` (181–250 mg/dL): Target < 25%
    - `veryHigh` (> 250 mg/dL): Target < 5%

---

## 5. Offline Capture & Synchronization Engine

### Mobile Client Architecture:
1. **Local Persistent Cache:** Observations captured offline are stored in an encrypted client queue (`AsyncStorage` / SQLite) with a client-generated UUID `idempotencyKey`.
2. **Network Listener:** Detects transition from offline to online via NetInfo.
3. **Queue Replay:** Sequentially drains pending queue using exponential backoff retry.
4. **Conflict Resolution:** Since every entry possesses a unique `idempotencyKey` and `observedAt` client timestamp, server re-processing is strictly idempotent and chronological.

---

## 6. Doctor Web Clinical Timeline Integration

### Workstation Integration:
1. **Chronological View:** Doctor Web patient dashboard renders vitals along with consultation notes, milestone completions, and care tasks on a unified timeline.
2. **Abnormal Value Highlighting:** Items flagged with `CRITICAL_LOW`, `HIGH`, or `HYPERTENSIVE_CRISIS` are badged with clinical alert markers.
3. **In-Clinic Entry:** Allows treating physician to input point-of-care capillary glucose or mercury/oscillometric blood pressure with provenance `DOCTOR_CLINICAL`.

---

## 7. P0.1 Entry Gate Checklist

Before enabling `P0_1_HEALTH_JOURNAL`:
- [x] P0.0 and P0.0.1 Safety Foundation verified and frozen.
- [x] Database schema (`HealthObservation`, `PatientProfile`) verified and migrated.
- [x] Clinical rules specification documented and marked `PENDING_CLINICIAN_APPROVAL`.
- [x] All 138 automated unit/integration tests passing 100% green.
- [x] Feature flag `P0_1_HEALTH_JOURNAL` ready for controlled stage activation.
- [ ] User approval received to proceed with Phase P0.1 implementation.

