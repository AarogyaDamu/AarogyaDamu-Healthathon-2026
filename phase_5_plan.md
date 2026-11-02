# AarogyaDamu Project 3 — Phase 5 Implementation Plan: Pilot Readiness & Real-World Validation

**Target Milestone**: Phase 5 — Pilot Readiness & Real-World Validation  
**Project**: AarogyaDamu — Diabetes Care Journey Companion (Health-a-thon 2026)  
**Date**: October 31, 2026  
**Status**: PROPOSED — Awaiting User Approval Before Implementation  

---

## 1. Executive Summary & Objective

With Phases 1–4 complete and verified (44/44 automated tests passing, 0 security failures, and production builds successful for API and web), the objective of **Phase 5** is to prepare AarogyaDamu for a controlled clinical pilot.

Phase 5 will establish:
1. **End-to-End Synthetic Patient Lifecycle**: Comprehensive validation tracing patient onboarding, baseline observation logging, clinician scribe consultation, shared care plan creation and approval, daily task execution with caregiver delegation, longitudinal journey tracking, and clinician follow-up review.
2. **Cross-Role Data Consistency**: Strict multi-perspective validation ensuring patient, doctor, and caregiver views access the identical persisted database state while maintaining role boundaries, active consent checks, and audit trails.
3. **Android Runtime Validation**: Booting the installed Android Virtual Device (`Pixel_7`), configuring network loopback addressing (`10.0.2.2`), and executing native mobile app workflows with clear, truthful recording of results or platform blockers.
4. **Reliability & Edge-Case Resilience**: Validating offline modes, network timeout guards, session expiration flows, duplicate submission prevention (idempotency), and graceful empty/loading states.
5. **Pilot Operational Readiness**: Auditing environment configuration, SQLite backup/restore procedures, privacy/audit logs, clinical coordinator onboarding runbooks, and a formal controlled pilot checklist with explicit regulatory disclaimers.

---

## 2. Existing Capabilities & Identified Gaps

### Existing Capabilities (Phases 1–4)
- **Care Coordination Foundation**: Role-based access, patient-controlled caregiver consents, doctor-patient assignments, and appointment scheduling (`coordination.routes.ts`).
- **Shared Diabetes Care Plan**: Clinician draft-edit-approve lifecycle with versioning, immutability upon approval, patient/caregiver-eligible tasks, and daily progress tracking (`careplan.routes.ts`).
- **Diabetes Journey Navigator**: Milestone-driven timeline, real clinical observation trajectory, daily adherence agenda, and Damu journey intelligence with non-prescribing guardrails (`journey.routes.ts`).
- **Caregiver Connect & Doctor Command Center**: Risk-stratified doctor dashboard (`/doctor/dashboard`), caregiver delegation portal (`/caregiver/dependents/:id/activities`), audit-attributed task execution (`completedByRole: 'CAREGIVER'`), sanitized clinical review notifications, and recipient deduplication.
- **Test Infrastructure**: Isolated test runner (`scripts/run-tests.cjs`) executing 44 automated tests against an ephemeral SQLite database in `os.tmpdir()` with zero mutations to `dev.db`.

### Identified Gaps to Address in Phase 5
1. **No Single Continuous Lifecycle Test**: Existing tests validate isolated slices per phase. No single test currently executes the full patient journey end-to-end across multiple sequential roles.
2. **Seed Data Incomplete for Pilot Testing**:
   - `prisma/seed.ts` creates patient `demo.patient1@aarogyadamu.local` and clinician `dr.kulkarni@aarogyadamu.local`, but does **not** create a registered `User` account with credentials for the caregiver (`meera.joshi@family.aarogyadamu.local`).
   - `prisma/seed.ts` does **not** seed an active `CarePlan` record, leaving the demo patient with tasks but no overarching care plan structure on first sign-in.
3. **Android Mobile Configuration & Verification**:
   - `apps/mobile/.env` specifies `EXPO_PUBLIC_API_URL=http://localhost:4000/api`. On an Android emulator or device, `localhost` refers to the mobile device itself; it cannot reach the host backend without dynamic loopback routing (`10.0.2.2` on emulator, or LAN IP on device).
   - Android physical/emulator execution is currently classified as `NOT VERIFIED`.
4. **Resilience & Timeout Guards**:
   - Web and mobile API clients lack explicit request timeout abort handling, which could lead to indefinite UI freezes if the backend becomes unreachable during mobile testing.
5. **Pilot Runbook & Backup Guidance**:
   - Lack of documented SQLite backup/restore and database checkpointing procedures for pilot hosts.

---

## 3. Proposed Phase 5 Tasks (Small, Incremental Steps)

### Task 1: Pilot Role & Seed Data Alignment
- **Goal**: Ensure the development database provides a fully coherent, out-of-the-box pilot environment for all three user roles.
- **Actions**:
  1. Update `services/api/prisma/seed.ts` to:
     - Create a registered user account for caregiver `meera.joshi@family.aarogyadamu.local` with password `DemoPassword123!`.
     - Seed an active `CarePlan` (v1) linked to Dr. Anjali Kulkarni with structured goals and caregiver-eligible activities.
     - Link CaregiverConsent directly to Meera Joshi's email with granular permissions (`VIEW_OBSERVATIONS`, `MANAGE_TASKS`, `VIEW_CARE_PLAN`, `VIEW_DOCUMENTS`).
     - Seed initial care team messages and notifications.
  2. Verify `npm run db:seed` executes cleanly and all three accounts can authenticate immediately.

### Task 2: End-to-End Synthetic Patient Lifecycle Test Suite
- **Goal**: Create an end-to-end integration test validating the entire clinical continuum.
- **Actions**:
  1. Create `services/api/src/__tests__/pilot_e2e_lifecycle.test.ts` executing the following sequence on a single synthetic patient:
     - **Step A**: Patient registration and clinical onboarding profile setup (`POST /api/profile/onboarding`).
     - **Step B**: Baseline fasting and post-meal glucose logging (`POST /api/observations`).
     - **Step C**: Doctor consultation prep and Scribe note generation/approval (`POST /api/scribe/sessions` -> approve).
     - **Step D**: Doctor drafts, adjusts, and approves Shared Care Plan v1 (`POST /api/care-plans` -> `approve`).
     - **Step E**: Patient grants caregiver consent with `MANAGE_TASKS` and `VIEW_OBSERVATIONS`.
     - **Step F**: Caregiver inspects activities and completes a delegated task with `completedByRole: 'CAREGIVER'`.
     - **Step G**: Journey Navigator advances stage and reflects daily agenda adherence (`GET /api/journey/stage`, `daily-agenda`).
     - **Step H**: Doctor performs clinical review (`POST /api/coordination/doctor/clinical-review`), updates target ranges, schedules follow-up visit, and dispatches sanitized generic notification.
  2. Run suite via `scripts/run-tests.cjs` to confirm isolated execution without touching `dev.db`.

### Task 3: Cross-Role Consistency & Authorization Boundary Verification
- **Goal**: Validate that all three roles see consistent persisted state and cannot violate role barriers.
- **Actions**:
  1. Add assertions in the E2E suite and web client tests verifying:
     - When patient logs glucose, doctor dashboard immediately reflects the updated risk badge.
     - When doctor revises a care plan, caregiver and patient views see the exact same approved plan version.
     - Unassigned doctors receive `403 Forbidden` on patient data.
     - Caregivers without `VIEW_OBSERVATIONS` cannot see glucose logs in the activity feed.
     - Revoking caregiver consent immediately locks the caregiver out with `403 Forbidden`.

### Task 4: Android Runtime Validation & Networking Hardening
- **Goal**: Validate mobile application behavior on Android runtime.
- **Actions**:
  1. Update `apps/mobile/src/api/client.ts` to automatically detect Android platform and resolve `10.0.2.2` when `localhost` is configured, allowing seamless emulator communication.
  2. Start the installed Android Virtual Device (`Pixel_7`) using the local Android SDK emulator (`$env:LOCALAPPDATA\Android\Sdk\emulator\emulator.exe -avd Pixel_7`).
  3. Start the mobile app (`npm run dev:mobile`) and test on the running Android emulator:
     - Verify authentication screen loads and accepts credentials.
     - Verify session router directs patient to `/(tabs)`, doctor to `/(doctor)`, and caregiver to `/(caregiver)`.
     - Verify API connectivity and data rendering.
  4. If hardware virtualization (WHPX/HAXM) or display driver limitations in the environment prevent emulator launch, document the exact failure output and platform constraint clearly under `NOT VERIFIED`.

### Task 5: Reliability, Timeout Guards & Error State Resilience
- **Goal**: Ensure the app fails gracefully under network interruptions and edge cases.
- **Actions**:
  1. Add standard `AbortController` timeout handling (15-second default) to mobile `mobileApiFetch` and web `apiFetch` to prevent hung requests.
  2. Verify idempotency on task completions: rapid double-submissions return the completed task without error or duplicate state.
  3. Verify 401 Unauthorized handling: expired or invalid tokens cleanly purge client storage and redirect to the login screen.
  4. Verify offline banner and network retry views render properly when connectivity drops.

### Task 6: Controlled Pilot Runbook & Operational Readiness Deliverables
- **Goal**: Provide complete documentation and operational checklists for pilot execution.
- **Actions**:
  1. Compile SQLite backup and WAL checkpointing instructions (`sqlite3 dev.db ".backup 'dev_backup.db'"`).
  2. Create a **Controlled Pilot Checklist** for clinical coordinators:
     - Pilot site setup & local host networking.
     - User provisioning steps (patient, doctor, caregiver).
     - Device setup guide (web browser, Android emulator/device).
     - Security & privacy protocols (PHI handling, audit trail verification).
     - Explicit regulatory disclaimer (stating system is an investigational decision-support tool, not a certified medical device).
  3. Deliver `phase_5_implementation_report.md` detailing all test evidence, build outputs, and Android validation status.

---

## 4. Dependencies & Risks

| Risk / Dependency | Impact | Mitigation Strategy |
| :--- | :--- | :--- |
| **Android Emulator Virtualization** | The host environment may lack nested virtualization or GPU acceleration, causing emulator boot failure. | Test emulator launch early. If it fails, capture exact CLI error logs, preserve static compilation, and document clearly under `NOT VERIFIED` without false claims. |
| **Network Loopback on Android** | Mobile fetch to `localhost:4000` fails on Android devices because `localhost` points to the device itself. | Implement automatic `10.0.2.2` resolution for Android emulator in `apps/mobile/src/api/client.ts`, with clear `.env` override guidance for LAN IPs. |
| **Seed Data Drift** | Changes to seed data might break existing Phase 1–4 tests if tests relied on specific user IDs. | Keep test isolation strict: automated tests use their own dynamic test factories and isolated SQLite runner; `seed.ts` is strictly for manual/pilot evaluation. |
| **Database Lock During Concurrency** | SQLite file locking could produce `SQLITE_BUSY` under high concurrent pilot requests. | Configure SQLite WAL (Write-Ahead Logging) mode and busy timeout (`busy_timeout=5000`) in Prisma connection parameters. |

---

## 5. Acceptance Criteria & Test Evidence Required

1. **Seed Data Alignment**:
   - `npm run db:seed` executes with exit code 0.
   - All three roles (`demo.patient1@aarogyadamu.local`, `dr.kulkarni@aarogyadamu.local`, `meera.joshi@family.aarogyadamu.local`) authenticate successfully with `DemoPassword123!`.
2. **End-to-End Lifecycle Verification**:
   - `pilot_e2e_lifecycle.test.ts` passes with 100% success rate on the isolated test runner.
   - All 8 sequential stages (onboarding → observations → consultation → care plan → delegation → journey → clinical review → follow-up) execute without mocks.
3. **Cross-Role Consistency**:
   - Persisted care plan and observation metrics match across all role-specific API responses.
   - Unauthorized and unconsented operations return HTTP 403.
4. **Android Execution Status**:
   - Actual emulator execution log captured, OR concrete technical blocker documented.
   - Mobile TypeScript compilation (`tsc --noEmit`) passes with 0 errors.
5. **Reliability & Production Builds**:
   - Backend API build (`npm run build:api`) passes with exit code 0.
   - Web production build (`npm run build:web`) passes with exit code 0.
   - Development database (`dev.db`) remains completely untouched by automated tests.
6. **Documentation**:
   - `phase_5_plan.md` created.
   - `phase_5_implementation_report.md` delivered upon completion.

---

## 6. Scope to Be Deferred (Post-Pilot)

The following items are outside the scope of Phase 5 and are explicitly deferred to post-pilot milestones:
- **Cloud Infrastructure & Kubernetes**: Pilot is scoped to single-machine / local clinical network deployment. Cloud Terraform/Helm scripts are deferred.
- **Direct Bluetooth CGM Hardware Drivers**: Real-time continuous glucose monitor Bluetooth Low Energy (BLE) streaming is deferred; synthetic and manual blood glucose logging is used.
- **Full Hospital EHR HL7 FHIR Live Gateway**: System outputs compliant FHIR R4 Bundles (`/api/fhir/Observation`), but live bidirectional synchronization with hospital electronic medical record servers is deferred.
- **Formal Regulatory Certifications**: CDSCO / FDA medical device clearances are deferred; the pilot operates under research / investigational decision-support protocols with human clinician oversight.

---

## 7. Execution Sequence & Approval Gate

- **Step 1 (Current)**: Present `phase_5_plan.md` to user and await explicit approval.
- **Step 2 (After Approval)**: Execute Tasks 1 to 3 (Seed alignment, E2E lifecycle test, cross-role consistency).
- **Step 3 (After Approval)**: Execute Task 4 (Android runtime validation & networking).
- **Step 4 (After Approval)**: Execute Tasks 5 & 6 (Reliability hardening, pilot runbook, implementation report).
- **Step 5**: Present final Phase 5 report and pause for user review.
