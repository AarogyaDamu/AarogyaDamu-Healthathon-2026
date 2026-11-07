# Phase 2.5 — Doctor-Managed Tasks, Reminders & Patient Adherence Tracking
## Pre-Implementation Architecture Review & Gap Analysis

**Author:** Senior Healthcare Software Architect, Clinical Security Engineer  
**Date:** 2026-11-04  
**Project:** AarogyaDamu Project 3  
**Status:** AUDIT COMPLETED — IMPLEMENTATION BLUEPRINT APPROVED  

---

## 1. Executive Summary & Core Clinical Rules

Phase 2.5 implements a unified, doctor-controlled clinical task and reminder management system.

### Non-Negotiable Clinical Invariants:
1. **Clinical Authority:** Only licensed clinicians with an active `DoctorPatientAssignment` can create, assign, modify, or cancel clinical tasks and reminders.
2. **Immutable Doctor Instructions:** Patients and caregivers cannot create tasks, edit doctor instructions, change due dates, change recurrences, or delete assigned tasks. Direct API mutation requests by patients or caregivers return `403 Forbidden`.
3. **Patient Mobile Workflow ("Your Care Plan"):** Patients view doctor-assigned tasks organized into four clinical groups (**Due Today**, **Upcoming**, **Completed**, and **Overdue**). Completing a task occurs via a single authenticated checkbox action that securely transmits a completion event to the server.
4. **Caregiver Delegation:** Caregivers cannot create or modify tasks. Caregivers can only complete eligible tasks on behalf of a patient if the patient has granted explicit consent containing the dedicated scope `COMPLETE_TASKS_ON_BEHALF`.
5. **Exact Attribution & Provenance:** Every task completion records:
   - `completedById`: Authenticated user ID of the actor.
   - `completedByRole`: `'PATIENT'` or `'CAREGIVER'`.
   - `completedAt`: Server-side UTC timestamp.
6. **No Duplicate Architectures:** Reuses `CareTask` and `Reminder` models and existing notification infrastructure. Does not create parallel or disjoint task tables.

---

## 2. Phase 2 Test Report Discrepancy Reconciliation

The user noted:
> "Reconcile the Phase 2 test-report discrepancy: 16 described scenarios versus 15 reported passing tests."

### Technical Audit of Phase 2 Test Suite:
In `services/api/src/__tests__/p2_medication_prescribing.test.ts`:
- The test suite was structured around 15 discrete `test(...)` blocks.
- **Scenario 3** (*"Doctor modifies prescription details / pauses prescription with mandatory clinical reason"*) was integrated directly into:
  1. Test 15 (*"15. Discontinued prescriptions remain available in historical records"*), which tests doctor status updates to `DISCONTINUED` and `PAUSED` requiring `reasonForChange`.
  2. The companion baseline suite `services/api/src/__tests__/p0_2_medication_vault.test.ts` (Section 4: *"Doctor pausing medication with reason updates status, sets isActive: false, and logs audit"*).
- The 15 `test()` definitions in `p2_medication_prescribing.test.ts` were numbered: `1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16` (skipping the number 3 in the string title while covering its logic).
- In Phase 2.5, all 22 test scenarios specified will have 1:1 explicitly numbered `test(...)` blocks with no missing indices.

---

## 3. Pre-Implementation Audit of Existing Codebase

### A. Data Models (`schema.prisma`)

#### 1. `CareTask` (Existing: Lines 187–209)
```prisma
model CareTask {
  id              String    @id @default(uuid())
  userId          String    // Patient ID
  carePlanId      String?
  completedById   String?
  completedByRole String?   // PATIENT, CAREGIVER, DOCTOR
  title           String
  category        String    @default("FOLLOW_UP")
  status          String    @default("PENDING")
  dueAt           DateTime
  completedAt     DateTime?
  idempotencyKey  String?   @unique
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  completedBy User?     @relation("TaskCompletedBy", fields: [completedById], references: [id], onDelete: SetNull)
  carePlan    CarePlan? @relation("CarePlanTasks", fields: [carePlanId], references: [id], onDelete: SetNull)
}
```
**Findings on `CareTask`:**
- **Already Supports:**
  - Patient ownership (`userId` -> `User`).
  - Completion actor (`completedById` -> `User`).
  - Completion actor role (`completedByRole`).
  - Due date (`dueAt`).
  - Completion timestamp (`completedAt`).
  - Status (`status`: PENDING, COMPLETED, CANCELLED, OVERDUE).
  - Idempotency key (`idempotencyKey`).
- **Missing Fields Required for Phase 2.5:**
  - `assignedById`: Doctor who prescribed/assigned the task (with relation to `User`).
  - `instructions`: Detailed clinical instructions from the doctor (currently only has `title`).
  - `priority`: Priority level (`HIGH`, `MEDIUM`, `LOW`, default `MEDIUM`).
  - `frequency`: Schedule frequency (`ONCE`, `DAILY`, `WEEKLY`, `AS_NEEDED`, default `ONCE`).
  - `recurrence`: Optional recurrence pattern.
  - `clinicalNotes`: Optional doctor clinical notes.
  - `cancelledAt`: Timestamp when cancelled by doctor.
  - `cancellationReason`: Rationale if cancelled.

#### 2. `Reminder` (Existing: Lines 678–702)
```prisma
model Reminder {
  id               String    @id @default(uuid())
  userId           String    // Patient ID
  createdById      String    // Creator (Doctor)
  title            String
  category         String    @default("GENERAL")
  status           String    @default("SCHEDULED")
  remindAt         DateTime
  timezone         String?
  recurrence       String    @default("ONCE")
  entityType       String?   // CARE_TASK, MEDICATION, APPOINTMENT
  entityId         String?
  notes            String?
  deliveredAt      DateTime?
  acknowledgedAt   DateTime?
  cancelledAt      DateTime?
  idempotencyKey   String?   @unique
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
}
```
**Findings on `Reminder`:**
- Fully capable of supporting doctor-scheduled reminders.
- Links to `CARE_TASK` via `entityType = 'CARE_TASK'` and `entityId = task.id`.
- Acknowledgment (`acknowledgedAt`) is completely separate from task completion (`CareTask.completedAt`).

#### 3. `CarePlan` & `CarePlanActivity` (Existing: Lines 475–538)
- `CarePlan` has `patientId`, `doctorId`, `doctorInstructions`, and related `tasks` (`CareTask[]`).
- Can optionally link a `CareTask` to the active `CarePlan` via `carePlanId`.

#### 4. `CaregiverConsent` & Permission Evaluator (`evaluator.ts`)
- `CaregiverConsent.permissions` stores JSON string array of granted scopes.
- Currently supports `VIEW_TASKS` and `MANAGE_TASKS`.
- Needs explicit new scope: `COMPLETE_TASKS_ON_BEHALF`.
- Caregiver can only mark task completed if consent has `COMPLETE_TASKS_ON_BEHALF` or `MANAGE_TASKS`. Caregiver cannot create or delete tasks.

---

### B. Existing Task Routes Audit

1. **`services/api/src/server.ts` (Inline `taskRouter`, Lines 1428–1545):**
   - Vulnerability: `taskRouter.post('/')` uses `resolvePatientContext(req, 'MANAGE_TASKS')`. Allows patient and caregiver to create tasks directly!
   - Vulnerability: `taskRouter.patch('/:id')` allows updating title and status without doctor check or attribution.
   - Missing: Does not record `completedById` or `completedByRole`.
   - Missing: Does not enforce clinician assignment for creation.
2. **`services/api/src/routes/tasks.routes.ts`:**
   - Standalone file with similar logic, currently unmounted in `server.ts`.
   - We will make `tasks.routes.ts` the single authoritative router and mount it in `server.ts`.
3. **`services/api/src/routes/coordination.routes.ts` (Lines 1074–1142):**
   - Has `/doctor/assign-task` requiring `requireClinician` and verifying `verifyDoctorAssignment`.
   - We will standardize task management under `/api/tasks` and keep `/coordination/doctor/assign-task` as a compatible forwarder.

---

### C. Client Implementations Audit

1. **Doctor Workstation (`DoctorDashboard.tsx`):**
   - Has partial task creation under `handleAssignTask` (calling `/coordination/doctor/assign-task`).
   - Missing dedicated **Patient Care Tasks** command center with:
     - Full creation form (Title, Category, Detailed Instructions, Due Date, Due Time, Priority, Frequency, Recurrence, Clinical Notes).
     - Live task monitoring (Total Assigned, Completed, Pending, Overdue, Cancelled, Completion %).
     - Daily and weekly views with submitter provenance badges (**Patient Self-Completed** vs **Caregiver on Behalf of Patient**).
     - Task cancellation with preserved history.
2. **Patient Mobile App:**
   - `apps/mobile/app/(tabs)/tasks.tsx` currently contains legacy `clinicalStore` code with an "Add Task" button and manual inputs.
   - Must be transformed into **Your Care Plan** screen:
     - No patient creation/editing controls.
     - Grouped by **Due Today**, **Upcoming**, **Completed**, and **Overdue**.
     - Accessible checkboxes for marking tasks completed.
     - Displays doctor's name and exact instructions.
   - `apps/mobile/app/(tabs)/index.tsx` (Home Dashboard):
     - Already has a "Today's Care Plan" card. Ensure it connects to authoritative `/api/tasks` endpoints with proper server-side attribution.
   - `apps/mobile/app/(tabs)/journey.tsx` (My Journey):
     - Add direct navigation / view for **Your Care Plan**.

---

## 4. Architectural Blueprint & Planned Modifications

### 1. Database Model Augmentations
Augment `CareTask` in `schema.prisma`:
- `assignedById`: `String?`
- `assignedBy`: `User?` `@relation("TaskAssignedBy", fields: [assignedById], references: [id], onDelete: SetNull)`
- `instructions`: `String?`
- `priority`: `String @default("MEDIUM")` // HIGH, MEDIUM, LOW
- `frequency`: `String @default("ONCE")` // ONCE, DAILY, WEEKLY
- `recurrence`: `String?`
- `clinicalNotes`: `String?`
- `cancelledAt`: `DateTime?`
- `cancellationReason`: `String?`

Run migration: `20261104020000_p2_5_doctor_tasks_reminders`.

### 2. Authorization & Route Contracts (`/api/tasks`)
- `POST /api/tasks` & `POST /api/tasks/assign`:
  - Strictly `requireClinician` + active `DoctorPatientAssignment`.
  - Non-clinician caller -> `403 Forbidden` (`CLINICIAN_ONLY_TASK_ASSIGNMENT`).
  - Sets `assignedById = doctor.id`, `status = 'PENDING'`.
  - Dispatches `CareNotification` (`TASK_ASSIGNED`) to patient.
  - Logs `TASK_ASSIGNED` audit event.
- `GET /api/tasks`:
  - Patient gets own tasks.
  - Assigned doctor gets patient's tasks via `x-target-patient-id`.
  - Consented caregiver gets tasks via `x-target-patient-id` (`VIEW_TASKS`).
  - Unassigned doctor / unauthorized patient -> `403 Forbidden` or `404 Not Found`.
- `POST /api/tasks/:id/complete`:
  - Dedicated completion endpoint.
  - Caller: Patient (`completedByRole: 'PATIENT'`) or Consented Caregiver (`completedByRole: 'CAREGIVER'`).
  - Caregiver requires consent scope `COMPLETE_TASKS_ON_BEHALF` or `MANAGE_TASKS`. Missing scope -> `403 Forbidden`.
  - Records `completedById = actor.id`, `completedAt = new Date()`, `status = 'COMPLETED'`.
  - Idempotency protection: Replay of same idempotency key or marking already completed task returns `200 OK` with `{ replayed: true }`.
  - Dispatches audit log `TASK_COMPLETED`.
- `PATCH /api/tasks/:id`:
  - Doctor-only for updating instructions, due date, or priority.
  - Patient or caregiver cannot modify task -> `403 Forbidden`.
- `POST /api/tasks/:id/cancel`:
  - Doctor-only + active assignment.
  - Requires `cancellationReason`.
  - Sets `status = 'CANCELLED'`, `cancelledAt = new Date()`.
  - Task is preserved in history (never deleted).
- `DELETE /api/tasks/:id`:
  - Hard delete disabled for patient and caregiver (`403 Forbidden`). Soft cancellation via `/cancel` is the clinical standard.

### 3. Doctor-Scheduled Reminders (`/api/reminders`)
- Ensure doctor can create reminders with `entityType = 'CARE_TASK'` and `entityId = task.id`.
- Delivering or acknowledging a reminder does NOT modify `CareTask.status`.

### 4. Patient Mobile Experience ("Your Care Plan")
- Dedicated, clean screen without any Add/Create/Delete inputs.
- Tabs/Sections: **Due Today**, **Upcoming**, **Completed**, **Overdue**.
- Displays: Task title, Doctor name, Detailed instructions, Due date/time, Completion status badge.
- Instant server-synced checkbox completion with loading and optimistic rollback on error.

### 5. Doctor Workstation ("Patient Care Tasks")
- Embedded in selected patient drawer in `DoctorDashboard.tsx`.
- Form for task creation with patient banner.
- Task status cards: Total, Completed, Pending, Overdue, Cancelled, Adherence Rate.
- Filterable task roster with badges for submitter attribution (**Patient Completed** vs **Caregiver on Behalf**).
- Action buttons: "Cancel Task" (with reason modal).

---

## 5. Security & Isolation Matrix

| Action | Allowed Roles | Pre-conditions | Result on Failure |
|---|---|---|---|
| Create/Assign Task | DOCTOR | Active `DoctorPatientAssignment` | `403 Forbidden` |
| Cancel Task | DOCTOR | Active `DoctorPatientAssignment` + reason | `403 Forbidden` |
| View Tasks | PATIENT, CAREGIVER, DOCTOR | Self, active consent (`VIEW_TASKS`), or active doctor assignment | `403 Forbidden` |
| Complete Task (Self) | PATIENT | Patient ownership | `403 Forbidden` |
| Complete Task (Delegated) | CAREGIVER | Active consent with `COMPLETE_TASKS_ON_BEHALF` | `403 Forbidden` |
| Create Reminder | DOCTOR (or patient personal) | Clinician for doctor reminders, self for personal | `403 Forbidden` |
| Delete Task | NONE (Soft-cancel only) | Hard delete disabled | `403 Forbidden` |

---

## 6. Implementation Plan & Execution Sequence

1. **Step 1:** Update `schema.prisma` with `CareTask` fields; generate Prisma client; create and apply SQL migration.
2. **Step 2:** Update `packages/contracts` with Task schemas (`TaskCreateSchema`, `TaskUpdateSchema`, `TaskCompleteSchema`, `TaskCancelSchema`).
3. **Step 3:** Implement authoritative `services/api/src/routes/tasks.routes.ts`, mount in `server.ts`, update `evaluator.ts` with `COMPLETE_TASKS_ON_BEHALF`.
4. **Step 4:** Build `apps/web/src/pages/DoctorDashboard.tsx` "Patient Care Tasks" section with task creation, monitoring metrics, and cancellation.
5. **Step 5:** Build `apps/mobile/app/(tabs)/tasks.tsx` "Your Care Plan" screen with Due Today/Upcoming/Completed/Overdue, checkbox completion, and immutable doctor instructions.
6. **Step 6:** Update `apps/mobile/app/(tabs)/index.tsx` and `journey.tsx` with links and progress cards.
7. **Step 7:** Author `services/api/src/__tests__/p2_5_doctor_tasks_reminders.test.ts` covering all 22 required test scenarios.
8. **Step 8:** Run monorepo typecheck, full API tests, web tests, and mobile tests.
9. **Step 9:** Author `docs/phases/P2_5_task_reminder_implementation_report.md`.

