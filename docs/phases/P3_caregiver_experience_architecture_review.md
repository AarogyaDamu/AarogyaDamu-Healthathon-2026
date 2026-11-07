# PHASE 3 — DEDICATED CAREGIVER EXPERIENCE & PERMISSION-GOVERNED ACCESS
## Architecture Review & Implementation Plan

**Document ID:** `DOC-P3-ARCH-001`  
**Phase:** Phase 3 (Dedicated Caregiver Experience & Permission-Governed Access)  
**Status:** IN PROGRESS  
**Date:** 2026-11-04  
**Author:** Senior Healthcare Software Architect, Backend Engineer, React Engineer & Clinical Security Engineer  

---

## 1. Context & Objectives

AarogyaDamu Project 3 serves three distinct user roles:
1. **Doctor Web Workstation:** Clinicians manage assigned patients, prescriptions, care plans, tasks, reminders, and clinical reviews.
2. **Patient Mobile Application:** Patients track glucose, view doctor-prescribed care plans, report adherence, and manage their care team.
3. **Caregiver Experience:** A dedicated, permission-governed mobile workspace allowing authorized family members and caregivers to support patients without taking control of patient accounts or clinical decisions.

### Non-Negotiable Clinical & Security Rules
- **Authentication & Identity:** Caregivers authenticate with their own distinct user account (role: `CAREGIVER`). Caregivers NEVER log in as the patient or share passwords.
- **Explicit Scoped Consent:** A caregiver can only access patients who have explicitly granted an active `CaregiverConsent`. No access exists by default.
- **Strict Granular Permissions:** Access is restricted strictly to granted capabilities (`VIEW_HEALTH_SUMMARY`, `VIEW_MEDICATIONS`, `VIEW_MEDICATION_ADHERENCE`, `VIEW_TASKS`, `COMPLETE_TASKS_ON_BEHALF`, `VIEW_APPOINTMENTS`, `VIEW_REPORTS`, `VIEW_HEALTH_TIMELINE`).
- **Zero Clinical Tampering:** Caregivers cannot prescribe medications, modify dosages, create or alter clinical care tasks, or change doctor instructions.
- **Actor Attribution:** Every caregiver action (e.g. task completion, dose logging) records `completedById`, `completedByRole: 'CAREGIVER'`, and a permanent timestamp.
- **Immediate Revocation:** If a patient revokes caregiver consent, all subsequent API requests by the caregiver are rejected immediately (`403 Forbidden`). Protected cached data is cleared from the mobile session.

---

## 2. Existing Repository Implementation Audit

| Component | Current State | Phase 3 Required Extensions |
|---|---|---|
| **Prisma Schema (`CaregiverConsent`)** | Stores `patientId`, `caregiverEmail`, `caregiverName`, `relationship`, `status` (`ACTIVE`/`REVOKED`), `permissions` (JSON), `expiresAt`. | Add `lastAccessedAt DateTime?`, `acceptedAt DateTime?`, `invitationToken String?` to track last access and invitation lifecycle. |
| **Contracts (`CaregiverPermissionEnum`)** | Contains `VIEW_OBSERVATIONS`, `VIEW_TASKS`, `MANAGE_TASKS`, `COMPLETE_TASKS_ON_BEHALF`, `VIEW_DOCUMENTS`, `VIEW_CONSULTATIONS`, `VIEW_CARE_PLAN`, `VIEW_MEDICATIONS`, `MANAGE_MEDICATIONS`, etc. | Add canonical Phase 3 permissions: `VIEW_HEALTH_SUMMARY`, `VIEW_MEDICATION_ADHERENCE`, `VIEW_APPOINTMENTS`, `VIEW_REPORTS`, `VIEW_HEALTH_TIMELINE`. |
| **Permission Evaluator (`evaluator.ts`)** | `resolvePatientContext(req, permission)` parses `X-Target-Patient-Id` and verifies active consent and granted permissions. | Add permission aliases for Phase 3 canonical names so both legacy and modern permission keys resolve accurately. |
| **Backend Routes (`caregivers.routes.ts`)** | Mounted at `/api/caregivers` and `/api/consents`. Supports list, invite, revoke. | Add `PATCH /api/caregivers/:id/permissions` (modify permissions), `GET /api/caregivers/:id/actions` (patient reviews caregiver activity), `POST /api/caregivers/invitations/:id/accept` and `reject`. |
| **Dedicated Caregiver Endpoints** | Partially in `/api/coordination/caregiver/patients`. | Implement consolidated `/api/caregivers/patients/:patientId/dashboard`, `/tasks`, `/medications`, `/health` endpoints with permission guards. |
| **Mobile Caregiver Workspace (`apps/mobile/app/(caregiver)`)** | Basic `index.tsx`, `dependents.tsx`, `appointments.tsx`, `profile.tsx`. | Expand into 5 full permission-governed screens: Home (patient switcher, overview, active perms), Care Tasks (`tasks.tsx`), Medicines (`medications.tsx`), Health Overview (`health.tsx`), Profile (`profile.tsx`). |
| **Patient Profile UI (`apps/mobile/app/(tabs)/profile.tsx`)** | Section 3 Caregiver Access Manager has basic invite and revoke. | Add view permissions, edit/modify permissions, view pending invitations, view last access timestamp, and review caregiver actions. |

---

## 3. Database Modifications

Additive migration `20261104030000_p3_caregiver_experience`:
- Add `lastAccessedAt DateTime?` to `CaregiverConsent`
- Add `acceptedAt DateTime?` to `CaregiverConsent`
- Add `invitationToken String?` to `CaregiverConsent`

---

## 4. Caregiver Mobile Experience Architecture

Tab layout (`apps/mobile/app/(caregiver)/_layout.tsx`):
1. **Home (`index.tsx`)**: Active patient switcher, patient info banner, today's care status, active permission indicators, quick task and med summaries.
2. **Care Tasks (`tasks.tsx`)**: Doctor-assigned tasks for active patient. Read-only unless `COMPLETE_TASKS_ON_BEHALF` is granted.
3. **Medicines (`medications.tsx`)**: Doctor-prescribed medicines, instructions, and adherence stats.
4. **Health Overview (`health.tsx`)**: Blood glucose readings, ambulatory summary, and appointments.
5. **Profile (`profile.tsx`)**: Caregiver account info, linked patients list, permission viewer, and sign out.

---

## 5. Implementation Roadmap
1. **Database & Contracts:** Apply migration and update `packages/contracts/src/index.ts`.
2. **Backend Services & Routes:** Update `evaluator.ts`, `caregivers.routes.ts`, and caregiver endpoints.
3. **Mobile Client Services:** Create `apps/mobile/src/api/caregiver.ts`.
4. **Mobile Screens:** Implement dedicated caregiver tabs (`index.tsx`, `tasks.tsx`, `medications.tsx`, `health.tsx`, `profile.tsx`).
5. **Patient Profile Enhancement:** Update `profile.tsx` with permission editing, last accessed timestamp, and audit action viewer.
6. **Testing & Verification:** Comprehensive automated test suite (`p3_caregiver_experience.test.ts`), mobile tests, full monorepo regression, and implementation report.

