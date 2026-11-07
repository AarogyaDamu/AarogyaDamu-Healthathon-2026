# AarogyaDamu — System Architecture & Design Specification

**Application Name:** AarogyaDamu — Diabetes Care Journey Companion
**Health-a-thon Milestone:** Health-a-thon 2026 Production MVP Hardening
**Target Architecture:** Multi-Audience Healthcare Monorepo

---

## 1. High-Level Architecture

AarogyaDamu is architected as an interoperable, multi-experience digital healthcare ecosystem for Type 2 Diabetes management. The platform unites three synchronized user experiences sharing a unified Express.js backend and an HL7 FHIR R4 interoperability layer:

```
                                  +---------------------------------------+
                                  |       AarogyaDamu Ecosystem           |
                                  +---------------------------------------+
                                                     │
         ┌───────────────────────────────────────────┼───────────────────────────────────────────┐
         │                                           │                                           │
         ▼                                           ▼                                           ▼
+-------------------+                       +-------------------+                       +-------------------+
|   Doctor WebApp   |                       | Patient Mobile App|                       |Caregiver Mobile App|
|  (React 18, Vite) |                       |  (React Native)   |                       |  (React Native)   |
+-------------------+                       +-------------------+                       +-------------------+
         │                                           │                                           │
         │ REST / JSON                               │ REST / JSON                               │ REST / JSON
         ▼                                           ▼                                           ▼
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                          AarogyaDamu Core API                                             |
|                                       (Node.js 20, Express, TypeScript)                                   |
+───────────────────────────────────────────────────────────────────────────────────────────────────────────+
  │                      │                        │                         │                        │
  ▼                      ▼                        ▼                         ▼                        ▼
+-----------------+   +--------------------+   +-----------------------+   +-------------------+   +--------------------+
| Auth & Security |   | Care Coordination  |   | HL7 FHIR R4 Engine    |   | Clinical Safety   |   | Damu AI Assistant  |
| (JWT, RBAC)     |   | (Plans, Tasks, Rx) |   | (v4.0.1 Interop)      |   | (ADA 2026 Rules)  |   | (Bounded Decision) |
+-----------------+   +--------------------+   +-----------------------+   +-------------------+   +--------------------+
  │                      │                        │                         │                        │
  └──────────────────────┴────────────────────────┼─────────────────────────┴────────────────────────┘
                                                  ▼
                                      +-----------------------+
                                      |   PostgreSQL Engine   |
                                      |   (Prisma Client 5)   |
                                      +-----------------------+
```

---

## 2. The Three User Experiences

### 1. Doctor WebApp (`apps/web`)
- **Technology:** React 18, Vite 8, TailwindCSS, Lucide React, TypeScript.
- **Target Audience:** Licensed Diabetologists, Endocrinologists, and Primary Care Physicians.
- **Core Capabilities:**
  - Clinical patient command center and longitudinal glycemic trends.
  - Multi-vital ambulatory tracking (fasting/post-meal glucose, HbA1c, BP, weight).
  - Prescribing and medication reconciliation with adherence analytics.
  - Active Care Plan generation with individualized targets and delegated activities.
  - Clinical document review and OCR extraction validation.
  - Human-in-the-loop review and cryptographic sign-off for AI-drafted proposals.
- **Domain Placeholder:** Designed for production deployment at `https://app.example.com`.

### 2. Patient Mobile App (`apps/mobile` - Patient Workspace)
- **Technology:** React Native (Expo SDK 51), Expo Router, TypeScript.
- **Target Audience:** Individuals living with Type 2 Diabetes.
- **Core Capabilities:**
  - Simplified, empathetic health language with zero confusing jargon.
  - Fast, point-of-care blood sugar logging with context tags (Fasting, Post-Meal, Bedtime).
  - Prescribed medicine schedule with daily dose tracking and adherence reminders.
  - Daily doctor-assigned care tasks with easy check-off.
  - Doctor consultation booking with intake wizard.
  - Damu AI educational voice and text companion with informed consent disclaimers.
  - Emergency SOS with 112 calling and instant caregiver alert dispatch.

### 3. Caregiver Mobile App (`apps/mobile` - Caregiver Workspace)
- **Technology:** React Native (Expo SDK 51), Expo Router, TypeScript.
- **Target Audience:** Family members, adult children, and designated health companions.
- **Core Capabilities:**
  - Consent-based patient linking with cryptographic authorization checks.
  - Multi-patient switching for family caregivers supporting multiple elderly relatives.
  - Real-time monitoring of delegated care tasks (e.g. pillbox refills, walking companion).
  - Task completion on behalf of the patient with role attribution.
  - Read-only viewing of authorized health metrics (glucose, medicines, appointments).
  - Immediate notification dispatch for missed tasks or acute hypoglycemia alerts.

---

## 3. Subsystem Architecture

### 1. HL7 FHIR R4 Interoperability Subsystem (`services/api/src/fhir`)
- Strictly conforms to HL7 FHIR Release 4 version 4.0.1.
- Implements resources: `Patient`, `Practitioner`, `RelatedPerson`, `Observation`, `Condition`, `CarePlan`, `Goal`, `Task`, `MedicationRequest`, `MedicationStatement`, `Encounter`, `DiagnosticReport`, `DocumentReference`, `Consent`, `Communication`, `AuditEvent`.
- Serves endpoints under `/api/fhir/r4` including CapabilityStatement (`/metadata`) and complete patient export (`/Patient/:id/$everything`).
- Validates resources against official schemas, emitting `OperationOutcome` on errors.

### 2. Terminology & Coding Subsystem (`packages/contracts`)
- **LOINC:** Verified codes for fasting glucose (`14771-0`, `1558-6`), 2h post-meal (`88365-2`), HbA1c (`4548-4`), blood pressure panel (`85354-9`), body weight (`29463-7`), heart rate (`8867-4`).
- **UCUM:** Standardized units (`mg/dL`, `%`, `mm[Hg]`, `kg`, `/min`).
- **Multi-Audience Language Layer:** Centralized dictionary translating complex concepts into plain English for patients and caregivers while preserving clinical terminology for clinicians.

### 3. Clinical Safety & Governance Subsystem (`services/api/src/safety`)
- Pure deterministic safety rules implementing ADA 2026 Standards of Care.
- Real-time detection of Level 1 (54-69 mg/dL) and Level 2/3 (<54 mg/dL) hypoglycemia with immediate Rule-of-15 guidance.
- Emergency precedence triggering instant SOS escalation and suspending automated workflows.

### 4. AI Safety & Human-in-the-Loop Gateway (`services/api/src/ai/safety`)
- Hard guardrails prohibiting autonomous prescribing, dosage alterations, and unreviewed clinical diagnoses.
- Proposals routed to `PENDING_CLINICIAN_APPROVAL` requiring physician review and signature.
- Anti-tampering binding tying approvals to specific plan versions, action IDs, and clinician credentials.

---

## 4. Data Flow & Cross-Application Synchronization

```
1. DOCTOR CREATES CARE PLAN
   Doctor WebApp ──(POST /api/care-plans)──► Core API ──► PostgreSQL
                                                │
                                    (WebSocket / Poll)
                                                ▼
2. PATIENT SEES NEW TASKS ◄──────────────── Patient Mobile App
   Patient logs morning glucose (118 mg/dL)
   Patient marks Metformin taken
                                                │
                                    (POST /api/observations)
                                                ▼
3. CAREGIVER RECEIVES UPDATE ◄───────────── Core API ──► Caregiver Mobile App
   Caregiver views task completion & normal sugar reading
                                                │
                                    (GET /api/caregivers/dashboard)
                                                ▼
4. DOCTOR SEES REAL-TIME ADHERENCE ◄─────── Doctor WebApp Command Center
```

---

## 5. Security & Privacy Baseline

- **Zero Real Patient Data:** 100% synthetic demonstration data (`isSyntheticDemo: true`).
- **Cryptographic Authentication:** Short-lived JWTs (15 min) with rotating refresh tokens and server-side revocation.
- **Server-Side Consent Enforcement:** Backend evaluation of caregiver permissions on every protected endpoint.
- **Audit Trails:** Immutable logging of all clinical mutations and data access events.
