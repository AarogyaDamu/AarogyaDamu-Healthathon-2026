# AarogyaDamu Health-a-thon MVP Hardening & Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing AarogyaDamu Diabetes Care Journey Companion MVP secure, accessible, clinically responsible, interoperable with verified HL7 FHIR R4 and LOINC/UCUM mappings, completely free of real patient data, and fully ready for production deployment and GitHub release.

**Architecture:** Monorepo architecture preserving existing structure:
- `services/api`: Express.js + Prisma ORM + PostgreSQL backend with JWT authentication, RBAC, caregiver consent enforcement, clinical audit logging, and new HL7 FHIR R4 v4.0.1 interoperability layer.
- `apps/web`: React 18 + Vite + TailwindCSS + Lucide icons Doctor WebApp for clinical monitoring, care planning, prescribing, and AI note review.
- `apps/mobile`: React Native (Expo SDK 51) companion app providing both Patient and Caregiver experiences with simplified, accessible health language.
- `packages/contracts`: Shared TypeScript clinical contracts, Zod schemas, FHIR types, and LOINC terminology definitions.

**Tech Stack:** Node.js 20, TypeScript 5.3, Express.js, Prisma ORM, PostgreSQL, Vitest / Jest, React 18, Vite, React Native / Expo, Zod, HL7 FHIR R4 (4.0.1), LOINC, UCUM.

**Spec:** Prompt instructions for Health-a-thon 2026 hardening:
1. Simplified, professional language throughout Doctor, Patient, and Caregiver apps.
2. HL7 FHIR R4 v4.0.1 core resources, serialization, bundle endpoints, and validation.
3. Verified LOINC and UCUM codes for glucose, HbA1c, BP, weight, with clinical context.
4. Total sanitization of real patient information, leaving only realistic synthetic demo data.
5. Verification of all existing cross-app workflows without breaking features.
6. Rigorous security, RBAC, caregiver consent, and AI clinical safety guards.
7. Clean public GitHub repository packaging with documentation.
8. WebApp (`app.example.com` placeholder) and Mobile Expo Android production deployment readiness.
9. Comprehensive automated validation testing.
10. Final submission deliverables and evaluator guide.

## Global Constraints

- Never use or retain real patient data, medical records, or live PII. Use synthetic data only.
- Preserve existing monorepo structure and working features; do not rewrite from scratch.
- All HL7 FHIR R4 resources must conform strictly to version 4.0.1 schemas and data types.
- All LOINC codes must be official, verified clinical codes from loinc.org; never fabricate codes.
- All UCUM measurement units must conform to standard unified code notation (`mg/dL`, `%`, `mm[Hg]`, `kg`).
- All caregiver permissions must be enforced server-side via cryptographic/database consent validation.
- AI must never prescribe, diagnose autonomously, or alter clinical medication orders without physician approval.
- Production configurations must use configurable environment variables with zero hardcoded secrets or localhost references.

## Review Focus

1. Patient data leakage via uncleaned upload folders, SQLite backups, or test files.
2. Incomplete or non-compliant FHIR R4 resource payloads failing official HL7 schema validation.
3. Over-complicated medical jargon in Patient/Caregiver mobile views confusing non-clinical users.
4. Caregiver authorization bypass when querying patient observations or updating care tasks.
5. Mobile or web build failures due to missing environment variables or uncompiled dependencies.

---

### Task 1: Total Real Patient Data Sanitization & Database Artifact Cleanup

**Files:**
- Delete: `services/api/uploads/private/*`
- Delete: `services/api/prisma/dev.db`
- Delete: `services/api/prisma/backups/*`
- Modify: `apps/web/src/pages/Health.tsx:164-173`
- Modify: `services/api/prisma/seed.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: Existing database models, upload storage utilities.
- Produces: 100% synthetic, sanitized filesystem and database seed state.

- [ ] **Step 1: Write verification test for synthetic-only data**
  Create `services/api/src/__tests__/synthetic_data_integrity.test.ts` scanning seed files, fixtures, and source code for forbidden real names (e.g., "Vilas", "Kadam") and confirming all demo accounts flag `isSyntheticDemo: true`.

- [ ] **Step 2: Run verification test to confirm it detects existing traces**
  Run: `npm --workspace=services/api run test -- synthetic_data_integrity.test.ts`
  Expected: FAIL until sanitization is complete.

- [ ] **Step 3: Remove all real patient files, SQLite backups, and code references**
  Delete all uploaded private PDFs from `services/api/uploads/private/`. Delete `services/api/prisma/dev.db` and `services/api/prisma/backups/`. Remove hardcoded references from `Health.tsx`. Ensure `.gitignore` ignores `dev.db`, `*.db`, and uploaded private files.

- [ ] **Step 4: Verify seed script generates realistic synthetic data**
  Confirm `services/api/prisma/seed.ts` populates realistic synthetic personas (Ramesh Deshmukh, Meera Joshi, Dr. Rupam Choudhary) and verify synthetic markers.

- [ ] **Step 5: Run test to verify passes**
  Run: `npm --workspace=services/api run test -- synthetic_data_integrity.test.ts`
  Expected: PASS.

---

### Task 2: Centralized Professional & Simple Language Layer

**Files:**
- Create: `packages/contracts/src/terminology.ts`
- Modify: `packages/contracts/src/index.ts`
- Modify: `apps/web/src/pages/DoctorDashboard.tsx`
- Modify: `apps/web/src/pages/Health.tsx`
- Modify: `apps/web/src/pages/CarePlan.tsx`
- Modify: `apps/mobile/app/(tabs)/index.tsx`
- Modify: `apps/mobile/app/(tabs)/health.tsx`
- Modify: `apps/mobile/app/(tabs)/tasks.tsx`
- Modify: `apps/mobile/app/(caregiver)/index.tsx`
- Modify: `apps/mobile/app/(caregiver)/tasks.tsx`

**Interfaces:**
- Consumes: Terminology dictionary mapping clinical codes to friendly plain-language summaries.
- Produces: Standardized user-facing labels, explanations, actionable error messages, and empty states.

- [ ] **Step 1: Write test for terminology dictionary**
  Create `packages/contracts/src/__tests__/terminology.test.ts` checking plain-English translations for medical terms, glucose ranges, and caregiver actions.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm run test` or direct test command.
  Expected: FAIL (file not yet created).

- [ ] **Step 3: Implement centralized terminology & language module**
  Create `packages/contracts/src/terminology.ts` exporting:
  - `PLAIN_LANGUAGE_TERMS`: clear explanations for HbA1c, Fasting Glucose, Post-Meal, Hypoglycemia, Hyperglycemia, etc.
  - `ROLE_LABELS`: unified labels across Doctor, Patient, and Caregiver.
  - `ACTIONABLE_ERRORS`: user-friendly, actionable error messages.
  - Helper functions `explainMedicalTerm(term: string): string` and `getGlucoseContextLabel(context: string): string`.

- [ ] **Step 4: Update Doctor WebApp, Patient App, and Caregiver App UI text**
  Refactor components in WebApp and Mobile to use the centralized terminology, simplifying jargon for patients and caregivers while maintaining clinical accuracy for doctors.

- [ ] **Step 5: Run test to verify passes**
  Run terminology tests and verify clean compilation.

---

### Task 3: Verified LOINC & UCUM Clinical Terminology Module

**Files:**
- Create: `packages/contracts/src/loinc.ts`
- Create: `docs/LOINC-MAPPINGS.md`
- Create: `packages/contracts/src/__tests__/loinc.test.ts`
- Modify: `packages/contracts/src/index.ts`

**Interfaces:**
- Consumes: Measurement types (`BLOOD_GLUCOSE`, `HBA1C`, `BLOOD_PRESSURE`, `WEIGHT`, `HEART_RATE`) and contexts (`FASTING`, `POST_MEAL_2HR`, `BEDTIME`, `RANDOM`).
- Produces: Verified LOINC codes, display names, systems, UCUM units, and reference ranges.

- [ ] **Step 1: Write test for LOINC dictionary & mapping resolver**
  Write tests in `packages/contracts/src/__tests__/loinc.test.ts` verifying:
  - Fasting glucose maps to LOINC `1558-6` or `14771-0` (point-of-care) with UCUM `mg/dL`.
  - 2-hour post-meal glucose maps to LOINC `88365-2` with UCUM `mg/dL`.
  - Random / General glucose maps to LOINC `2339-0` with UCUM `mg/dL`.
  - HbA1c maps to LOINC `4548-4` with UCUM `%`.
  - Systolic BP maps to `8480-6`, Diastolic BP to `8462-4`, BP panel to `85354-9` with UCUM `mm[Hg]`.
  - Body weight maps to `29463-7` with UCUM `kg`.
  - Heart rate maps to `8867-4` with UCUM `/min`.
  - Unmapped concepts fail cleanly without fabricating codes.

- [ ] **Step 2: Run test to verify it fails**
  Run test: Expected to FAIL.

- [ ] **Step 3: Implement `packages/contracts/src/loinc.ts`**
  Implement verified LOINC mapping table, UCUM unit definitions, and resolver function `resolveLoincCoding(observation: HealthObservationInput)`.

- [ ] **Step 4: Create documentation `docs/LOINC-MAPPINGS.md`**
  Document complete table of clinical concepts, LOINC codes, official long names, UCUM units, contexts, and authoritative sources.

- [ ] **Step 5: Run test to verify passes**
  Run: `packages/contracts/src/__tests__/loinc.test.ts`
  Expected: PASS.

---

### Task 4: HL7 FHIR R4 (v4.0.1) Interoperability & Validation Layer

**Files:**
- Create: `services/api/src/fhir/types.ts`
- Create: `services/api/src/fhir/mapper.ts`
- Create: `services/api/src/fhir/validator.ts`
- Create: `services/api/src/fhir/bundle.ts`
- Create: `services/api/src/routes/fhir.routes.ts`
- Modify: `services/api/src/server.ts`
- Create: `services/api/src/__tests__/fhir_r4.test.ts`
- Create: `docs/FHIR-R4.md`

**Interfaces:**
- Consumes: Prisma database models (User, PatientProfile, HealthObservation, CarePlan, CareTask, MedicationSchedule, Appointment, CaregiverConsent, HealthDocument, AuditLog).
- Produces: Strictly conforming HL7 FHIR R4 resources:
  - `Patient`
  - `Practitioner`
  - `RelatedPerson`
  - `Observation`
  - `Condition`
  - `CarePlan`
  - `Goal`
  - `Task`
  - `MedicationRequest`
  - `MedicationStatement`
  - `Encounter`
  - `DiagnosticReport`
  - `DocumentReference`
  - `Consent`
  - `Communication`
  - `Provenance`
  - `AuditEvent`
  - `Bundle` (searchset, transaction, collection)
  - `OperationOutcome`

- [ ] **Step 1: Write automated tests for FHIR R4 resource generation & schema validation**
  Write tests in `services/api/src/__tests__/fhir_r4.test.ts` asserting:
  - Resource type, `id`, `meta`, `identifier` compliance.
  - Observation mappings with LOINC and UCUM valueQuantity.
  - Patient and CarePlan references linking correctly.
  - Bundle `$everything` generation.
  - OperationOutcome generation on invalid query or validation failure.

- [ ] **Step 2: Run test to verify it fails**
  Run: `npm --workspace=services/api run test -- fhir_r4.test.ts`
  Expected: FAIL.

- [ ] **Step 3: Implement FHIR R4 mapper, validator, and bundle serializer**
  Implement comprehensive data transformations from Prisma models to valid FHIR R4 JSON structures. Validate against required fields and data types.

- [ ] **Step 4: Implement FHIR R4 API endpoints**
  Create `services/api/src/routes/fhir.routes.ts` mounted at `/api/fhir/r4`:
  - `GET /api/fhir/r4/metadata`: CapabilityStatement
  - `GET /api/fhir/r4/Patient/:id`: Patient resource
  - `GET /api/fhir/r4/Patient/:id/$everything`: Patient record bundle
  - `GET /api/fhir/r4/Observation`: Search observations by patient, code, date
  - `GET /api/fhir/r4/CarePlan`: Search care plans
  - `GET /api/fhir/r4/Condition`: Search diabetes conditions
  - `GET /api/fhir/r4/MedicationRequest`: Prescriptions
  - `GET /api/fhir/r4/Task`: Care tasks
  - `GET /api/fhir/r4/Consent`: Caregiver consent records
  - `GET /api/fhir/r4/AuditEvent`: Audit events

- [ ] **Step 5: Document mappings in `docs/FHIR-R4.md`**
  Detail each resource mapping, database fields, coding systems, and conformance capabilities.

- [ ] **Step 6: Run test to verify passes**
  Run: `npm --workspace=services/api run test -- fhir_r4.test.ts`
  Expected: PASS.

---

### Task 5: Security, RBAC & Caregiver Consent Hardening

**Files:**
- Modify: `services/api/src/permissions/evaluator.ts`
- Modify: `services/api/src/middleware/auth.ts`
- Modify: `services/api/src/routes/caregivers.routes.ts`
- Modify: `services/api/src/routes/observations.routes.ts`
- Modify: `services/api/src/routes/tasks.routes.ts`
- Create: `services/api/src/__tests__/security_consent_rbac.test.ts`
- Create: `docs/SECURITY-PRIVACY.md`
- Create: `docs/AI-SAFETY.md`

**Interfaces:**
- Consumes: Auth token, user role (`CLINICIAN`, `PATIENT`, `CAREGIVER`), active consent records.
- Produces: Strict server-side authorization enforcement, granular consent checks, safe AI guardrails.

- [ ] **Step 1: Write comprehensive test for caregiver consent lifecycle & revocation**
  Create tests in `services/api/src/__tests__/security_consent_rbac.test.ts`:
  - Patient grants caregiver permission `VIEW_OBSERVATIONS` -> caregiver can read glucose readings.
  - Caregiver without `MANAGE_TASKS` cannot complete or mutate tasks -> returns 403 Forbidden.
  - Patient revokes caregiver consent -> immediate 403 Forbidden on all caregiver patient access.
  - Caregiver cannot access patient records of non-delegated patients.
  - AI endpoints reject automated prescription changes or dose alterations without physician review.

- [ ] **Step 2: Run test to verify it fails**
  Run test: Expected to FAIL on any missing edge case.

- [ ] **Step 3: Harden permission evaluator and routes**
  Ensure all routes accessing patient resources check `resolvePatientContext()` and verify caregiver consent status (`ACTIVE` vs `REVOKED`/`EXPIRED`). Add strict input validation and audit logging.

- [ ] **Step 4: Create `docs/SECURITY-PRIVACY.md` and `docs/AI-SAFETY.md`**
  Document authentication, authorization, caregiver consent model, audit logging, rate limiting, and AI safety principles.

- [ ] **Step 5: Run test to verify passes**
  Run: `npm --workspace=services/api run test -- security_consent_rbac.test.ts`
  Expected: PASS.

---

### Task 6: Production Deployment Preparation & Mobile Configuration

**Files:**
- Modify: `apps/web/vite.config.ts`
- Modify: `apps/web/.env.example`
- Modify: `apps/mobile/app.json`
- Modify: `apps/mobile/eas.json`
- Modify: `apps/mobile/.env.example`
- Create: `docs/DEPLOYMENT.md`
- Create: `docs/EVALUATOR-GUIDE.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Environment variables (`VITE_API_BASE_URL`, `EXPO_PUBLIC_API_URL`, `DATABASE_URL`, `JWT_SECRET`).
- Produces: Production web build, configured Expo Android release profile, complete evaluator guide.

- [ ] **Step 1: Configure Doctor WebApp for production deployment**
  Update `apps/web/vite.config.ts` and `.env.example` supporting production deployment at `https://app.example.com` (placeholder) with SPA history fallback, no hardcoded localhost, and asset compression.

- [ ] **Step 2: Verify production web build succeeds**
  Run: `npm --workspace=apps/web run build`
  Expected: Success with clean distribution bundle in `apps/web/dist`.

- [ ] **Step 3: Configure Android mobile app for production readiness**
  Update `apps/mobile/app.json` and `apps/mobile/eas.json` with correct package names, permissions (Internet, Notifications), icons, splash screens, and production release profiles.

- [ ] **Step 4: Create `docs/DEPLOYMENT.md` and `docs/EVALUATOR-GUIDE.md`**
  Write complete step-by-step instructions for evaluator setup, demonstration credentials, and cloud deployment.

- [ ] **Step 5: Update `README.md`**
  Write an authoritative, professional README covering project overview, clinical problem, architecture, FHIR R4, LOINC, security, deployment, and test execution.

---

### Task 7: End-to-End Validation, Test Verification & Final Deliverables

**Files:**
- Run all test suites across `services/api`, `packages/contracts`, `apps/web`, and `apps/mobile`.
- Verify the 6 required core workflows.
- Package clean distribution ZIP.

- [ ] **Step 1: Execute all unit and integration tests**
  Run test suites across all workspaces.

- [ ] **Step 2: Verify the 6 end-to-end clinical workflows**
  1. Doctor creates patient -> patient logs in -> records glucose -> doctor sees updated glucose.
  2. Doctor prescribes medicine -> patient sees prescription -> records medicine status -> doctor sees adherence.
  3. Doctor creates care plan -> patient completes activities -> doctor sees progress.
  4. Patient grants caregiver permission -> caregiver completes delegated activity -> doctor sees update.
  5. Patient revokes caregiver permission -> caregiver access denied.
  6. Laboratory observation saved -> FHIR R4 representation generated -> verified LOINC coding included.

- [ ] **Step 3: Build clean submission ZIP package**
  Produce clean archive containing sanitized source code and documentation.

- [ ] **Step 4: Generate completion & audit report**

