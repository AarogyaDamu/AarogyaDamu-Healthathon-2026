# PHASE 2.5 — DOCTOR-MANAGED TASKS, REMINDERS & PATIENT ADHERENCE TRACKING
## Implementation & Verification Report

**Document ID:** `DOC-P2.5-IMPL-001`  
**Phase:** Phase 2.5 (Clinical Role Boundaries & Doctor-Led Task Management)  
**Status:** COMPLETE & VERIFIED  
**Date:** 2026-11-04  
**Author:** Senior Healthcare Software Architect, Backend Engineer, React Engineer & Clinical Security Engineer  

---

## 1. Executive Summary & Clinical Governance Invariants

Phase 2.5 establishes strict clinical role boundaries for tasks, reminders, and patient adherence tracking across AarogyaDamu Project 3. In previous iterations, patients and unverified actors could author, edit, or delete arbitrary clinical care tasks. Under Phase 2.5 governance, **only an assigned clinician (doctor) can create, assign, modify, or cancel clinical tasks and reminders**, while patients view assigned instructions and record task completion with full actor attribution.

### Core Clinical Invariants Enforced
1. **DOCTOR assigns & schedules:** Only a clinician with an active `DoctorPatientAssignment` can create or cancel tasks and schedule reminders.
2. **PATIENT executes & confirms:** The patient views assigned tasks in a dedicated "Your Care Plan" workspace, reads doctor instructions, and marks tasks complete via accessible checkbox controls.
3. **PATIENT cannot create or alter clinical tasks:** Direct API attempts by patients or caregivers to create (`POST /api/tasks`), edit (`PATCH /api/tasks/:id`), or delete (`DELETE /api/tasks/:id`) clinical tasks return `403 Forbidden` (`TASK_CREATION_FORBIDDEN`, `TASK_EDIT_FORBIDDEN`, `TASK_DELETION_FORBIDDEN`).
4. **CAREGIVER acts only with explicit consent:** Caregivers can complete tasks on behalf of the patient only when granted explicit scoped permission (`COMPLETE_TASKS_ON_BEHALF` or `MANAGE_TASKS`). Unauthorized or revoked caregivers receive `403 Forbidden`.
5. **Universal Actor Attribution:** Every completed task records `completedById`, `completedByRole` (`'PATIENT' | 'CAREGIVER' | 'DOCTOR'`), and `completedAt`.
6. **Task & Reminder Decoupling:** Reminders notify and alert the patient; acknowledging a reminder does NOT falsely mark the underlying clinical care task complete.
7. **Clinical Audit History Preservation:** Clinical tasks cannot be hard deleted. Clinician cancellations require a mandatory justification reason, record `cancelledAt` and `cancellationReason`, and remain visible in historical doctor views.

---

## 2. Pre-Implementation Architecture Audit Findings

Prior to making changes, an architectural audit was conducted and documented in [`docs/phases/P2_5_task_reminder_architecture_review.md`](file:///c:/Users/prana/Desktop/aarogyadamu-project3/docs/phases/P2_5_task_reminder_architecture_review.md).

### Key Architectural Findings
- **Single Source of Truth:** `CareTask` in Prisma schema already represented care tasks, linked to `User` (patient) and `CarePlan`. However, it lacked doctor provenance fields (`assignedById`, clinical instructions, priority, frequency, recurrence, and cancellation metadata).
- **Consolidation of API Handlers:** In `services/api/src/server.ts`, an inline `taskRouter` had partially served `/api/tasks`. This inline router was completely deprecated and replaced with a dedicated, hardened module in `services/api/src/routes/tasks.routes.ts`.
- **Phase 2 Test Discrepancy Reconciliation:** The Phase 2 test report described 16 scenarios, whereas `p2_medication_prescribing.test.ts` contained 15 test blocks numbered 1, 2, 4..16 (skipping the string title '3' because prescription modifications were validated in test 15 and `p0_2_medication_vault.test.ts`). For Phase 2.5, 22 test cases were explicitly mapped 1:1 to the 22 required clinical scenarios.

---

## 3. Database Modifications & Migrations

### Migration: `20261104020000_p2_5_doctor_tasks_reminders`
File: `services/api/prisma/migrations/20261104020000_p2_5_doctor_tasks_reminders/migration.sql`

```sql
-- AlterTable CareTask: Add clinician assignment, instructions, priority, recurrence, and cancellation audit
ALTER TABLE "CareTask" ADD COLUMN "assignedById" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "instructions" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'MEDIUM';
ALTER TABLE "CareTask" ADD COLUMN "frequency" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "recurrence" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "clinicalNotes" TEXT;
ALTER TABLE "CareTask" ADD COLUMN "cancelledAt" DATETIME;
ALTER TABLE "CareTask" ADD COLUMN "cancellationReason" TEXT;

-- CreateIndex
CREATE INDEX "CareTask_assignedById_idx" ON "CareTask"("assignedById");
CREATE INDEX "CareTask_userId_dueAt_idx" ON "CareTask"("userId", "dueAt");
CREATE INDEX "CareTask_userId_status_idx" ON "CareTask"("userId", "status");
```

### Prisma Schema Updates (`services/api/prisma/schema.prisma`)
- `CareTask`:
  - `assignedBy User? @relation("TaskAssignedBy", fields: [assignedById], references: [id])`
  - `assignedById String?`
  - `instructions String?`
  - `priority String @default("MEDIUM")`
  - `frequency String?`
  - `recurrence String?`
  - `clinicalNotes String?`
  - `cancelledAt DateTime?`
  - `cancellationReason String?`
- `User`:
  - `tasksAssigned CareTask[] @relation("TaskAssignedBy")`

---

## 4. Contracts & Permissions

### `packages/contracts/src/index.ts`
- **Caregiver Permission:** Added `'COMPLETE_TASKS_ON_BEHALF'` to `CaregiverPermissionEnum` and `CaregiverPermission` type.
- **Validation Schemas:**
  - `DoctorTaskCreateSchema`: Validates `patientId` (UUID), `title`, `category`, `dueAt`, `instructions`, `priority` (`LOW | MEDIUM | HIGH | URGENT`), `frequency`, `recurrence`, `clinicalNotes`, `idempotencyKey`.
  - `TaskCompleteSchema`: Validates optional `notes`, `completionTimestamp`, `idempotencyKey`.
  - `TaskCancelSchema`: Validates mandatory `cancellationReason`.
- **Synchronized:** Generated package types synchronized across `packages/contracts` and root `node_modules/@aarogyadamu/contracts`.

### Permission Evaluator (`services/api/src/permissions/evaluator.ts`)
- Added `'COMPLETE_TASKS_ON_BEHALF'` to `RequiredPermission`.
- Handled caregiver scope resolution: checks active caregiver consent for `COMPLETE_TASKS_ON_BEHALF` or legacy `MANAGE_TASKS`. Returns 403 if consent is missing, expired, or revoked.

---

## 5. Backend REST API Implementation

Mounted at `/api/tasks` in `services/api/src/server.ts` via dedicated controller `services/api/src/routes/tasks.routes.ts`:

| Method | Endpoint | Authorization | Clinical Logic |
|---|---|---|---|
| `GET` | `/api/tasks` | Patient, Caregiver, or Assigned Doctor | Returns tasks scoped to patient. Dynamically computes `status = 'OVERDUE'` if due date passed while `status === 'PENDING'`. |
| `GET` | `/api/tasks/stats` | Patient, Caregiver, or Assigned Doctor | Aggregates `total`, `completed`, `pending`, `overdue`, `cancelled`, `completionPercentage`, `patientCompletedCount`, `caregiverCompletedCount`. |
| `POST` | `/api/tasks` & `/api/tasks/assign` | Assigned Doctor ONLY | Validates active doctor-patient assignment. Rejects non-clinicians with `403 Forbidden`. Creates task, issues `TASK_ASSIGNED` notification to patient, records clinical audit. Supports idempotency key caching. |
| `POST` | `/api/tasks/:id/complete` | Patient, Authorized Caregiver, or Assigned Doctor | Marks task complete. Sets `status = 'COMPLETED'`, `completedAt`, `completedById`, and `completedByRole` (`'PATIENT' \| 'CAREGIVER' \| 'DOCTOR'`). Rejects unauthorized caregivers with `403 Forbidden`. Replays idempotent completions with `{ replayed: true }`. |
| `PATCH` | `/api/tasks/:id` | Assigned Doctor ONLY | Updates task instructions, due date, priority, or clinical notes. Rejects patients and caregivers with `403 Forbidden`. |
| `POST` | `/api/tasks/:id/cancel` | Assigned Doctor ONLY | Sets `status = 'CANCELLED'`, `cancelledAt`, `cancellationReason`. Preserves task row for clinical history. |
| `DELETE` | `/api/tasks/:id` | Any Actor | Returns `403 Forbidden` (`TASK_DELETION_FORBIDDEN`). Hard deletion is prohibited. |

---

## 6. Doctor Workstation Implementation (`apps/web`)

**File:** `apps/web/src/pages/DoctorDashboard.tsx`
- **Navigation Drawer:** Updated tab label to `"Patient Care Tasks"`.
- **Patient Context Banner:** Shows currently selected patient banner with quick switch reminder when no patient is selected.
- **Monitoring Scorecards:** 6 real-time metric cards:
  1. Total Assigned
  2. Completed
  3. Pending
  4. Overdue
  5. Cancelled
  6. Adherence Rate (%)
- **Task Assignment Drawer/Modal:** Allows clinician to assign title, category, priority, due date, recurrence, and detailed clinical instructions.
- **Submissions & Attribution Badges:**
  - `Patient Self-Completed` (green badge)
  - `Caregiver on Behalf of Patient` (blue badge)
  - `Doctor Point-of-Care` (indigo badge)
- **Task Filtering:** Filter by All, Pending, Overdue, Completed, Cancelled.
- **Clinical Cancellation Modal:** Clinician must specify a cancellation reason; cancels task without deletion.
- **Verification:** `npm run test:web` passes 29/29 tests; `npm run build:web` builds with zero errors.

---

## 7. Patient Mobile App Implementation (`apps/mobile`)

**Files:** `apps/mobile/app/(tabs)/tasks.tsx`, `index.tsx`, `journey.tsx`
- **Rebranding:** Refactored into **"Your Care Plan"** (`tasks.tsx`).
- **Elimination of Patient Creation:** Removed all floating action buttons (`+`), modals, and inputs for patient task creation.
- **Sectioned Task Groups:**
  1. **Due Today:** Tasks due on the current calendar day.
  2. **Upcoming:** Future scheduled tasks.
  3. **Completed:** Tasks completed today or earlier with attribution details.
  4. **Overdue:** Tasks whose due date passed without completion.
- **Accessible Completion Checkbox:** High-contrast `[ ]` / `[✓]` touch target with accessibility label (`Mark task complete: <title>`). Calls `POST /api/tasks/:id/complete`.
- **Doctor Instructions Display:** Highlighted in a distinct clinical card showing priority, recurrence, and doctor notes.
- **Attribution Display:** Shows `Completed by you on <time>` or `Completed by caregiver on your behalf on <time>`.
- **Home & Journey Integration:**
  - `app/(tabs)/index.tsx`: Today's Care Plan card links directly to `/tasks`; checkbox dispatches `POST /api/tasks/:id/complete`.
  - `app/(tabs)/journey.tsx`: Added direct link to "Your Care Plan" in the Follow-up section.
- **Verification:** `npm run test:mobile` passes 24/24 tests; `npm run typecheck:mobile` reports 0 errors.

---

## 8. Reminders & Decoupling from Task Completion

- **Model Reused:** Existing `Reminder` and `CareNotification` models are utilized.
- **Decoupling Invariant:** When a reminder notification is created (`POST /api/reminders`), it alerts the patient via system notification.
- **Test 16 Verification:** In test scenario 16, a reminder is generated for an assigned task. The reminder is retrieved and marked acknowledged. The test explicitly asserts:
  `expect(taskAfterReminder.status).toBe('PENDING')`
  `expect(taskAfterReminder.completedAt).toBeNull()`
  Acknowledging a reminder does NOT mark the care task as completed.

---

## 9. Caregiver Delegation & Consent Verification

- Caregiver actions are governed by `CaregiverConsent` with granular permissions.
- Test scenarios 17, 18, 19, and 20 verified:
  - **Test 17:** Caregiver lacking `COMPLETE_TASKS_ON_BEHALF` permission receives `403 Forbidden` (`INSUFFICIENT_CAREGIVER_PERMISSIONS`).
  - **Test 18:** Caregiver with active consent containing `COMPLETE_TASKS_ON_BEHALF` completes the task successfully.
  - **Test 19:** Doctor inspects completed task; backend records `completedById: caregiver.id` and `completedByRole: 'CAREGIVER'`.
  - **Test 20:** Upon patient consent revocation, subsequent completion attempts by the caregiver receive `403 Forbidden` (`CAREGIVER_CONSENT_REVOKED`).

---

## 10. Automated Test Results & Verification

### Phase 2.5 Automated Test Suite (`p2_5_doctor_tasks_reminders.test.ts`)
22 out of 22 required clinical test scenarios passing:

| # | Test Scenario | Result | Duration |
|---|---|---|---|
| 1 | Assigned doctor creates a task | **PASS** | 61 ms |
| 2 | Unassigned doctor cannot create a task (403) | **PASS** | 23 ms |
| 3 | Patient receives the assigned task | **PASS** | 25 ms |
| 4 | Patient can view task details | **PASS** | 18 ms |
| 5 | Patient cannot create tasks (403) | **PASS** | 17 ms |
| 6 | Patient cannot alter instructions (403) | **PASS** | 14 ms |
| 7 | Patient completes a task | **PASS** | 37 ms |
| 8 | Doctor sees completion | **PASS** | 27 ms |
| 9 | Completion timestamp is accurate | **PASS** | 19 ms |
| 10 | Actor attribution is accurate (`completedByRole: 'PATIENT'`) | **PASS** | 22 ms |
| 11 | Patient cannot complete another patient's task (403/404) | **PASS** | 41 ms |
| 12 | Doctor can cancel an assigned task | **PASS** | 75 ms |
| 13 | Cancelled task remains in history | **PASS** | 23 ms |
| 14 | Reminder is created successfully | **PASS** | 60 ms |
| 15 | Reminder is delivered to the correct patient | **PASS** | 32 ms |
| 16 | Reminder notification does not mark a task complete | **PASS** | 122 ms |
| 17 | Caregiver without permission cannot complete tasks (403) | **PASS** | 80 ms |
| 18 | Caregiver with explicit permission completes authorized task | **PASS** | 92 ms |
| 19 | Doctor can distinguish patient vs caregiver completion | **PASS** | 83 ms |
| 20 | Revoked caregiver cannot complete additional tasks (403) | **PASS** | 92 ms |
| 21 | Idempotency replay on rapid completion submission (200) | **PASS** | 53 ms |
| 22 | Unconfirmed and overdue tasks are displayed correctly | **PASS** | 138 ms |

### Full Monorepo Test Summary
- **Backend Test Runner (`services/api`):** 27 test suites, **521 / 521 passing** (100%).
- **Doctor Web Workstation (`apps/web`):** 29 / 29 passing (100%).
- **Patient Mobile App (`apps/mobile`):** 24 / 24 passing (100%).
- **Root Vitest Integration Suite (`tests/integration`):** 2 / 2 passing (100%).
- **Total Monorepo Tests:** **576 / 576 PASSING (100%)**.
- **Typecheck & Build:** Mobile TypeScript (0 errors), API build (0 errors), Web build (0 errors).

---

## 11. Security Verification Matrix

| Vulnerability / Threat | Mitigation Implemented | Verified By |
|---|---|---|
| Patient-authored prescriptions or clinical orders | `POST /api/tasks` strictly checks `req.user?.isClinician` and active assignment. | Test 5 (`p2_5_doctor_tasks_reminders.test.ts`) |
| Unassigned doctor tampering with care plan | Clinician must have an active row in `DoctorPatientAssignment`. | Test 2 (`p2_5_doctor_tasks_reminders.test.ts`) |
| Caregiver privilege escalation | Evaluates patient consent scopes; requires `COMPLETE_TASKS_ON_BEHALF` or `MANAGE_TASKS`. | Test 17 & 20 |
| Cross-patient completion hijacking | Evaluates `task.userId === effectivePatientId`; rejects cross-patient tokens. | Test 11 |
| Spurious network retries creating duplicate events | Idempotency key tracking in in-memory replay cache + database status check. | Test 21 |
| Destruction of clinical audit trail | `DELETE /api/tasks/:id` returns 403; cancellations preserve historical records. | Test 12 & 13 |

---

## 12. Strict Phase Boundaries & Scope Declaration

This work strictly completes **Phase 2.5**. No out-of-scope phases were modified:
- **Phase 3 (Caregiver Experience Redesign):** Untouched. Existing consent engine was leveraged without redesigning Phase 3 caregiver dashboards.
- **Phase 4 (Damu Conversational AI & Three.js 3D Twin):** Untouched.
- **Phase 5 (NEO Sarvam Medical Scribe):** Untouched.
- **Phase 6 (Apollo Clinical Trial Matching & Predictive Twin):** Untouched.

Phase 2.5 is fully complete, clinically verified, and ready for code review.

