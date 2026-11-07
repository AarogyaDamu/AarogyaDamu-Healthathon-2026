# AarogyaDamu Project 3 — Product Transformation Architecture & Code Audit

**Document ID:** `docs/phases/P0_8_product_transformation_audit.md`  
**Phase:** Phase 0 — Complete Architecture Audit  
**Status:** COMPLETE (Planning & Audit Only — Zero Code Modification)  
**Date:** November 4, 2026  
**Auditor:** Senior Software Architect, Healthcare Product Engineer & Security Auditor  
**Authoritative Workspace:** `c:\Users\prana\Desktop\aarogyadamu-project3`  
**Test Suite Baseline:** 538/538 Tests Passing across all workspaces (API, Web, Mobile, Contracts)

---

## 1. Executive Summary & Audit Mandate

AarogyaDamu Project 3 is a comprehensive, clinically governed diabetes care platform comprising a React Native / Expo mobile application for patients and caregivers, a React / Vite web workstation for endocrinologists and clinicians, and a shared Express / Prisma backend API.

Following the successful completion of **Phase -1 (Repository Cleanup & Stabilization)**—which verified the integrity of all 538 automated tests, eliminated redundant archives, and established a reproducible monorepo build and typecheck pipeline—this document establishes the authoritative architectural baseline and implementation blueprint for **Phases 1 through 9**.

### 1.1 Non-Negotiable Architectural Principles
1. **Clinical Source of Truth:** The SQLite / Prisma database is the sole authoritative source of truth. Client-side ephemeral mock stores (`clinicalStore` with `isDemoMode = true`) must be completely retired in favor of authenticated REST queries.
2. **Strict Clinical Role Separation:**
   - **PATIENT (Mobile App):** Views their personal health record, logs self-monitored blood glucose, views doctor-prescribed medications, marks scheduled doses as taken/skipped, views doctor-assigned care plans and tasks, books appointments with comprehensive clinical assessments, and interacts with the Damu AI companion. **Patients cannot independently prescribe, pause, or alter medications, nor create clinical instructions.**
   - **DOCTOR (Web Workstation):** Manages patient panels, reviews longitudinal glucose and lab data, reviews appointment requests and incoming clinical assessments, prescribes medications with full pharmacological details, assigns clinical care tasks, uses NEO Ambient Scribe with speaker diarization, approves structured consultation SOAP notes, and reviews Damu clinical proposals.
   - **CAREGIVER (Dedicated Mobile Experience):** Operates within an isolated, simplified workspace constrained strictly to the permissions explicitly delegated by the patient. Caregivers cannot access clinician workflows or unauthorized patient modules.
3. **Backend-Enforced Authorization (Defense in Depth):** Role boundaries, active doctor-patient assignments, and active caregiver consents must be validated on every protected API endpoint via `resolvePatientContext`. Hiding UI buttons is considered insufficient.
4. **Preservation of Existing Working Systems:** All existing robust features—including the 24 Prisma database models, the NEO Scribe pipeline, the governed AI agent runtime, and the 538 passing tests—must be preserved, extended, and stabilized rather than rewritten.

---

## 2. Current Monorepo Architecture Audit

The repository is structured as an npm workspaces monorepo:

```
aarogyadamu-project3/
├── apps/
│   ├── mobile/             # React Native (0.79.6) + Expo SDK 53 + Expo Router v5
│   └── web/                # React 18.3.1 + Vite 8 + Tailwind CSS + Lucide
├── packages/
│   └── contracts/          # Shared Zod validation schemas & TypeScript contracts
├── services/
│   └── api/                # Express 4.19 + Prisma 5.14 + SQLite + JWT
├── docs/                   # Clinical, security, phase, and audit documentation
└── package.json            # Root workspace orchestrator (typecheck, test, dev scripts)
```

### 2.1 Workspace Inspection Details

| Workspace | Technology Stack | Key Modules | Current Status |
| :--- | :--- | :--- | :--- |
| `packages/contracts` | TypeScript, Zod 4.6.7 | Auth, Observation, Medication, Task, Scribe, Agent, Emergency schemas | Complete, 2/2 Vitest tests pass |
| `services/api` | Express 4.19, Prisma 5.14, SQLite | 20 Route modules, Auth sessions, Evaluator, Scribe service, Rate limiters | Complete, 483/483 Jest tests pass |
| `apps/web` | React 18, Vite 8, Tailwind | `DoctorDashboard.tsx` (4,858 LOC), Scribe, Agent proposals review | Complete, 29/29 Node tests pass |
| `apps/mobile` | Expo 53, React Native, Expo Router | Tabs (`_layout.tsx`), Caregiver screens, Audio recorder, Coordination UI | Complete, 24/24 Node tests pass |

---

## 3. What Works and Must Be Preserved

The audit identified extensive, high-quality production code that must be preserved and reused:

### 3.1 Backend Architecture (`services/api`)
1. **Identity & Session Security (`src/middleware/auth.ts`, `src/routes/auth.routes.ts`):**
   - Cryptographically hashed passwords with `bcryptjs`.
   - Stateful `AuthSession` and rotating `RefreshToken` with database invalidation.
   - Rate-limited login and registration endpoints.
2. **Context Resolution & Permission Evaluator (`src/permissions/evaluator.ts`):**
   - `resolvePatientContext()` accurately evaluates whether the authenticated caller is the patient, an assigned clinician via `DoctorPatientAssignment`, or an authorized caregiver via active `CaregiverConsent`.
   - Prevents BOLA/IDOR when properly called by all route handlers.
3. **NEO Ambient Scribe Pipeline (`src/routes/scribe.routes.ts`, `src/services/scribeService.ts`):**
   - Zero-retention in-memory audio processing (buffers cleared immediately after transcription).
   - Multi-speaker diarization (Clinician vs Patient).
   - Structured SOAP note generation (Subjective, Objective, Assessment, Plan).
   - Two-phase clinician review and approval lifecycle.
4. **Governed Agent Runtime (`src/ai/agent/`, `src/routes/agent.routes.ts`):**
   - 6 allowlisted tools (`query_health_observations`, `get_care_plan_status`, `propose_care_task`, `propose_appointment_request`, `summarize_doctor_review`, `lookup_educational_guidance`).
   - Strict risk tiering (`LOW_RISK`, `MEDIUM_RISK`, `HIGH_RISK`, `PROHIBITED`).
   - Human-in-the-loop approval mechanism for clinical proposals.
5. **Audit Logging & Idempotency (`src/audit/`, Prisma models):**
   - `AuditLog`, `ClinicalAuditLog`, and `SecurityAuditEvent` record all sensitive mutations.
   - Idempotency keys prevent duplicate observation and task submissions.

### 3.2 Doctor Workstation (`apps/web`)
1. **Clinical Roster & Triage:**
   - Patient panel with risk tiering (`CRITICAL_ATTENTION`, `ELEVATED_RISK`, `STABLE_IN_TARGET`).
   - Fast filtering, search by patient name, and sorting by next visit or risk level.
2. **Patient Review Drawer (`DoctorDashboard.tsx`):**
   - Multi-tab inspection: Overview, Journal, Medications, Lifestyle Twin, Safety SOS, Scribe, Chat, Feed, and AI Proposals.
3. **Scribe & Note Approval Console:**
   - Full audio recording console with patient consent toggle, transcription progress indicator, structured SOAP note editor, and final clinical approval.

---

## 4. Current Architectural Gaps & Flaws

The audit identified critical discrepancies between the current implementation and the transformation requirements:

```
┌───────────────────────────────────────────────────────────────────────────┐
│                      CRITICAL GAPS IDENTIFIED                             │
├───────────────────────────────────────────────────────────────────────────┤
│ 1. Mobile "Split-Brain" State: Legacy ephemeral `clinicalStore` vs REST  │
│ 2. Medication Role Leak: Patient app contains "Add/Pause Medicine" modals │
│ 3. Scribe Role Leak: Mobile app has fake recording & Doctor Mode toggle  │
│ 4. AI Companion Limitations: `askDamuService.ts` uses regex/substrings    │
│ 5. Three.js Character Scene: DOM-dependent script crashes React Native    │
│ 6. Appointment Assessment Gap: No 18-question Apollo assessment form      │
│ 7. Doctor Appointment View: Web dashboard lacks dedicated management tab │
│ 8. Mobile Navigation Inconsistency: Tab bar does not match 5-tab target  │
└───────────────────────────────────────────────────────────────────────────┘
```

### 4.1 Gap 1: Mobile "Split-Brain" Client State
- **Root Cause:** In `apps/mobile/src/api/client.ts`, `clinicalStore` was created as an offline prototype with `isDemoMode = true`. Its method `syncWithBackend()` explicitly returns `false` with the error `"Backend synchronization has not been implemented"`.
- **Impact:** Several mobile components (e.g., `journey.tsx`, `health.tsx`) still read from `clinicalStore.observations` or `clinicalStore.tasks` instead of querying the backend API directly, causing data to desynchronize when real API requests are made.
- **Remediation:** Refactor all mobile screens to bind directly to authenticated REST endpoints (`observationsApi`, `medicationsApi`, `journeyApi`, `coordinationApi`). Retire ephemeral demo storage for core medical records.

### 4.2 Gap 2: Medication Prescribing Role Leak
- **Root Cause:** In `apps/mobile/app/(tabs)/medications.tsx`, lines 42-120 provide an `isAddModalOpen` modal allowing the patient to enter medicine name, dosage, frequency, and instructions, and an `isPauseModalOpen` modal allowing the patient to pause active medications. Furthermore, backend `POST /api/medications` permits `source = 'PATIENT_ENTERED'`.
- **Clinical Violation:** In clinical diabetes management, patients do not self-prescribe or alter prescription regimens. Prescriptions must be initiated or modified by an authorized clinician. Patients only record adherence (taken/skipped/notes).
- **Remediation:**
  1. Remove "Add Medicine" and "Pause Medication" buttons and modals from `apps/mobile/app/(tabs)/medications.tsx`.
  2. Enforce clinician-only authorization on backend medication creation (`requireClinician` or clinician role check).
  3. Add a Medication Prescribing Modal to the Doctor Web Workstation (`DoctorDashboard.tsx`).

### 4.3 Gap 3: Scribe Role Leak & Simulation in Mobile App
- **Root Cause:** In `apps/mobile/app/(tabs)/consultation.tsx`, lines 31-90 include a simulated audio recording flow (`setScribeState('RECORDING')`, 3-second `setTimeout`) and a "Doctor Mode" switch that renders doctor-facing consultation notes inside the patient mobile application.
- **Clinical Violation:** Real clinical documentation belongs exclusively on the clinician workstation. Patients should never be shown a simulated recording tool or doctor interface. Patients should only view finalized, doctor-approved consultation summaries.
- **Remediation:**
  1. Remove the recording simulation, audio buttons, and Doctor Mode toggle from `apps/mobile/app/(tabs)/consultation.tsx`.
  2. Convert the mobile consultation view into a clean, read-only consultation summary history that fetches approved notes from `GET /api/scribe/patient-summaries`.

### 4.4 Gap 4: Damu AI Companion Grounded RAG Limitations
- **Root Cause:** In `services/api/src/services/askDamuService.ts`, patient questions are routed through rudimentary keyword matching (`if (lower.includes('doctor review'))`, `if (lower.includes('blood sugar'))`). It lacks a genuine grounded retrieval pipeline.
- **Impact:** Damu cannot accurately answer cross-sectional queries (e.g., "What was my fasting sugar after starting Metformin last month?" or "What did Dr. Rao advise regarding my foot tingling?").
- **Remediation:** Build a true grounded RAG pipeline:
  1. Question parser identifying target entities and date windows.
  2. Patient-isolated retrieval across `HealthObservation`, `MedicationSchedule`, `CareTask`, `CarePlan`, `ConsultationNote`, `HealthDocument`, and `LifestyleRecord`.
  3. Grounded context synthesizer with confidence scoring.
  4. Explicit citation indicators linking responses directly to verified database records.

### 4.5 Gap 5: 3D Character Scene React Native Incompatibility
- **Root Cause:** The procedural Three.js character scene located at `C:\Users\prana\Desktop\damuSceneV2.js` uses standard browser DOM APIs:
  - `window.devicePixelRatio`
  - `document.createElement('canvas')`
  - `host.appendChild(renderer.domElement)`
  - `ResizeObserver` and `IntersectionObserver`
  - HTML pointer and visibility event listeners
- **Impact:** Attempting to import this script directly into React Native Expo will cause a fatal runtime crash because React Native does not implement the browser DOM.
- **Remediation Strategy:**
  - **Web (`apps/web`):** Direct DOM integration inside a dedicated container element.
  - **Mobile (`apps/mobile`):** Implement a hybrid adapter using `react-native-webview`. The WebView hosts an isolated, high-performance HTML/WebGL container running `damuSceneV2.js` at 60fps with zero DOM bridge friction, using postMessage for animated state switching (`IDLE`, `TALKING`, `THINKING`, `HAPPY`, `CELEBRATING`, `wave()`). This eliminates `expo-gl` shader incompatibilities and provides identical rendering across iOS, Android, and Web.

### 4.6 Gap 6: Missing 18-Question Apollo Assessment Form
- **Root Cause:** `AppointmentCenter.tsx` on mobile and `coordination.routes.ts` on backend only capture a free-text `reason` string and `visitType`. The 18 comprehensive diabetes questions from Apollo Sugar Clinics are completely absent.
- **Remediation:**
  1. Create the `AppointmentAssessment` database model linked to `Appointment`.
  2. Implement a 4-step wizard in mobile appointment booking capturing all 18 clinical questions.
  3. Display the completed assessment in the doctor workstation when reviewing appointment requests.

### 4.7 Gap 7: Missing Doctor Appointment Management View
- **Root Cause:** In `DoctorDashboard.tsx`, appointments appear only as a summary count in the dashboard header and a "Next Visit" date in the patient overview drawer. There is no appointment management console where doctors can review pending requests, inspect the 18 Apollo assessment responses, or confirm/reschedule/cancel appointments.
- **Remediation:** Add a dedicated "Appointments" tab / view to `DoctorDashboard.tsx`.

### 4.8 Gap 8: Mobile Tab Navigation Layout
- **Root Cause:** `apps/mobile/app/(tabs)/_layout.tsx` currently displays 5 tabs: `Home`, `Sugar Checks`, `My Journey`, `Damu`, and `Care Team`, while `profile`, `tasks`, `consultation`, `medications`, `lifestyle`, and `sos` are hidden (`href: null`).
- **Target Specification:** The master instructions require:
  1. `Home`
  2. `Health Vault` (replaces standalone `Sugar Checks`; combines glucose logbook, HbA1c trends, lab reports, and vitals)
  3. `My Journey` (timeline, adherence streak, TIR metrics, achievements)
  4. `Damu` (3D character companion & grounded RAG)
  5. `Profile` (patient profile, caregiver access management, emergency contacts, preferences)
  *Note:* "Book an Appointment" moves to a prominent action card on `Home` and inside `Health Vault`, keeping the bottom bar uncluttered.

---

## 5. Missing Backend Capabilities Required by the Transformation

To satisfy the transformation requirements, the backend requires five specific feature additions:

### 5.1 Apollo Assessment Storage & Endpoints
- **Model:** `AppointmentAssessment` (1-to-1 with `Appointment`).
- **Endpoints:**
  - `POST /api/coordination/appointments` (updated to accept nested `assessment` data or separate submission).
  - `GET /api/coordination/appointments/:id/assessment` (retrieves full 18-question responses; restricted to assigned doctor or patient).

### 5.2 Clinician-Only Prescription Endpoint
- **Endpoint:** `POST /api/medications/prescribe`
- **Authorization:** `requireAuth` + `requireClinician` + active `DoctorPatientAssignment`.
- **Payload:** Brand name, generic name, strength, dosage form, frequency, route, duration days, food instructions, refill count, clinical reasoning.
- **Behavior:** Creates `MedicationSchedule` with `source = 'CLINICIAN_PRESCRIBED'` and `reviewStatus = 'CLINICIAN_REVIEWED'`. Automatically creates an initial audit log and corresponding care plan reminder.

### 5.3 Read-Only Patient Consultation Summaries
- **Endpoint:** `GET /api/scribe/patient-summaries`
- **Authorization:** `requireAuth` (patient context).
- **Behavior:** Queries `ConsultationNote` where `userId = effectivePatientId` and `status = 'APPROVED'`. Returns clinician name, consultation date, chief complaints, assessment, clinical plan, and prescribed lifestyle modifications. Excludes raw transcripts or internal clinician notes.

### 5.4 Grounded RAG Retrieval Engine (`damuRagService.ts`)
- **Endpoint:** `POST /api/damu/rag-query`
- **Architecture:**
  ```
  User Query ─────────► Query Intent & Entity Parser
                              │
             ┌────────────────┴────────────────┐
             ▼                                 ▼
      Temporal Filter                  Domain Filter
   (Last 7d/30d/90d/All)        (Glucose, Meds, Notes, Labs)
             │                                 │
             └────────────────┬────────────────┘
                              ▼
                Isolated SQL Query Execution
                   (WHERE userId = patientId)
                              │
                              ▼
                Context Assembly & Citation Map
                              │
                              ▼
                Synthesis & Clinical Guardrails
                              │
                              ▼
                Response with Verified Citations
  ```
- **Guarantees:**
  - Strict tenant isolation: every query scopes explicitly to `userId = effectivePatientId`.
  - Zero hallucination: claims must cite specific observation IDs, medication IDs, or consultation note IDs.
  - Clinical safety guardrail: refusal to prescribe, diagnose, or modify treatment dosages.

### 5.5 Granular Caregiver Authorization & Dashboard Feed
- **Endpoint:** `GET /api/caregivers/dependent-summary`
- **Authorization:** `requireAuth` + unexpired `CaregiverConsent`.
- **Behavior:** Returns high-level patient status filtered strictly by granted permissions:
  - If `VIEW_OBSERVATIONS`: latest glucose, 7-day average.
  - If `VIEW_MEDICATIONS`: today's medication schedule and adherence status.
  - If `VIEW_APPOINTMENTS`: next scheduled doctor visit.
  - If `LOG_ON_BEHALF`: enables quick observation logging with `sourceProvenance = 'CAREGIVER_INPUT'`.

---

## 6. Role and Permissions Matrix

The table below defines the authoritative authorization boundary across the three distinct application roles:

| Domain / Operation | Patient (Mobile) | Doctor (Web) | Caregiver (Mobile) |
| :--- | :---: | :---: | :---: |
| **Personal Health Overview** | View Own | View Assigned Patients | View Permitted Only |
| **Blood Glucose Logbook** | Read & Write (Self) | Read & Review (Assigned) | Read (if VIEW_OBSERVATIONS), Log (if LOG_ON_BEHALF) |
| **Prescribe Medications** | **DENIED** | **AUTHORIZED** | **DENIED** |
| **Log Medication Dose (Taken/Skipped)** | Log Own | Clinical Override | Log (if LOG_ON_BEHALF) |
| **Pause / Discontinue Medication** | **DENIED** | **AUTHORIZED** | **DENIED** |
| **Assign Clinical Care Tasks** | **DENIED** | **AUTHORIZED** | **DENIED** |
| **Complete Assigned Care Tasks** | Complete Own | Review & Complete | Complete (if permitted) |
| **Book Appointment** | Book & Complete Assessment | **DENIED** (Reviews & Confirms) | Book (if permitted) |
| **Review Apollo Assessment** | View Own Submitted | Review & Annotate | **DENIED** |
| **Confirm / Reschedule Appointment**| Request Reschedule | Confirm / Reschedule / Cancel | **DENIED** |
| **Ambient Scribe Recording** | **DENIED** | **AUTHORIZED** | **DENIED** |
| **Approve Consultation Notes** | **DENIED** | **AUTHORIZED** | **DENIED** |
| **View Approved Consultation Summary**| View Own Approved | View & Author | View (if permitted) |
| **Ask Damu (Grounded RAG)** | Full Patient Companion | Review Damu Proposals | Read-Only Caregiver Summary |
| **Manage Caregiver Delegations** | Grant / Revoke / Edit | **DENIED** | **DENIED** |
| **Trigger Emergency SOS** | Trigger Own SOS | Receive Alert (if assigned) | Trigger / Alert Dependent |

---

## 7. Database Changes Required (Models, Relations, Migrations)

To support the product transformation without disrupting existing production data, the following schema additions will be implemented via an incremental Prisma migration:

### 7.1 New Model: `AppointmentAssessment`
Stores the complete 18-question diabetes assessment from Apollo Sugar Clinics:

```prisma
model AppointmentAssessment {
  id                      String      @id @default(uuid())
  appointmentId           String      @unique
  patientId               String
  
  // 1-4: Diabetes Baseline & Current Regimen
  diagnosisDurationYears  Float?
  diabetesType            String      // TYPE_1, TYPE_2, GESTATIONAL, OTHER
  treatmentRegimen        String      // ORAL_ONLY, INSULIN_ONLY, BOTH, LIFESTYLE_ONLY
  dailyInsulinDosage      String?     // e.g. "32 units Lantus, 8 units Novorapid"
  
  // 5-8: Glycemic Control & Symptoms
  recentHba1cValue        Float?
  recentHba1cDate         DateTime?
  monitoringFrequency     String      // DAILY, MULTIPLE_DAILY, WEEKLY, OCCASIONAL
  hypoglycemiaEpisodes    String      // NONE, MILD_MONTHLY, FREQUENT_WEEKLY, SEVERE
  symptomsReported        String?     // JSON serialized array of reported symptoms
  
  // 9-13: Comorbidities & Organ Screening
  systolicBloodPressure   Int?
  diastolicBloodPressure  Int?
  cardiovascularHistory   String?     // HYPERTENSION, CAD, DYSLIPIDEMIA, STROKE, NONE
  kidneyDiseaseHistory    String?     // NORMAL, MICROALBUMINURIA, CKD, UNKNOWN
  eyeCheckupDate          DateTime?
  eyeCheckupStatus        String?     // NORMAL, RETINOPATHY_SUSPECTED, NEVER_CHECKED
  footSymptoms            String?     // NUMBNESS, TINGLING, ULCER, NORMAL
  
  // 14-17: Lifestyle & Behavioral
  dietaryPattern          String      // VEGETARIAN, NON_VEGETARIAN, VEGAN
  carbohydrateControl     String?     // STRICT, MODERATE, POOR
  exerciseFrequency       String      // SEDENTARY, 1_2_DAYS, 3_5_DAYS, DAILY
  tobaccoUse              String      // NEVER, FORMER, CURRENT
  alcoholIntake           String      // NONE, OCCASIONAL, REGULAR
  
  // 18: Primary Consultation Goal
  primaryConcern          String      // Detailed patient concern or visit objective
  
  // Metadata & Audit
  completedAt             DateTime    @default(now())
  createdAt               DateTime    @default(now())
  updatedAt               DateTime    @updatedAt

  appointment             Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)
  patient                 User        @relation(fields: [patientId], references: [id], onDelete: Cascade)

  @@index([patientId])
  @@index([appointmentId])
}
```

### 7.2 Enhancements to `MedicationSchedule`
Add explicit clinical prescribing fields to `MedicationSchedule`:
- `brandName` (`String?`)
- `genericName` (`String?`)
- `foodInstructions` (`String?`, e.g., "Take before breakfast")
- `refillCount` (`Int @default(0)`)
- `prescribedDurationDays` (`Int?`)

### 7.3 Migration Execution Plan
- Command: `npx prisma migrate dev --name p0_8_product_transformation_schema`
- Safety Check: Purely additive (no table drops, no column drops, zero risk to existing records).

---

## 8. Frontend Screen Changes Required

### 8.1 Mobile App Screen Architecture (`apps/mobile`)

```
apps/mobile/app/
├── (tabs)/
│   ├── _layout.tsx         # [MODIFY] 5 Visible Tabs: Home, Health Vault, My Journey, Damu, Profile
│   ├── index.tsx           # [MODIFY] Home: Header, Glucose Card, Next Action, Quick Bar, Plan Ring, Note Snippet, Book CTA
│   ├── health.tsx          # [REWORK] Health Vault:
│   │                       #   1. Record Sugar (Blood sugar logbook, stats, log entry modal)
│   │                       #   2. Med Vault (Doctor-prescribed only, schedule, log dose adherence)
│   │                       #   3. Lifestyle (Physical activity, nutrition, sleep, hydration)
│   │                       #   4. Medical Reports (Lab PDFs & reports list, upload, status)
│   │                       #   5. Health Timeline (Chronological unified health event stream)
│   ├── journey.tsx         # [REWORK] My Journey: Timeline, Adherence Streak, TIR Metrics, Milestones
│   ├── damu.tsx            # [REWORK] Damu: 3D Character Scene (WebView Adapter + Fallback), Rich Chat, Grounded Citations
│   └── profile.tsx         # [REWORK] Profile:
│                           #   1. Personal information (Name, DOB, email, phone, language)
│                           #   2. Health profile (Type, diagnosis year, target ranges, allergies)
│                           #   3. Caregiver Access Manager (View, invite with granular scopes, revoke)
│                           #   4. Privacy and security settings (Session, password, audit history)
│                           #   5. Notification preferences (Push, SMS, email, reminder types)
│                           #   6. Logout (Authenticated session destruction & token clearing)
│                           #   7. Delete Account (Double confirmation, deactivation, legal clinical retention)
├── (caregiver)/
│   ├── _layout.tsx         # [MODIFY] Dedicated Caregiver Stack
│   ├── dashboard.tsx       # [NEW] Simplified Dependent Status, Adherence, Log Glucose (if permitted)
│   └── dependents.tsx      # [PRESERVE] Dependent Selection
├── appointments.tsx        # [REWORK] Multi-Step Booking Wizard + 18-Question Apollo Assessment Form
├── medications.tsx         # [MODIFY] Read-Only Prescriptions + Dose Logging (Remove Add/Pause Modals)
└── consultation.tsx        # [MODIFY] Read-Only Approved Consultation Summary History (Remove Fake Scribe)
```

### 8.2 Web Doctor Workstation Architecture (`apps/web`)

```
apps/web/src/
├── pages/
│   └── DoctorDashboard.tsx # [MODIFY] Add Appointments Console & Medication Prescribing Modal
├── components/
│   ├── PrescriptionModal.tsx  # [NEW] Clinical Prescribing Modal (Brand, Generic, Dose, Form, Schedule, Refills)
│   ├── AppointmentReview.tsx  # [NEW] Appointment Requests & 18-Question Apollo Assessment Viewer
│   └── DamuCharacterWeb.tsx   # [NEW] Mount procedural Three.js character directly in Web DOM
```

---

## 9. Security & Vulnerability Analysis

A comprehensive security scan was performed across all routes and authorization logic:

### 9.1 BOLA / IDOR Protection
- **Status:** Evaluated.
- **Finding:** While `resolvePatientContext()` correctly verifies `DoctorPatientAssignment` and `CaregiverConsent`, certain newer routes (e.g., `tasks.routes.ts` line 37) allowed unprivileged users to create clinical tasks because the check defaulted `effectivePatientId = authenticatedUserId`.
- **Remediation:** Enforce role guards:
  - Clinical tasks and prescriptions require `requireClinician`.
  - Non-clinicians can only create personal `Reminder` items or log medication adherence events.

### 9.2 Caregiver Scope Leakage
- **Status:** Evaluated.
- **Finding:** If a patient revokes a caregiver's consent, any cached mobile tokens or sessions must not grant continued access.
- **Remediation:** `resolvePatientContext()` already queries the database live on every request for `status = 'ACTIVE'` and `expiresAt > NOW()`, guaranteeing immediate revocation. We will ensure caregiver endpoints explicitly verify granular permissions (`VIEW_OBSERVATIONS`, `VIEW_MEDICATIONS`, `VIEW_APPOINTMENTS`, `RECEIVE_ALERTS`, `LOG_ON_BEHALF`).

### 9.3 Medical Scribe Privacy & Audio Retention
- **Status:** Verified.
- **Finding:** Scribe routes enforce zero audio retention: raw audio buffers are purged from memory immediately upon completion of transcription, and no audio files are written to disk.

---

## 10. Missing Dependencies & Installation Strategy

To ensure zero regressions and maintain lockfile stability, package installations are minimized and targeted:

| Target Workspace | Package to Add | Purpose | Installation Command |
| :--- | :--- | :--- | :--- |
| `apps/web` | `three`, `@types/three` | Native DOM rendering of Damu 3D character | `npm --workspace=apps/web install three @types/three` |
| `apps/mobile` | `react-native-webview` | Sandboxed 60fps Three.js character scene execution | `npm --workspace=apps/mobile install react-native-webview` |

*Note on Mobile Three.js:* `react-native-webview` runs the verified `damuSceneV2.js` bundle in a lightweight, hardware-accelerated local WebGL container. In Phase 4, performance will be benchmarked on physical iOS and Android hardware (target: smooth responsive rendering). A graceful 2D/SVG animated character fallback will be preserved to guarantee complete functionality if WebGL fails or stutters on low-end devices.

---

## 11. Recommended Implementation Sequence (Phases 1 through 9)

```
Phase 0: Architecture Audit (COMPLETE)
   │
   ▼
Phase 1: Patient Navigation, Health Vault & Profile
   │       • 5 Primary Tabs: Home, Health Vault, My Journey, Damu, Profile
   │       • Home Screen: Header, Glucose Hero, Next Dose/Action, Quick Bar, Plan Ring, Doctor Note, Book CTA
   │       • Health Vault (5 Modules):
   │           1. Record Sugar (Logbook, ranges, entry modal via REST)
   │           2. Med Vault (Doctor-prescribed only, schedule, log dose adherence)
   │           3. Lifestyle (Activity, nutrition, sleep, hydration via REST)
   │           4. Medical Reports (Lab PDFs, upload, metadata via REST)
   │           5. Health Timeline (Unified chronological event feed)
   │       • Profile (7 Modules):
   │           1. Personal Information (Name, DOB, email, phone, language)
   │           2. Health Profile (Type, diagnosis year, target ranges, allergies)
   │           3. Caregiver Access Manager (View, invite with granular permissions, revoke)
   │           4. Privacy & Security Settings (Sessions, password, audit logs)
   │           5. Notification Preferences (Push, SMS, email, reminders)
   │           6. Logout (Session destruction, token clearance)
   │           7. Delete Account (Double-confirmation modal, deactivation, legal clinical retention)
   │       • State Hygiene: Eliminate clinicalStore for these migrated workflows
   │       • Security: Strict auth, patient isolation, and input validation on every endpoint
   │
   ▼
Phase 2: Clinical Boundaries & Medication Prescribing Separation
   │       • Remove Add/Pause Modals from Mobile
   │       • Doctor Prescribing Modal in Web Workstation (Brand, Generic, Dose, Frequency, Route, Duration, Refills, Reason)
   │       • Backend Prescribing Authorization Guard (requireClinician)
   │
   ▼
Subphase 2.5: Doctor-Managed Tasks and Reminders (Care Coordination)
   │       • Doctor: Selects assigned patient, creates clinical tasks/instructions, creates reminders, monitors completion
   │       • Patient: Views doctor-assigned tasks, instructions, due dates; marks tasks completed; CANNOT create/edit clinical tasks
   │       • Doctor Dashboard: Displays completed, pending, overdue, and unconfirmed tasks; identifies who completed each task with timestamp
   │       • Caregiver: Completes authorized activities on behalf of patient; records caregiver identity attribution
   │
   ▼
Phase 3: Dedicated Caregiver Experience
   │       • Simplified Mobile Caregiver Dashboard (Patient overview, adherence, alert feed)
   │       • Granular Permission Enforcement (VIEW_OBSERVATIONS, VIEW_MEDICATIONS, VIEW_APPOINTMENTS, LOG_ON_BEHALF)
   │
   ▼
Phase 4: Damu AI Companion, 3D Character & Grounded RAG
   │       • Procedural 3D Character (Web DOM & Mobile WebView with Graceful SVG Fallback)
   │       • Hardware Performance Benchmarking on iOS & Android
   │       • Grounded RAG Engine with Source Citations
   │       • Rich Chat Interface with Suggestions & Voice
   │
   ▼
Phase 5: Consultation Scribe Separation & Summary History
   │       • Remove Simulated Scribe from Mobile
   │       • Scribe restricted to Web Doctor Workstation
   │       • Read-Only Approved Consultation Summaries on Mobile
   │
   ▼
Phase 6: Appointment Booking with 18-Question Apollo Form
   │       • 4-Step Booking Wizard on Mobile
   │       • AppointmentAssessment Model & Migration
   │       • Doctor Appointment & Assessment Review on Web
   │
   ▼
Phase 7: Journey, Trends & Gamification
   │       • Unified Health Timeline Feed
   │       • Adherence Streaks, TIR Analytics & Badges
   │
   ▼
Phase 8: Security, Authorization & Clinical Governance
   │       • Comprehensive IDOR/BOLA Hardening
   │       • Granular Consent Auditing & Idempotency
   │
   ▼
Phase 9: Verification, Polish & Production Readiness
           • End-to-End User Flow Tests (Patient, Doctor, Caregiver)
           • UI/UX Visual Polish & Final Monorepo Verification
```

### 11.1 Non-Negotiable Rules Incorporated Across All Phases
1. **Incremental Retirement of `clinicalStore`:** Each phase migrates its screens directly to authenticated backend REST APIs. No new screen or feature may bind to `clinicalStore` or demo data.
2. **Security Built In, Not Deferred:** Every newly created or modified API must enforce authentication, role authorization, ownership, patient isolation, and consent scopes immediately. Phase 8 serves as the final audit and verification layer, not the initial security implementation.
3. **Clinical Role Integrity:** Patients never self-prescribe, pause medications, or create doctor-assigned tasks. Doctors prescribe and govern; patients adhere and track.
4. **Three.js Performance & Fallback Guarantee:** In Phase 4, the mobile WebView character scene will include frame-rate monitoring and an automatic/manual fallback to a sleek animated 2D SVG avatar for low-power devices.

---

## 12. Regression Test Plan

Every phase must maintain complete backward compatibility and 100% passing test runs:

1. **Continuous Baseline Verification:**
   - Run `npm test` after every phase. Ensure all 538 baseline tests pass without regression.
2. **Phase-Specific Test Additions:**
   - **Phase 1:** Tests for Health Vault filtering, aggregation, and PDF export triggers.
   - **Phase 2:** Negative tests verifying patients receive `403 Forbidden` when attempting to POST `/api/medications`. Tests verifying clinician prescribing endpoint.
   - **Phase 3:** Tests verifying caregiver cannot access unauthorized dependent data if permission is omitted from consent.
   - **Phase 4:** Tests verifying Damu RAG engine returns valid citations and strictly respects clinical guardrails.
   - **Phase 5:** Tests verifying patient can only retrieve `APPROVED` consultation summaries.
   - **Phase 6:** Tests for `AppointmentAssessment` creation and doctor retrieval.
3. **Typecheck & Build Gates:**
   - `npm run typecheck` must report 0 TypeScript errors across API, Web, and Mobile.
   - `npm run build` must cleanly generate production bundles for API and Web.

---

## 13. Conclusion & Phase 0 Sign-Off

The architecture of AarogyaDamu Project 3 is robust and well-structured, but requires clean separation of patient and clinician boundaries, replacement of client-side ephemeral stores with live database queries, and implementation of the grounded RAG engine, 3D character adapter, and Apollo clinical assessment workflow.

Phase 0 is concluded with zero application code modifications. The repository is primed for **Phase 1: Patient App Navigation, Health Vault & Profile**.

